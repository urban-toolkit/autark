from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak


def build_spec() -> ak.Spec:
    neighborhoods = ak.GeoJSON(
        "neighborhoods",
        url="/examples/data/neighborhoods.geojson",
        coordinate_format="EPSG:4326",
        layer_type="polygons",
    )
    trees = ak.CSV(
        "trees",
        url="/examples/data/trees.csv",
        geometry=ak.latlng("latitude", "longitude", coordinate_format="EPSG:4326"),
    )
    brush = ak.interval("tree_count_brush")

    return ak.Spec(
        metadata=ak.Metadata(
            title="Spatial Join - Trees per Neighborhood",
            description=(
                "Demonstrates spatial join between neighborhoods and tree points, "
                "aggregating tree counts and visualizing on a thematic map."
            ),
            created="2026-06-07",
        ),
        workspace=ak.Workspace(name="spatial_join_demo", coordinate_format="EPSG:4326"),
        data=[neighborhoods, trees],
        transforms=[
            ak.SpatialJoin(
                root=neighborhoods,
                join=trees,
                group_by=[
                    ak.count(),
                    ak.collect("species", as_="tree_species"),
                ],
            )
        ],
        views=[
            ak.Map(
                name="neighborhood_map",
                camera=ak.Camera(pitch=0, bearing=0, zoom=12),
                layers=[
                    ak.Layer("neighborhoods", id="neighborhoods_layer", type="polygons")
                    .encode(
                        color=ak.field(
                            "properties.sjoin.count.trees",
                            scale=ak.Scale(type="quantile", scheme="greens", domain_strategy="minMax"),
                        )
                    )
                    .style(opacity=0.8, strokeColor="#333333", strokeWidth=1),
                    ak.Layer(trees, id="trees_layer", type="points").style(
                        color="#228B22",
                        size=3,
                        opacity=0.6,
                    ),
                ],
            ),
            ak.Histogram(
                name="tree_count_histogram",
                source=neighborhoods,
                x="sjoin.count.trees",
                bins=20,
                selection=brush,
            ),
        ],
        links=[
            ak.Link(brush, target="neighborhoods_layer", action="highlight"),
        ],
        layout=ak.Layout(type="vertical"),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Autark spatial join example spec.")
    parser.add_argument("--output", type=Path, help="Write the generated JSON spec to this path.")
    args = parser.parse_args()

    spec = build_spec()
    if args.output:
        spec.save_json(args.output)
    else:
        print(spec.to_json())


if __name__ == "__main__":
    main()
