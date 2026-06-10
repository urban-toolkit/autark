#!/usr/bin/env python3
"""
GeoPandas Workflow Example

Demonstrates:
- Loading polygon data with GeoPandas
- Loading and filtering tabular point data with pandas
- Joining derived pandas/geospatial results back to a GeoDataFrame
- Visualizing processed GeoDataFrames with Autark
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "examples" / "data"


def _load_processed_data() -> tuple[object, object]:
    """Load sample data and return processed neighborhood/tree GeoDataFrames."""
    try:
        import geopandas as gpd
        import pandas as pd
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "This example requires pandas and geopandas. "
            "Use the 'urban' conda environment or install them in your Python environment."
        ) from exc

    neighborhoods = gpd.read_file(DATA_DIR / "neighborhoods.geojson")
    if neighborhoods.crs is None:
        neighborhoods = neighborhoods.set_crs("EPSG:4326")

    trees_df = pd.read_csv(DATA_DIR / "trees.csv")

    # pandas processing step: keep common street-tree species and add a simple
    # analysis field that can be plotted or inspected downstream.
    focus_species = {"oak", "maple", "elm"}
    trees_df = trees_df[trees_df["species"].isin(focus_species)].copy()
    trees_df["species_rank"] = trees_df["species"].map({"oak": 3, "maple": 2, "elm": 1}).astype(int)

    trees = gpd.GeoDataFrame(
        trees_df,
        geometry=gpd.points_from_xy(trees_df["longitude"], trees_df["latitude"]),
        crs="EPSG:4326",
    )

    joined = gpd.sjoin(
        trees[["id", "species", "species_rank", "geometry"]],
        neighborhoods[["name", "geometry"]],
        how="left",
        predicate="within",
    )
    counts = (
        joined.dropna(subset=["name"])
        .groupby("name")
        .agg(tree_count=("id", "count"), avg_species_rank=("species_rank", "mean"))
        .reset_index()
    )

    neighborhoods = neighborhoods.merge(counts, on="name", how="left")
    neighborhoods["tree_count"] = neighborhoods["tree_count"].fillna(0).astype(int)
    neighborhoods["avg_species_rank"] = neighborhoods["avg_species_rank"].fillna(0.0)
    neighborhoods = neighborhoods[neighborhoods["tree_count"] > 0].copy()

    return neighborhoods, trees


def build_spec() -> ak.Spec:
    """Build a GeoPandas-driven Autark specification."""
    neighborhoods_gdf, trees_gdf = _load_processed_data()

    neighborhoods = ak.GeoJSON.from_geopandas(
        "neighborhoods",
        neighborhoods_gdf,
        layer_type="polygons",
    )
    trees = ak.GeoJSON.from_geopandas(
        "trees",
        trees_gdf,
        layer_type="points",
    )

    return ak.Spec(
        metadata=ak.Metadata(
            title="GeoPandas Neighborhood Tree Counts",
            description=(
                "Loads neighborhoods with GeoPandas, filters tree records with pandas, "
                "computes per-neighborhood counts, and visualizes the processed result."
            ),
            created="2026-06-10",
        ),
        workspace=ak.Workspace(name="geopandas_workflow", coordinate_format="EPSG:4326"),
        data=[neighborhoods, trees],
        views=[
            ak.Map(
                name="neighborhood_tree_map",
                camera=ak.Camera(pitch=0, bearing=0, zoom=13),
                layers=[
                    ak.Layer(neighborhoods, id="neighborhoods_layer", type="polygons")
                    .encode(
                        color=ak.field(
                            "tree_count",
                            scale=ak.Scale(type="quantile", scheme="greens"),
                        )
                    )
                    .style(opacity=0.75, strokeColor="#243b53", strokeWidth=1),
                    ak.Layer(trees, id="trees_layer", type="points").style(
                        color="#1f9d55",
                        size=5,
                        opacity=0.85,
                    ),
                ],
            ),
            ak.Histogram(
                name="tree_count_histogram",
                source=neighborhoods,
                x="tree_count",
                bins=8,
            ),
        ],
        layout=ak.Layout(type="vertical"),
    )


def main() -> None:
    """Generate and optionally save the specification."""
    parser = argparse.ArgumentParser(
        description="Generate a GeoPandas workflow example spec."
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the generated JSON spec to this path.",
    )
    parser.add_argument(
        "--html",
        type=Path,
        help="Write the generated HTML to this path.",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate the spec against the JSON schema.",
    )
    args = parser.parse_args()

    spec = build_spec()

    if args.validate:
        try:
            schema_path = REPO_ROOT / "schema" / "autark-spec-v0.1.json"
            spec.validate(schema_path)
            print("Spec validation passed.")
        except Exception as exc:
            print(f"Validation failed: {exc}")
            sys.exit(1)

    if args.output:
        spec.save_json(args.output)
        print(f"JSON spec saved to: {args.output}")

    if args.html:
        spec.save_html(args.html)
        print(f"HTML saved to: {args.html}")

    if not args.output and not args.html:
        print(spec.to_json())


if __name__ == "__main__":
    main()
