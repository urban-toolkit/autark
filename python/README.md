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

- ✅ **Declarative specs** - Python objects → JSON → TypeScript runtime
- ✅ **Multiple data sources** - GeoJSON, CSV, OpenStreetMap
- ✅ **Spatial operations** - Spatial joins with aggregation
- ✅ **Interactive visualizations** - Maps, histograms, linked selections
- ✅ **Jupyter integration** - Display specs in notebooks
- ✅ **Zero-server widget** - `spec.widget()` bundles the runtime (anywidget)
- ✅ **Standalone HTML export** - No Python runtime required

## Installation

**Note:** Not yet published to PyPI. Install from source:

```bash
cd autark/python
pip install -e .
pip install -e ".[validation]"  # Optional: JSON Schema validation
pip install -e ".[widget]"      # Optional: zero-server Jupyter widget (anywidget)
```

### Displaying specs in Jupyter

Two options:

1. **Widget (recommended)** - `spec.widget()` renders with the runtime bundled
   inside the Python package. No local server needed; works in Jupyter,
   JupyterLab, VS Code, and Colab. DuckDB WebAssembly assets are fetched from
   the jsDelivr CDN on first use, so network access is required. Data sources
   must use absolute URLs or inline `values`.
2. **Dev-server display** - evaluating `spec` in a cell uses `_repr_html_()`,
   which loads the runtime from `http://localhost:8000`. Start it from the
   repo root with `python cors_server.py 8000`. Useful during development
   since it picks up freshly built runtimes and serves local data files.

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick start guide
- **[examples/](examples/)** - Working examples
  - [simple_geojson_map.py](examples/simple_geojson_map.py) - Basic map
  - [csv_points_map.py](examples/csv_points_map.py) - CSV points + histogram
  - [spatial_join.py](examples/spatial_join.py) - Spatial join workflow
- **[../JUPYTER_QUICKSTART.md](../JUPYTER_QUICKSTART.md)** - Jupyter integration
- **[../PYTHON_API_IMPLEMENTATION.md](../PYTHON_API_IMPLEMENTATION.md)** - Implementation details

## Design

The Autark Python API follows the Vega-Lite/Altair pattern:

1. Python authors **structured specifications**
2. Specifications **serialize to JSON**
3. TypeScript runtime **executes specs in browser**
4. All rendering/compute happens in **WebGPU/DuckDB-WASM**

Benefits:
- 🚀 Shareable (just send JSON/HTML)
- 📓 Jupyter-friendly
- 🤖 LLM/agent-friendly
- 🔄 No Python runtime needed for visualization

## Current Status

**v0.1 MVP** - Core features implemented:
- Data: GeoJSON, CSV, OSM
- Views: Map, Histogram
- Transforms: Spatial join
- Interactions: Highlight linking
- Export: JSON, HTML, Jupyter

See [PYTHON_API_IMPLEMENTATION.md](../PYTHON_API_IMPLEMENTATION.md) for roadmap.

## Testing

```bash
# Run Python tests
python -m unittest discover -s tests

# Validate examples
python examples/simple_geojson_map.py --validate
python examples/csv_points_map.py --validate
python examples/spatial_join.py --validate
```

## License

MIT License
