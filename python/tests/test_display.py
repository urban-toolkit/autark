from __future__ import annotations

import unittest

import autark as ak
from autark.display import _resolve_data_urls
from autark.widget import _WIDGET_ESM


def _inline_spec() -> ak.AutarkSpec:
    inline = ak.GeoJSON(
        "inline_polys",
        values={"type": "FeatureCollection", "features": []},
        coordinate_format="EPSG:4326",
        layer_type="polygons",
    )
    return ak.Spec(
        metadata=ak.Metadata(title="Display test"),
        workspace=ak.Workspace(coordinate_format="EPSG:4326"),
        data=[inline],
        views=[ak.Map(layers=[ak.Layer(inline, type="polygons")])],
    )


class ResolveDataUrlsTests(unittest.TestCase):
    def test_rewrites_root_relative_urls_against_runtime_origin(self) -> None:
        spec = {"data": [{"name": "n", "url": "/examples/data/x.geojson"}]}
        out = _resolve_data_urls(spec, "http://localhost:8000/runtime.js")
        self.assertEqual(out["data"][0]["url"], "http://localhost:8000/examples/data/x.geojson")
        # Original is not mutated.
        self.assertEqual(spec["data"][0]["url"], "/examples/data/x.geojson")

    def test_leaves_absolute_urls_and_inline_values_alone(self) -> None:
        spec = {"data": [{"name": "a", "url": "https://example.com/x.csv"}, {"name": "b", "values": []}]}
        out = _resolve_data_urls(spec, "http://localhost:8000/runtime.js")
        self.assertEqual(out["data"][0]["url"], "https://example.com/x.csv")
        self.assertNotIn("url", out["data"][1])


class EmbeddedHtmlTests(unittest.TestCase):
    def setUp(self) -> None:
        if not _WIDGET_ESM.exists():
            self.skipTest("widget bundle not built (cd autk-runtime && npm run build:widget)")

    def test_embeds_runtime_and_spec(self) -> None:
        html = ak.to_embedded_html(_inline_spec())
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("Display test", html)
        self.assertIn("inline_polys", html)
        # Runtime is inlined, not loaded from a dev server.
        self.assertNotIn("autk-runtime/dist/autk-runtime.js", html)
        # The bundle is larger than 1MB; the document must contain it.
        self.assertGreater(len(html), 1_000_000)

    def test_script_content_is_script_safe(self) -> None:
        html = ak.to_embedded_html(_inline_spec())
        body = html.split("<script type=\"module\">", 1)[1]
        self.assertNotIn("</script>", body.rsplit("</script>", 1)[0])

    def test_save_html_defaults_to_embedded(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "viz.html"
            _inline_spec().save_html(out)
            content = out.read_text(encoding="utf-8")
            self.assertIn("<!DOCTYPE html>", content)
            self.assertNotIn("autk-runtime/dist/autk-runtime.js", content)

    def test_save_html_with_runtime_url_uses_dev_server_mode(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "viz.html"
            _inline_spec().save_html(out, runtime_url="http://localhost:8000/autk-runtime/dist/autk-runtime.js")
            content = out.read_text(encoding="utf-8")
            self.assertIn("autk-runtime/dist/autk-runtime.js", content)
            self.assertLess(len(content), 100_000)


if __name__ == "__main__":
    unittest.main()
