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


if __name__ == "__main__":
    unittest.main()
