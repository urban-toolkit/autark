#!/usr/bin/env python3
"""
OSMnx to Autark Workflow Example

Demonstrates:
- Downloading a small street network with OSMnx
- Computing edge speed and travel-time attributes
- Converting the OSMnx graph to GeoPandas GeoDataFrames
- Serializing GeoDataFrames as inline Autark GeoJSON sources
- Rendering the network with an interactive Autark map and table
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import autark as ak

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_osmnx_network(
    *,
    latitude: float,
    longitude: float,
    distance: int,
    network_type: str,
) -> tuple[object, object]:
    """Fetch an OSMnx network and return node/edge GeoDataFrames."""
    try:
        import osmnx as ox
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "This example requires OSMnx and GeoPandas. "
            "Use the local '.venv-osmnx' environment or install osmnx in your Python environment."
        ) from exc

    # OSMnx otherwise creates a ./cache directory in the current working
    # directory. Keep generated Overpass responses out of the repo.
    ox.settings.use_cache = True
    ox.settings.cache_folder = "/tmp/autark-osmnx-cache"

    graph = ox.graph_from_point(
        (latitude, longitude),
        dist=distance,
        network_type=network_type,
        simplify=True,
    )
    graph = ox.add_edge_speeds(graph)
    graph = ox.add_edge_travel_times(graph)

    nodes, edges = ox.graph_to_gdfs(graph)
    return nodes.reset_index(), edges.reset_index()


def build_spec(
    *,
    latitude: float = 40.7128,
    longitude: float = -74.0060,
    distance: int = 200,
    network_type: str = "walk",
) -> ak.Spec:
    """Build an Autark spec from an OSMnx street network."""
    nodes_gdf, edges_gdf = _load_osmnx_network(
        latitude=latitude,
        longitude=longitude,
        distance=distance,
        network_type=network_type,
    )

    edges = ak.GeoJSON.from_geopandas(
        "street_edges",
        edges_gdf,
        layer_type="polylines",
    )
    nodes = ak.GeoJSON.from_geopandas(
        "street_nodes",
        nodes_gdf,
        layer_type="points",
    )

    return ak.Spec(
        metadata=ak.Metadata(
            title="OSMnx Walk Network in Autark",
            description=(
                "OSMnx downloads and analyzes a street network; Autark renders "
                "the resulting GeoDataFrames as an interactive map and table."
            ),
            created="2026-06-11",
        ),
        workspace=ak.Workspace(name="osmnx_autark_workflow", coordinate_format="EPSG:4326"),
        data=[edges, nodes],
        views=[
            ak.Map(
                name="network_map",
                camera=ak.Camera(zoom=13),
                layers=[
                    ak.Layer("street_edges", id="edges", type="polylines").style(
                        color="#3949ab",
                        width=6,
                        opacity=0.9,
                    ),
                    ak.Layer("street_nodes", id="nodes", type="points").style(
                        color="#f57c00",
                        size=3,
                        opacity=0.85,
                    ),
                ],
            ),
            ak.Table(
                "street_edges",
                name="edge_table",
                columns=["u", "v", "length", "speed_kph", "travel_time", "highway"],
                sort={"column": "travel_time", "direction": "desc"},
            ),
        ],
        layout=ak.Layout(type="vertical"),
    )


def main() -> None:
    """Generate and optionally save the OSMnx/Autark specification."""
    parser = argparse.ArgumentParser(
        description="Generate an Autark visualization from a small OSMnx street network."
    )
    parser.add_argument("--latitude", type=float, default=40.7128)
    parser.add_argument("--longitude", type=float, default=-74.0060)
    parser.add_argument("--distance", type=int, default=200, help="Network radius in meters.")
    parser.add_argument("--network-type", default="walk", help="OSMnx network type.")
    parser.add_argument("--output", type=Path, help="Write the generated JSON spec to this path.")
    parser.add_argument("--html", type=Path, help="Write the generated embedded HTML to this path.")
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate the spec against the JSON schema.",
    )
    args = parser.parse_args()

    try:
        spec = build_spec(
            latitude=args.latitude,
            longitude=args.longitude,
            distance=args.distance,
            network_type=args.network_type,
        )
    except Exception as exc:
        print(f"Failed to build OSMnx/Autark example: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.validate:
        try:
            schema_path = REPO_ROOT / "schema" / "autark-spec-v0.1.json"
            spec.validate(schema_path)
            print("Spec validation passed.")
        except Exception as exc:
            print(f"Validation failed: {exc}", file=sys.stderr)
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
