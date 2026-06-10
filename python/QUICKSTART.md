# Autark Python API - Quick Start

Declarative Python API for creating urban visual analytics specifications.

## Installation

**Note:** The Python package is not yet published to PyPI. For now, install from source:

```bash
# Clone the repository
git clone https://github.com/urban-toolkit/autark.git
cd autark/python

# Install in development mode
pip install -e .

# Optional: Install with validation support
pip install -e ".[validation]"

# Optional: zero-server Jupyter widget (anywidget)
pip install -e ".[widget]"
```

## Quick Start

```python
import autark as ak

# Load GeoJSON data
neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/path/to/neighborhoods.geojson",
    coordinate_format="EPSG:4326",
    layer_type="polygons"
)

# Create a map
spec = ak.Spec(
    metadata=ak.Metadata(title="My First Map"),
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

# Export to JSON
spec.save_json("my_map.json")

# Export to HTML
spec.save_html("my_map.html")

# Display in Jupyter
spec  # Automatically calls _repr_html_()
```

## Core Concepts

### 1. Data Sources

```python
# GeoJSON
geojson = ak.GeoJSON("name", url="/path/to/file.geojson", coordinate_format="EPSG:4326", layer_type="polygons")

# CSV with lat/lng
csv_points = ak.CSV("name", url="/path/to/file.csv", geometry=ak.latlng("lat", "lon"))

# OpenStreetMap
osm = ak.OSM("name", area="Manhattan, New York", layers=["buildings", "roads"])
```

### 2. Views

```python
# Map
map_view = ak.Map(
    camera=ak.Camera(zoom=12),
    layers=[ak.Layer(data, type="polygons").style(color="#3498db")]
)

# Histogram
hist = ak.Histogram(source=data, x="attribute", bins=30)
```

### 3. Transforms

```python
# Spatial join
joined = ak.SpatialJoin(
    root=polygons,
    join=points,
    group_by=[ak.count(), ak.total("value")]
)
```

### 4. Interactions

```python
# Selection + Link
brush = ak.interval("my_brush")
hist = ak.Histogram(source=data, x="field", selection=brush)
link = ak.Link(brush, target="layer_id", action="highlight")
```

### 5. Complete Spec

```python
spec = ak.Spec(
    metadata=ak.Metadata(title="My Visualization"),
    workspace=ak.Workspace(coordinate_format="EPSG:4326"),
    data=[data1, data2],
    transforms=[transform],
    views=[map_view, histogram],
    links=[link],
    layout=ak.Layout(type="vertical")
)
```

## Examples

See [examples/](examples/) for complete working examples:
- [simple_geojson_map.py](examples/simple_geojson_map.py)
- [csv_points_map.py](examples/csv_points_map.py)
- [spatial_join.py](examples/spatial_join.py)

## Jupyter Integration

### Option 1: Widget (no server needed)

```python
spec = ak.Spec(...)
spec.widget()  # Bundled runtime; works in Jupyter, JupyterLab, VS Code, Colab
```

Requires `pip install -e ".[widget]"`. DuckDB WebAssembly assets load from the
jsDelivr CDN on first use. Data sources must use absolute URLs or inline
`values` (there is no local server to resolve relative paths against).

### Option 2: Dev-server display

```python
spec  # Calls _repr_html_() automatically; loads runtime from localhost:8000
```

**Setup required:**
```bash
# Terminal 1: Start CORS-enabled server
cd /path/to/autark
python cors_server.py 8000

# Terminal 2: Jupyter
jupyter notebook
```

Useful during development: serves local data files and freshly built runtimes.

See [../JUPYTER_QUICKSTART.md](../JUPYTER_QUICKSTART.md) for details.

## Next Steps

- Try the examples in [examples/](examples/)
- Read the consolidated API guide in [PYTHON_API.md](../PYTHON_API.md)
- Check [PYTHON_API_IMPLEMENTATION.md](../PYTHON_API_IMPLEMENTATION.md) for current implementation status
