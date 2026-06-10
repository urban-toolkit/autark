from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field
from typing import Any, Literal

from ._serialise import Serializable, exactly_one

OsmLayer = Literal["buildings", "roads", "parks", "water", "surface"]


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
    source: Literal["overpass", "pbf"] | None = None
    pbf_file_url: str | None = dataclass_field(default=None, metadata={"json": "pbfFileUrl"})
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["osm"] = "osm"

    def __post_init__(self) -> None:
        if not self.layers:
            raise ValueError("OSM requires at least one layer")
        if self.source == "pbf" and not self.pbf_file_url:
            raise ValueError("OSM with source='pbf' requires pbf_file_url")

    def layer_source(self, layer: OsmLayer) -> str:
        return f"{self.name}_{layer}"


@dataclass(frozen=True)
class GeoJSON(Serializable):
    name: str
    url: str | None = None
    values: dict[str, Any] | None = None
    layer_type: Literal["polygons", "polylines", "points", "buildings"] | None = dataclass_field(
        default=None,
        metadata={"json": "layerType"},
    )
    coordinate_format: str | None = dataclass_field(default=None, metadata={"json": "coordinateFormat"})
    type: Literal["geojson"] = "geojson"

    def __post_init__(self) -> None:
        exactly_one("GeoJSON", self.url, self.values, "url", "values")


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
