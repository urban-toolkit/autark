#!/usr/bin/env python3
"""
Simple GeoJSON Map Example

Demonstrates:
- Loading GeoJSON data from a URL
- Creating a basic map view
- Styling polygon layers with color and opacity
- Setting camera position
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak


def build_spec() -> ak.Spec:
    """Build a simple GeoJSON map specification."""
    # Define the GeoJSON data source
    neighborhoods = ak.GeoJSON(
        "neighborhoods",
        url="/examples/data/neighborhoods.geojson",
        coordinate_format="EPSG:4326",
        layer_type="polygons",
    )

    # Create the specification
    return ak.Spec(
        metadata=ak.Metadata(
            title="Simple GeoJSON Map",
            description="A basic map showing neighborhood polygons with custom styling.",
            created="2026-06-10",
        ),
        workspace=ak.Workspace(
            name="simple_map",
            coordinate_format="EPSG:4326"
        ),
        data=[neighborhoods],
        views=[
            ak.Map(
                name="main_map",
                camera=ak.Camera(
                    pitch=0,
                    bearing=0,
                    zoom=13
                ),
                layers=[
                    ak.Layer(neighborhoods, id="neighborhoods_layer", type="polygons")
                        .style(
                            color="#3498db",      # Blue
                            opacity=0.7,
                            strokeColor="#2c3e50", # Dark blue-grey
                            strokeWidth=2
                        )
                ]
            )
        ]
    )


def main() -> None:
    """Generate and optionally save the specification."""
    parser = argparse.ArgumentParser(
        description="Generate a simple GeoJSON map example spec."
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the generated JSON spec to this path."
    )
    parser.add_argument(
        "--html",
        type=Path,
        help="Write the generated HTML to this path."
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate the spec against the JSON schema."
    )
    args = parser.parse_args()

    # Build the spec
    spec = build_spec()

    # Validate if requested
    if args.validate:
        try:
            # Assumes schema is at ../../schema/autark-spec-v0.1.json
            schema_path = Path(__file__).parents[2] / "schema" / "autark-spec-v0.1.json"
            spec.validate(schema_path)
            print("✅ Spec validation passed!")
        except Exception as e:
            print(f"❌ Validation failed: {e}")
            sys.exit(1)

    # Save to JSON if requested
    if args.output:
        spec.save_json(args.output)
        print(f"✅ JSON spec saved to: {args.output}")

    # Save to HTML if requested
    if args.html:
        spec.save_html(args.html)
        print(f"✅ HTML saved to: {args.html}")

    # Otherwise print to stdout
    if not args.output and not args.html:
        print(spec.to_json())


if __name__ == "__main__":
    main()
