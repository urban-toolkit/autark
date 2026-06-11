• OSMnx is a mature Python geospatial/network analysis library built on GeoPandas, NetworkX, Shapely, and pandas. I’ll
  inspect the key public APIs for graph/geometries conversion so I can give concrete Autark integration examples.

• OSMnx and Autark are complementary, not competitors.

  What OSMnx Is Good At
  OSMnx is a Python analysis library for OpenStreetMap data. Its core strengths are:

  - Downloading OSM street networks by place, point, bbox, polygon.
  - Modeling street networks as NetworkX MultiDiGraphs.
  - Simplifying street topology.
  - Computing network measures: intersections, street length, bearings, connectivity, circuity, etc.
  - Routing and travel-time analysis.
  - Converting graphs to GeoDataFrames with ox.graph_to_gdfs().
  - Querying arbitrary OSM features into GeoDataFrames with ox.features_from_*().

  It is fundamentally a Python geospatial/network analysis tool.

  What Autark Is Good At
  Autark is a browser/runtime visualization and analytics system:

  - WebGPU map rendering.
  - DuckDB-WASM spatial data loading/querying in-browser.
  - Linked maps/plots/tables.
  - Declarative AutarkSpec.
  - Python builders that serialize to JSON/HTML/widgets.
  - Browser-side spatial joins, heatmaps, compute transforms, and interaction.

  It is fundamentally a visual analytics runtime and rendering system.

  Best Way To Use Them Together
  Use OSMnx for Python-side OSM/network analysis, then hand the resulting GeoDataFrames to Autark for interactive
  visualization.

  Example: analyze street network in OSMnx, visualize in Autark.

  import osmnx as ox
  import autark as ak

  # 1. Download/analyze with OSMnx
  G = ox.graph_from_place("Manhattan, New York, USA", network_type="walk")
  G = ox.add_edge_speeds(G)
  G = ox.add_edge_travel_times(G)

  nodes, edges = ox.graph_to_gdfs(G)

  # 2. Convert OSMnx GeoDataFrames into Autark sources
  edges_source = ak.GeoJSON.from_geopandas(
      "walk_edges",
      edges.reset_index(),
      layer_type="polylines",
  )

  nodes_source = ak.GeoJSON.from_geopandas(
      "walk_nodes",
      nodes.reset_index(),
      layer_type="points",
  )

  # 3. Visualize with Autark
  spec = ak.Spec(
      data=[edges_source, nodes_source],
      views=[
          ak.Map(
              layers=[
                  ak.Layer(edges_source, type="polylines").encode(
                      color=ak.field(
                          "travel_time",
                          scale=ak.Scale(type="quantile", scheme="viridis"),
                      )
                  ),
                  ak.Layer(nodes_source, type="points").style(
                      color="#222222",
                      size=2,
                      opacity=0.5,
                  ),
              ]
          ),
          ak.Histogram(edges_source, x="travel_time", bins=30),
      ],
      layout=ak.Layout(type="vertical"),
  )

  Another good workflow: use OSMnx to compute metrics, then use Autark plots/tables.

  import osmnx as ox
  import autark as ak

  G = ox.graph_from_place("Cambridge, Massachusetts, USA", network_type="drive")
  stats = ox.basic_stats(G)

  # Convert scalar stats to a table-like inline GeoJSON or simple DataFrame workflow
  nodes, edges = ox.graph_to_gdfs(G)
  edges = edges.reset_index()
  edges["speed_kph"] = edges["speed_kph"].fillna(0)

  edges_source = ak.GeoJSON.from_geopandas(
      "edges",
      edges,
      layer_type="polylines",
  )

  spec = ak.Spec(
      data=[edges_source],
      views=[
          ak.Map(
              layers=[
                  ak.Layer(edges_source, type="polylines").encode(
                      color=ak.field("speed_kph")
                  )
              ]
          ),
          ak.Table(edges_source, columns=["highway", "length", "speed_kph", "travel_time"]),
      ],
  )

  Division Of Labor
  A clean model is:

  OSMnx:
    acquire OSM data
    build/simplify street network
    compute graph metrics
    compute routes
    enrich GeoDataFrames

  Autark:
    render maps interactively
    show linked plots/tables
    brush/highlight selections
    export HTML/widgets
    run browser-side spatial joins/heatmaps/compute

  Where Autark Should Not Try To Compete
  Autark should probably not reimplement OSMnx-style network science soon:

  - shortest paths
  - graph simplification
  - street orientation entropy
  - circuity/connectivity metrics
  - nearest nodes/edges
  - routing
  - network centrality workflows

  Those are mature in OSMnx and NetworkX.

  Potential Integration Features
  The most useful additions to our Python API would be small adapters, not a big dependency:

  1. GeoJSON.from_geopandas() already covers most OSMnx output.
  2. Add docs/examples: “OSMnx to Autark.”
  3. Optional helper later:

  ak.GeoJSON.from_osmnx_graph("streets", G, layer="edges")
  ak.GeoJSON.from_osmnx_graph("intersections", G, layer="nodes")

  4. Maybe convenience function returning both:

  edges, nodes = ak.sources_from_osmnx_graph(G, name="walk_network")

  But I would keep OSMnx as an optional integration. Do not make it a core dependency unless we commit to network-
  analysis workflows as first-class.

  Recommendation
  Use OSMnx as the Python-side analytical engine for street networks, and Autark as the interactive visualization/export
  layer. The first concrete thing to add should be an example notebook/script in python/examples/, not a new
  abstraction.