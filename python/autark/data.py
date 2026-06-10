from __future__ import annotations

import math
from dataclasses import dataclass, field as dataclass_field
from typing import Any, Literal, Mapping, Sequence

from ._serialise import Serializable, exactly_one

OsmLayer = Literal["buildings", "roads", "parks", "water", "surface"]

LayerType = Literal["polygons", "polylines", "points", "buildings"]

_GEOMETRY_LAYER_TYPES: dict[str, LayerType] = {
    "Polygon": "polygons",
    "MultiPolygon": "polygons",
    "LineString": "polylines",
    "MultiLineString": "polylines",
    "Point": "points",
    "MultiPoint": "points",
}


def _jsonable(value: Any) -> Any:
    """Convert pandas/numpy-laden structures into plain JSON-safe values.

    numpy scalars are unwrapped, non-finite floats become null (JSON.parse in
    browsers rejects NaN/Infinity), tuples become lists, and unknown objects
    fall back to their string representation.
    """
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    item_getter = getattr(value, "item", None)
    if callable(item_getter):
        # numpy scalar (e.g. int64/float64/bool_)
        return _jsonable(item_getter())
    return str(value)


def _infer_layer_type(features: Sequence[Mapping[str, Any]]) -> LayerType:
    geometry_types = {
        str((feature.get("geometry") or {}).get("type")) for feature in features
    }
    layer_types = {_GEOMETRY_LAYER_TYPES.get(g) for g in geometry_types}
    layer_types.discard(None)
    if len(layer_types) != 1:
        raise ValueError(
            f"Cannot infer layer_type from geometry types {sorted(geometry_types)}; "
            "pass layer_type explicitly"
        )
    (layer_type,) = layer_types
    assert layer_type is not None
    return layer_type


@dataclass(frozen=True)
class LatLngGeometry(Serializable):
    latitude: str
    longitude: str
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["latlng"] = "latlng"


@dataclass(frozen=True)
class WktGeometry(Serializable):
    column: str
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["wkt"] = "wkt"


def latlng(latitude: str, longitude: str, coordinate_format: str | None = None) -> LatLngGeometry:
    return LatLngGeometry(latitude=latitude, longitude=longitude, coordinate_format=coordinate_format)


def wkt(column: str, coordinate_format: str | None = None) -> WktGeometry:
    return WktGeometry(column=column, coordinate_format=coordinate_format)


@dataclass(frozen=True)
class OSM(Serializable):
    name: str
    area: str
    layers: list[OsmLayer]
    geocode_area: str | None = dataclass_field(default=None, metadata={"json": "geocodeArea"})
    areas: list[str] | None = None
    source: Literal["overpass", "pbf"] | None = None
    pbf_file_url: str | None = dataclass_field(default=None, metadata={"json": "pbfFileUrl"})
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["osm"] = "osm"

    def __post_init__(self) -> None:
        if not self.layers:
            raise ValueError("OSM requires at least one layer")
        if self.areas is not None and not self.areas:
            raise ValueError("OSM areas must not be empty")
        if self.source == "pbf" and not self.pbf_file_url:
            raise ValueError("OSM with source='pbf' requires pbf_file_url")

    def layer_source(self, layer: OsmLayer) -> str:
        return f"{self.name}_{layer}"


