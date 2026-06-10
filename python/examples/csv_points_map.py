#!/usr/bin/env python3
"""
CSV Points Visualization Example

Demonstrates:
- Loading CSV data with lat/lng columns
- Creating point geometries from coordinates
- Visualizing points on a map
- Styling point markers (color, size, opacity)
- Adding a histogram of point attributes
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak


def build_spec() -> ak.Spec:
    """Build a CSV points visualization specification."""
    # Define the CSV data source with lat/lng geometry
    trees = ak.CSV(
        "trees",
        url="/examples/data/trees.csv",
        geometry=ak.latlng(
            "latitude",
            "longitude",
            coordinate_format="EPSG:4326"
        )
    )

    # Create the specification with map and histogram
    return ak.Spec(
        metadata=ak.Metadata(
            title="CSV Points Visualization",
            description="Street trees shown as points on a map with a latitude distribution histogram.",
            created="2026-06-10",
        ),
        workspace=ak.Workspace(
            name="csv_points",
            coordinate_format="EPSG:4326"
        ),
        data=[trees],
        views=[
            # Map view with point layer
            ak.Map(
                name="tree_map",
                camera=ak.Camera(
                    pitch=0,
                    bearing=0,
                    zoom=13
                ),
                layers=[
                    ak.Layer(trees, id="trees_layer", type="points")
                        .style(
                            color="#27ae60",  # Green
                            size=5,
                            opacity=0.8
                        )
                ]
            ),
            # Histogram of latitude values
            ak.Histogram(
                name="latitude_histogram",
                source=trees,
                x="latitude",
                bins=25
            )
        ],
        # Stack views vertically
        layout=ak.Layout(type="vertical")
    )


def main() -> None:
    """Generate and optionally save the specification."""
    parser = argparse.ArgumentParser(
        description="Generate a CSV points visualization example spec."
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
