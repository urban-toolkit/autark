from __future__ import annotations

import json
import unittest
from typing import Any

import autark as ak
from autark.data import _jsonable


class _NumpyLikeScalar:
    """Mimics a numpy scalar: not JSON serializable, exposes .item()."""

    def __init__(self, value: Any) -> None:
        self._value = value

    def item(self) -> Any:
        return self._value


class _FakeCrs:
    def __init__(self, epsg: int) -> None:
        self._epsg = epsg

    def to_epsg(self) -> int:
        return self._epsg


class _FakeGeoDataFrame:
    """Duck-typed GeoDataFrame: __geo_interface__ + optional crs/to_crs."""

    def __init__(self, features: list[dict[str, Any]], crs: _FakeCrs | None = None) -> None:
        self._features = features
        self.crs = crs
        self.reprojected_to: int | None = None

    @property
    def __geo_interface__(self) -> dict[str, Any]:
        return {"type": "FeatureCollection", "features": self._features}

    def to_crs(self, epsg: int) -> "_FakeGeoDataFrame":
        out = _FakeGeoDataFrame(self._features, crs=_FakeCrs(epsg))
        out.reprojected_to = epsg
        return out


class _FakeDataFrame:
    """Duck-typed DataFrame: to_dict('records')."""

    def __init__(self, records: list[dict[str, Any]]) -> None:
        self._records = records

    def to_dict(self, orient: str) -> list[dict[str, Any]]:
        assert orient == "records"
        return self._records


POLYGON_FEATURE = {
    "type": "Feature",
    "properties": {"name": "a", "score": _NumpyLikeScalar(7)},
    "geometry": {
        "type": "Polygon",
        "coordinates": (((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0)),),
    },
}


class JsonableTests(unittest.TestCase):
    def test_unwraps_numpy_like_scalars_and_tuples(self) -> None:
        out = _jsonable({"a": _NumpyLikeScalar(3), "b": (1.0, 2.0)})
        self.assertEqual(out, {"a": 3, "b": [1.0, 2.0]})
        json.dumps(out)  # must be JSON serializable

    def test_non_finite_floats_become_null(self) -> None:
        self.assertIsNone(_jsonable(float("nan")))
        self.assertIsNone(_jsonable(float("inf")))


class FromGeopandasTests(unittest.TestCase):
    def test_builds_inline_source_and_infers_layer_type(self) -> None:
        gdf = _FakeGeoDataFrame([POLYGON_FEATURE])
        source = ak.GeoJSON.from_geopandas("neigh", gdf)
        assert source.values is not None
        self.assertEqual(source.layer_type, "polygons")
        feature = source.values["features"][0]
        self.assertEqual(feature["properties"], {"name": "a", "score": 7})
        json.dumps(source.to_dict())  # spec fragment must serialize

    def test_reprojects_when_crs_differs(self) -> None:
        gdf = _FakeGeoDataFrame([POLYGON_FEATURE], crs=_FakeCrs(3857))
        source = ak.GeoJSON.from_geopandas("neigh", gdf)
        self.assertEqual(source.coordinate_format, "EPSG:4326")

    def test_keeps_crs_when_already_wgs84(self) -> None:
        gdf = _FakeGeoDataFrame([POLYGON_FEATURE], crs=_FakeCrs(4326))
        source = ak.GeoJSON.from_geopandas("neigh", gdf)
        self.assertEqual(source.coordinate_format, "EPSG:4326")

    def test_rejects_objects_without_geo_interface(self) -> None:
        with self.assertRaisesRegex(TypeError, "__geo_interface__"):
            ak.GeoJSON.from_geopandas("bad", object())

    def test_mixed_geometries_require_explicit_layer_type(self) -> None:
        point_feature = {
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "Point", "coordinates": (0.0, 0.0)},
        }
        gdf = _FakeGeoDataFrame([POLYGON_FEATURE, point_feature])
        with self.assertRaisesRegex(ValueError, "layer_type"):
            ak.GeoJSON.from_geopandas("mixed", gdf)
        source = ak.GeoJSON.from_geopandas("mixed", gdf, layer_type="polygons")
        self.assertEqual(source.layer_type, "polygons")


class FromDataframeTests(unittest.TestCase):
    def test_builds_point_features_from_records(self) -> None:
        df = _FakeDataFrame(
            [
                {"lat": 40.7, "lon": -74.0, "species": "oak", "height": _NumpyLikeScalar(12)},
                {"lat": 40.8, "lon": -74.1, "species": "elm", "height": float("nan")},
            ]
        )
        source = ak.GeoJSON.from_dataframe("trees", df, latitude="lat", longitude="lon")
        assert source.values is not None
        features = source.values["features"]
        self.assertEqual(len(features), 2)
        self.assertEqual(features[0]["geometry"], {"type": "Point", "coordinates": [-74.0, 40.7]})
        self.assertEqual(features[0]["properties"], {"species": "oak", "height": 12})
        self.assertIsNone(features[1]["properties"]["height"])  # NaN -> null
        self.assertEqual(source.layer_type, "points")
        json.dumps(source.to_dict())

    def test_respects_explicit_property_selection(self) -> None:
        df = _FakeDataFrame([{"lat": 1.0, "lon": 2.0, "keep": "yes", "drop": "no"}])
        source = ak.GeoJSON.from_dataframe(
            "pts", df, latitude="lat", longitude="lon", properties=["keep"]
        )
        assert source.values is not None
        self.assertEqual(source.values["features"][0]["properties"], {"keep": "yes"})

    def test_missing_coordinate_column_raises(self) -> None:
        df = _FakeDataFrame([{"lat": 1.0}])
        with self.assertRaises(KeyError):
            ak.GeoJSON.from_dataframe("pts", df, latitude="lat", longitude="lon")


class RealPandasTests(unittest.TestCase):
    def test_round_trip_with_real_pandas(self) -> None:
        try:
            import pandas as pd
        except ModuleNotFoundError:
            self.skipTest("pandas not installed")
        df = pd.DataFrame({"lat": [40.7], "lon": [-74.0], "species": ["oak"]})
        source = ak.GeoJSON.from_dataframe("trees", df, latitude="lat", longitude="lon")
        assert source.values is not None
        self.assertEqual(
            source.values["features"][0]["geometry"]["coordinates"], [-74.0, 40.7]
        )
        json.dumps(source.to_dict())


if __name__ == "__main__":
    unittest.main()
