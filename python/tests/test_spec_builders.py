from __future__ import annotations

import json
import unittest
from pathlib import Path

import autark as ak
from examples.spatial_join import build_spec

ROOT = Path(__file__).resolve().parents[2]


class SpecBuilderTests(unittest.TestCase):
    def test_builds_spatial_join_example(self) -> None:
        expected = json.loads((ROOT / "examples/specs/03-spatial-join.json").read_text())
        self.assertEqual(build_spec().to_dict(), expected)

    def test_validates_against_current_schema_when_jsonschema_is_installed(self) -> None:
        try:
            import jsonschema  # noqa: F401
        except ModuleNotFoundError:
            self.skipTest("jsonschema is not installed")
        build_spec().validate(ROOT / "schema/autark-spec-v0.1.json")

    def test_data_sources_require_url_or_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "exactly one"):
            ak.GeoJSON("bad")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            ak.CSV("bad", url="a.csv", values=[["x"]])
        with self.assertRaisesRegex(ValueError, "exactly one"):
            ak.JSON("bad")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            ak.JSON("bad", url="a.json", values=[{"id": 1}])

    def test_json_and_geotiff_builders(self) -> None:
        records = ak.JSON(
            "events",
            values=[{"id": 1, "lat": 40.7, "lon": -74.0}],
            geometry=ak.latlng("lat", "lon", coordinate_format="EPSG:4326"),
        )
        raster = ak.GeoTIFF(
            "lst",
            url="data/lst.tif",
            coordinate_format="EPSG:4326",
            max_pixels=1_000_000,
        )

        self.assertEqual(
            records.to_dict(),
            {
                "name": "events",
                "values": [{"id": 1, "lat": 40.7, "lon": -74.0}],
                "geometry": {
                    "latitude": "lat",
                    "longitude": "lon",
                    "coordinateFormat": "EPSG:4326",
                    "type": "latlng",
                },
                "type": "json",
            },
        )
        self.assertEqual(
            ak.JSON("events", url="data/events.json").to_dict(),
            {
                "name": "events",
                "url": "data/events.json",
                "type": "json",
            },
        )
        self.assertEqual(
            raster.to_dict(),
            {
                "name": "lst",
                "url": "data/lst.tif",
                "coordinateFormat": "EPSG:4326",
                "maxPixels": 1_000_000,
                "type": "geotiff",
            },
        )

    def test_osm_layer_source_uses_locked_table_naming(self) -> None:
        osm = ak.OSM("manhattan_osm", area="Manhattan, New York", layers=["buildings", "roads"])
        self.assertEqual(osm.layer_source("buildings"), "manhattan_osm_buildings")
        self.assertEqual(ak.Layer(osm.layer_source("roads")).to_dict(), {"source": "manhattan_osm_roads"})

    def test_osm_serializes_explicit_geocode_area_and_relation_areas(self) -> None:
        osm = ak.OSM(
            "nyc_osm",
            area="Battery Park City",
            geocode_area="New York",
            areas=["Battery Park City", "Financial District"],
            layers=["buildings", "roads"],
        )
        self.assertEqual(
            osm.to_dict(),
            {
                "name": "nyc_osm",
                "area": "Battery Park City",
                "layers": ["buildings", "roads"],
                "geocodeArea": "New York",
                "areas": ["Battery Park City", "Financial District"],
                "type": "osm",
            },
        )

    def test_scatterplot_and_table_builders(self) -> None:
        points = ak.GeoJSON(
            "points",
            values={
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"id": 1, "name": "A", "value": 10},
                        "geometry": {"type": "Point", "coordinates": [0, 0]},
                    }
                ],
            },
            layer_type="points",
        )
        selection = ak.interval("scatter_brush")
        spec = ak.Spec(
            data=[points],
            views=[
                ak.Scatterplot(
                    points,
                    x="id",
                    y="value",
                    color="name",
                    selection=selection,
                ),
                ak.Table(
                    points,
                    columns=["id", "name", "value"],
                    sort={"column": "value", "direction": "desc"},
                ),
            ],
        )

        views = spec.to_dict()["views"]
        self.assertEqual(
            views[0],
            {
                "type": "scatterplot",
                "source": "points",
                "x": {"field": "id"},
                "y": {"field": "value"},
                "color": {"field": "name"},
                "selection": {"name": "scatter_brush", "type": "interval"},
            },
        )
        self.assertEqual(
            views[1],
            {
                "type": "table",
                "source": "points",
                "columns": [{"field": "id"}, {"field": "name"}, {"field": "value"}],
                "sort": {"column": "value", "direction": "desc"},
            },
        )

    def test_table_requires_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one column"):
            ak.Table("points", columns=[])

    def test_heatmap_builder(self) -> None:
        points = ak.GeoJSON("points", url="points.geojson", layer_type="points")
        heatmap = ak.Heatmap(
            points,
            output="points_heatmap",
            near=ak.Near(250, use_centroid=True),
            grid=ak.HeatmapGrid(rows=32, columns=24),
            group_by=[ak.count("*", as_="point_count")],
        )

        self.assertEqual(
            heatmap.to_dict(),
            {
                "type": "heatmap",
                "source": "points",
                "output": "points_heatmap",
                "near": {"distance": 250, "useCentroid": True},
                "grid": {"rows": 32, "columns": 24},
                "groupBy": [
                    {
                        "column": "*",
                        "op": "count",
                        "as": "point_count",
                    }
                ],
            },
        )
        with self.assertRaisesRegex(ValueError, "does not support collect"):
            ak.Heatmap(
                points,
                output="bad_heatmap",
                near=ak.Near(250),
                grid=ak.HeatmapGrid(rows=32, columns=24),
                group_by=[ak.collect("name")],
            )

    def test_compute_builders(self) -> None:
        points = ak.GeoJSON("points", url="points.geojson", layer_type="points")

        gpgpu = ak.Compute.gpgpu(
            points,
            output="computed_points",
            layer_type="points",
            variable_mapping={"value": "value"},
            uniforms={"scale": 2},
            wgsl_body="return value * scale;",
            result_field="score",
        )
        render = ak.Compute.render(
            output="visibility",
            layers=[
                {
                    "id": "buildings",
                    "source": "buildings",
                    "type": "buildings",
                    "objectIdProperty": "id",
                }
            ],
            viewpoints={
                "source": "points",
                "strategy": {"type": "centroid"},
                "sampling": {"directions": 8},
            },
            aggregation={"type": "classes", "includeBackground": False},
            tile_size=64,
        )

        self.assertEqual(
            gpgpu.to_dict(),
            {
                "type": "gpgpuCompute",
                "source": "points",
                "output": "computed_points",
                "variableMapping": {"value": "value"},
                "wgslBody": "return value * scale;",
                "layerType": "points",
                "uniforms": {"scale": 2},
                "resultField": "score",
            },
        )
        self.assertEqual(
            render.to_dict(),
            {
                "type": "renderCompute",
                "output": "visibility",
                "layers": [
                    {
                        "id": "buildings",
                        "source": "buildings",
                        "type": "buildings",
                        "objectIdProperty": "id",
                    }
                ],
                "viewpoints": {
                    "source": "points",
                    "strategy": {"type": "centroid"},
                    "sampling": {"directions": 8},
                },
                "aggregation": {"type": "classes", "includeBackground": False},
                "tileSize": 64,
            },
        )
        with self.assertRaisesRegex(ValueError, "exactly one"):
            ak.Compute.gpgpu(
                points,
                output="bad_compute",
                variable_mapping={"value": "value"},
                wgsl_body="return value;",
            )
        with self.assertRaisesRegex(ValueError, "multiple of 8"):
            ak.Compute.render(
                output="bad_render",
                layers=[{"id": "points", "source": "points", "type": "points"}],
                viewpoints={"source": "points"},
                aggregation={"type": "objects"},
                tile_size=10,
            )

    def test_transform_builders_validate_against_current_schema(self) -> None:
        try:
            import jsonschema  # noqa: F401
        except ModuleNotFoundError:
            self.skipTest("jsonschema is not installed")

        points = ak.GeoJSON("points", url="points.geojson", layer_type="points")
        spec = ak.Spec(
            data=[points],
            transforms=[
                ak.Heatmap(
                    points,
                    output="points_heatmap",
                    near=ak.Near(250),
                    grid={"rows": 16, "columns": 16},
                    group_by=[ak.count("*", as_="point_count")],
                ),
                ak.Compute.gpgpu(
                    points,
                    output="computed_points",
                    variable_mapping={"value": "value"},
                    wgsl_body="return value;",
                    output_columns=["score"],
                ),
            ],
            views=[ak.Table("computed_points", columns=["score"])],
        )
        spec.validate(ROOT / "schema/autark-spec-v0.1.json")


if __name__ == "__main__":
    unittest.main()