@dataclass(frozen=True)
class GeoJSON(Serializable):
    name: str
    url: str | None = None
    values: dict[str, Any] | None = None
    layer_type: LayerType | None = dataclass_field(
        default=None,
        metadata={"json": "layerType"},
    )
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["geojson"] = "geojson"

    def __post_init__(self) -> None:
        exactly_one("GeoJSON", self.url, self.values, "url", "values")

    @classmethod
    def from_geopandas(
        cls,
        name: str,
        gdf: Any,
        *,
        layer_type: LayerType | None = None,
        coordinate_format: str | None = None,
    ) -> "GeoJSON":
        """Create an inline GeoJSON source from a GeoDataFrame.

        The GeoDataFrame is reprojected to EPSG:4326 when its CRS is known and
        differs, and serialized through ``__geo_interface__``, so this works
        with geopandas without autark depending on it.

        @param name: Data source name referenced by views/transforms.
        @param gdf: A geopandas GeoDataFrame (or anything exposing
            ``__geo_interface__``; ``crs``/``to_crs`` are used when present).
        @param layer_type: Layer type; inferred from the geometries if omitted.
        @param coordinate_format: Coordinate format; defaults to EPSG:4326 when
            the CRS is known (after reprojection).
        @returns A GeoJSON data source with inline values.
        @example
        gdf = geopandas.read_file("neighborhoods.shp")
        source = ak.GeoJSON.from_geopandas("neighborhoods", gdf)
        """
        crs = getattr(gdf, "crs", None)
        if crs is not None:
            epsg = crs.to_epsg() if hasattr(crs, "to_epsg") else None
            if epsg != 4326 and callable(getattr(gdf, "to_crs", None)):
                gdf = gdf.to_crs(epsg=4326)
            if coordinate_format is None:
                coordinate_format = "EPSG:4326"

        geo = getattr(gdf, "__geo_interface__", None)
        if not isinstance(geo, Mapping):
            raise TypeError(
                f"from_geopandas expects an object with __geo_interface__, got {type(gdf).__name__}"
            )
        collection = _jsonable(geo)
        features = collection.get("features", [])
        if layer_type is None:
            layer_type = _infer_layer_type(features)
        return cls(
            name,
            values={"type": "FeatureCollection", "features": features},
            layer_type=layer_type,
            coordinate_format=coordinate_format,
        )

    @classmethod
    def from_dataframe(
        cls,
        name: str,
        df: Any,
        *,
        latitude: str,
        longitude: str,
        properties: Sequence[str] | None = None,
        coordinate_format: str = "EPSG:4326",
    ) -> "GeoJSON":
        """Create an inline points source from a DataFrame with lat/lng columns.

        Rows are converted into GeoJSON Point features (the runtime supports
        inline GeoJSON, unlike inline CSV). Works with pandas without autark
        depending on it.

        @param name: Data source name referenced by views/transforms.
        @param df: A pandas DataFrame (or anything with ``to_dict("records")``).
        @param latitude: Column holding latitudes.
        @param longitude: Column holding longitudes.
        @param properties: Columns to keep as feature properties; defaults to
            every column except the coordinate columns.
        @param coordinate_format: Coordinate format of the lat/lng values.
        @returns A GeoJSON data source with inline point features.
        @example
        df = pandas.read_csv("trees.csv")
        source = ak.GeoJSON.from_dataframe("trees", df, latitude="lat", longitude="lon")
        """
        to_dict = getattr(df, "to_dict", None)
        if not callable(to_dict):
            raise TypeError(
                f"from_dataframe expects an object with to_dict('records'), got {type(df).__name__}"
            )
        records = to_dict("records")

        features = []
        for row in records:
            if latitude not in row or longitude not in row:
                raise KeyError(
                    f"Row is missing coordinate column {latitude!r} or {longitude!r}"
                )
            keys = properties if properties is not None else [k for k in row if k not in (latitude, longitude)]
            features.append(
                {
                    "type": "Feature",
                    "properties": {str(key): _jsonable(row[key]) for key in keys},
                    "geometry": {
                        "type": "Point",
                        "coordinates": [_jsonable(row[longitude]), _jsonable(row[latitude])],
                    },
                }
            )
        return cls(
            name,
            values={"type": "FeatureCollection", "features": features},
            layer_type="points",
            coordinate_format=coordinate_format,
        )


@dataclass(frozen=True)
class CSV(Serializable):
    name: str
    url: str | None = None
    values: list[list[Any]] | None = None
    delimiter: str | None = None
    geometry: LatLngGeometry | WktGeometry | None = None
    type: Literal["csv"] = "csv"

    def __post_init__(self) -> None:
        exactly_one("CSV", self.url, self.values, "url", "values")


@dataclass(frozen=True)
class JSON(Serializable):
    name: str
    url: str | None = None
    values: list[Any] | None = None
    geometry: LatLngGeometry | WktGeometry | None = None
    type: Literal["json"] = "json"

    def __post_init__(self) -> None:
        exactly_one("JSON", self.url, self.values, "url", "values")


@dataclass(frozen=True)
class GeoTIFF(Serializable):
    name: str
    url: str
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    max_pixels: int | None = dataclass_field(default=None, metadata={"json": "maxPixels"})
    type: Literal["geotiff"] = "geotiff"
