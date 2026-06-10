#!/usr/bin/env python3
"""
Quick test of HTML generation without needing Jupyter running.
This creates a standalone HTML file you can open in a browser.
"""
from __future__ import annotations

import sys
import webbrowser
from pathlib import Path

# Add parent directory to path
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak


def main():
    # Create a simple GeoJSON map spec
    neighborhoods = ak.GeoJSON(
        "neighborhoods",
        url="/examples/data/neighborhoods.geojson",
        coordinate_format="EPSG:4326",
        layer_type="polygons",
    )

    spec = ak.Spec(
        metadata=ak.Metadata(
            title="Simple GeoJSON Map - HTML Test",
            description="Test of HTML generation and browser rendering",
        ),
        workspace=ak.Workspace(name="html_test", coordinate_format="EPSG:4326"),
        data=[neighborhoods],
        views=[
            ak.Map(
                name="test_map",
                camera=ak.Camera(pitch=0, bearing=0, zoom=12),
                layers=[
                    ak.Layer(neighborhoods, id="neighborhoods_layer", type="polygons").style(
                        color="#4a90e2", opacity=0.7, strokeColor="#2c5aa0", strokeWidth=2
                    )
                ],
            )
        ],
    )

    # Save HTML to tmp directory
    output_path = Path("/tmp/autark_html_test.html")

    # Option 1: Use default runtime URL (requires local server)
    # spec.save_html(output_path)

    # Option 2: Use explicit runtime URL for local testing
    # You'll need to start a local server first:
    # cd /Users/csilva/src/autark && python -m http.server 8000
    spec.save_html(
        output_path,
        runtime_url="http://localhost:8000/autk-runtime/dist/autk-runtime.js"
    )

    print(f"✅ HTML saved to: {output_path}")
    print(f"   File size: {output_path.stat().st_size} bytes")
    print()
    print("To view:")
    print(f"  1. Start a local server from repo root:")
    print(f"     cd /Users/csilva/src/autark && python -m http.server 8000")
    print(f"  2. Open in browser:")
    print(f"     open {output_path}")
    print()
    print("Or just run with --open flag to auto-open")

    # Check if --open flag passed
    if len(sys.argv) > 1 and sys.argv[1] == "--open":
        print(f"\nOpening in browser...")
        webbrowser.open(str(output_path))


if __name__ == "__main__":
    main()
