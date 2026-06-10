# Autark Python API

Declarative Python API for creating urban visual analytics specifications.

## Quick Example

```python
import autark as ak

# Load GeoJSON data
neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/data/neighborhoods.geojson",
    coordinate_format="EPSG:4326",
    layer_type="polygons"
)

# Create a map with styled layers
spec = ak.Spec(
    metadata=ak.Metadata(title="Neighborhood Map"),
    workspace=ak.Workspace(coordinate_format="EPSG:4326"),
    data=[neighborhoods],
    views=[
        ak.Map(
            camera=ak.Camera(zoom=12),
            layers=[
                ak.Layer(neighborhoods, type="polygons")
                    .style(color="#3498db", opacity=0.7)
            ]
        )
    ]
)

# Export
spec.save_json("spec.json")
spec.save_html("map.html")

# Validate
spec.validate()

# Display in Jupyter without any local server (requires autark[widget])
spec.widget()
```

## Features

- **Declarative specs** - Python objects to JSON to TypeScript runtime
- **Data sources** - GeoJSON, CSV, OpenStreetMap, plus Python builders for JSON and GeoTIFF
- **Spatial operations** - Spatial joins and heatmaps
- **Compute transforms** - GPGPU and render-compute spec builders
- **Interactive visualizations** - Maps, histograms, scatterplots, tables, linked selections
- **Jupyter integration** - HTML display and bundled anywidget rendering
- **Selections back in Python** - observe `widget.selections` for brushes
- **pandas/GeoPandas input** - `GeoJSON.from_dataframe()` / `from_geopandas()`
- **Standalone HTML export** - No Python runtime required

## Installation

**Note:** Not yet published to PyPI. Install from source:

```bash
cd autark/python
pip install -e .
pip install -e ".[validation]"  # Optional: JSON Schema validation
pip install -e ".[widget]"      # Optional: zero-server Jupyter widget (anywidget)
```

Package builds use Hatch and `hatch-jupyter-builder` to run
`npm run build:widget` in `autk-runtime` and include
`autark/static/autark-widget.js` automatically.

### Displaying specs in Jupyter

Two options:

1. **Widget (recommended)** - `spec.widget()` renders with the runtime bundled
   inside the Python package. No local server needed; works in Jupyter,
   JupyterLab, VS Code, and Colab. DuckDB WebAssembly assets are fetched from
   the jsDelivr CDN on first use, so network access is required. Data sources
   must use absolute URLs or inline `values`.

   Plot selections sync back to the kernel:

   ```python
   w = spec.widget()
   w  # display; brush the histogram, then:
   w.selections  # {'latitude_brush': [0, 2]}
   w.observe(lambda change: print(change["new"]), names="selections")
   ```

   DataFrames can be passed directly as inline data:

   ```python
   trees = ak.GeoJSON.from_dataframe("trees", df, latitude="lat", longitude="lon")
   neighborhoods = ak.GeoJSON.from_geopandas("neighborhoods", gdf)  # reprojects to EPSG:4326
   ```

2. **Dev-server display** - evaluating `spec` in a cell uses `_repr_html_()`,
   which loads the runtime from `http://localhost:8000`. Start it from the
   repo root with `python cors_server.py 8000`. Useful during development
   since it picks up freshly built runtimes and serves local data files.

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick start guide
- **[../PYTHON_API.md](../PYTHON_API.md)** - Full API guide and current status
- **[examples/](examples/)** - Working examples
  - [simple_geojson_map.py](examples/simple_geojson_map.py) - Basic map
  - [csv_points_map.py](examples/csv_points_map.py) - CSV points + histogram
  - [spatial_join.py](examples/spatial_join.py) - Spatial join workflow
  - [geopandas_workflow.py](examples/geopandas_workflow.py) - GeoPandas workflow
- **[../PYTHON_API_IMPLEMENTATION.md](../PYTHON_API_IMPLEMENTATION.md)** - Implementation tracker

## Design

The Autark Python API follows the Vega-Lite/Altair pattern:

1. Python authors **structured specifications**
2. Specifications **serialize to JSON**
3. TypeScript runtime **executes specs in browser**
4. All rendering/compute happens in **WebGPU/DuckDB-WASM**

Benefits:
- Shareable as JSON or HTML
- Jupyter-friendly
- LLM/agent-friendly
- No Python runtime needed for visualization

## Current Status

Core features implemented:
- Data: GeoJSON, CSV, OSM
- Python builders: JSON, GeoTIFF
- Views: Map, Histogram, Scatterplot, Table
- Transforms: Spatial join, Heatmap, GPGPU compute, Render compute
- Interactions: Highlight linking
- Export: JSON, HTML, Jupyter widget

See [PYTHON_API.md](../PYTHON_API.md) for usage and current limitations.

## Testing

```bash
# Run Python tests
python -m unittest discover -s tests

# Type check (pip install -e ".[dev]")
python -m mypy

# Validate examples
python examples/simple_geojson_map.py --validate
python examples/csv_points_map.py --validate
python examples/spatial_join.py --validate
```

## License

MIT License
