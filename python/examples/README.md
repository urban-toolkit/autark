# Autark Python API Examples

This directory contains working examples demonstrating the Autark Python API.

## Available Examples

### 1. Simple GeoJSON Map ([simple_geojson_map.py](simple_geojson_map.py))

**What it demonstrates:**
- Loading GeoJSON data from a URL
- Creating a basic map view
- Styling polygon layers (color, opacity, stroke)
- Setting camera position (pitch, bearing, zoom)

**Usage:**
```bash
# Print JSON spec to stdout
python simple_geojson_map.py

# Validate against schema
python simple_geojson_map.py --validate

# Save to JSON file
python simple_geojson_map.py --output /tmp/simple_map.json

# Save to HTML file
python simple_geojson_map.py --html /tmp/simple_map.html
```

**Generated spec:** ~40 lines of JSON

---

### 2. CSV Points Visualization ([csv_points_map.py](csv_points_map.py))

**What it demonstrates:**
- Loading CSV data with latitude/longitude columns
- Creating point geometries from coordinates
- Visualizing points on a map
- Styling point markers (color, size, opacity)
- Adding a histogram of point attributes
- Using vertical layout to stack views

**Usage:**
```bash
# Print JSON spec to stdout
python csv_points_map.py

# Validate against schema
python csv_points_map.py --validate

# Save to JSON file
python csv_points_map.py --output /tmp/csv_points.json

# Save to HTML file
python csv_points_map.py --html /tmp/csv_points.html
```

**Generated spec:** ~60 lines of JSON

---

### 3. Spatial Join Workflow ([spatial_join.py](spatial_join.py))

**What it demonstrates:**
- Loading multiple data sources (GeoJSON polygons + CSV points)
- Performing spatial join with aggregation
- Counting points within polygons
- Collecting attribute values per polygon
- Thematic mapping based on aggregated values
- Linked selection between histogram and map
- Highlight action to emphasize selected features

**Usage:**
```bash
# Print JSON spec to stdout
python spatial_join.py

# Save to JSON file
python spatial_join.py --output /tmp/spatial_join.json
```

**Generated spec:** ~90 lines of JSON

---

### 4. GeoPandas Workflow ([geopandas_workflow.py](geopandas_workflow.py))

**What it demonstrates:**
- Loading polygon data with GeoPandas
- Loading and filtering tabular point data with pandas
- Computing per-neighborhood tree counts with GeoPandas/pandas
- Serializing processed GeoDataFrames with `GeoJSON.from_geopandas()`
- Visualizing polygons and points with a map and histogram

**Usage:**
```bash
# Requires pandas/geopandas, for example:
conda run -n urban python geopandas_workflow.py --validate

# Save to JSON file
conda run -n urban python geopandas_workflow.py --output /tmp/geopandas_workflow.json

# Save to HTML file
conda run -n urban python geopandas_workflow.py --html /tmp/geopandas_workflow.html
```

**Generated spec:** inline GeoJSON for processed neighborhoods and tree points

---

### 5. OSMnx to Autark Workflow ([osmnx_autark_workflow.py](osmnx_autark_workflow.py))

**What it demonstrates:**
- Downloading a small street network with OSMnx
- Computing edge speeds and travel times
- Converting an OSMnx graph to GeoPandas node/edge GeoDataFrames
- Serializing those GeoDataFrames with `GeoJSON.from_geopandas()`
- Visualizing the network with an Autark map and edge table

**Usage:**
```bash
# Requires OSMnx/GeoPandas and network access to Overpass.
# The local uv environment created during testing is:
.venv-osmnx/bin/python python/examples/osmnx_autark_workflow.py --validate

# Save to HTML file
.venv-osmnx/bin/python python/examples/osmnx_autark_workflow.py --html /tmp/osmnx_autark.html
```

**Jupyter:**
Use the `Python (Autark OSMnx)` kernel, then:

```python
from osmnx_autark_workflow import build_spec

spec = build_spec()
spec.widget(height="700px")
```

**Generated spec:** inline GeoJSON for OSMnx street edges and nodes

---

## Testing the Examples

### Option 1: Generate and Inspect JSON

```bash
# Validate that the Python API generates valid JSON
python simple_geojson_map.py --validate
python csv_points_map.py --validate
conda run -n urban python geopandas_workflow.py --validate
.venv-osmnx/bin/python python/examples/osmnx_autark_workflow.py --validate
```

This checks that the generated spec matches the JSON Schema.

### Option 2: Generate HTML and View in Browser

```bash
# Generate HTML files
python simple_geojson_map.py --html /tmp/simple_map.html
python csv_points_map.py --html /tmp/csv_points.html
conda run -n urban python geopandas_workflow.py --html /tmp/geopandas_workflow.html
.venv-osmnx/bin/python python/examples/osmnx_autark_workflow.py --html /tmp/osmnx_autark.html
python spatial_join.py --output /tmp/spatial_join.json

# Start a local server from the repo root
cd /Users/csilva/src/autark
python -m http.server 8000

# Open the HTML in your browser
open /tmp/simple_map.html
open /tmp/csv_points.html
```

**Note:** The HTML files reference the runtime at `/autk-runtime/dist/autk-runtime.js`, so you need to serve them from a server that has access to the runtime and data files.

### Option 3: Use in Jupyter Notebook

See [test_jupyter_integration.ipynb](test_jupyter_integration.ipynb) for a working notebook that demonstrates all examples.

```bash
# Start server (terminal 1)
cd /Users/csilva/src/autark
python -m http.server 8000

# Start Jupyter (terminal 2)
cd /Users/csilva/src/autark/python/examples
jupyter notebook test_jupyter_integration.ipynb
```

---

## Data Files

The examples use sample data files located at:
- `/examples/data/neighborhoods.geojson` - 3 neighborhood polygons
- `/examples/data/trees.csv` - Street tree points with lat/lng coordinates

These are small fixtures for testing. For real-world usage, you would use your own data files.

---

## Python API Quick Reference

### Data Sources

```python
import autark as ak

# GeoJSON from URL
neighborhoods = ak.GeoJSON(
    "neighborhoods",
    url="/path/to/data.geojson",
    coordinate_format="EPSG:4326",
    layer_type="polygons"
)

# CSV with lat/lng
points = ak.CSV(
    "points",
    url="/path/to/data.csv",
    geometry=ak.latlng("lat_col", "lng_col", coordinate_format="EPSG:4326")
)

# CSV with WKT geometry
shapes = ak.CSV(
    "shapes",
    url="/path/to/data.csv",
    geometry=ak.wkt("geom_col", coordinate_format="EPSG:4326")
)

# GeoPandas GeoDataFrame as inline GeoJSON
neighborhoods = ak.GeoJSON.from_geopandas("neighborhoods", gdf)

# pandas DataFrame with lat/lng as inline point GeoJSON
trees = ak.GeoJSON.from_dataframe("trees", df, latitude="lat", longitude="lon")

# OSM data (requires Overpass API or PBF file)
buildings = ak.OSM(
    "manhattan_osm",
    area="Manhattan, New York",
    layers=["buildings", "roads"]
)
```

### Views

```python
# Map with styled layers
map_view = ak.Map(
    name="my_map",
    camera=ak.Camera(pitch=0, bearing=0, zoom=12),
    layers=[
        ak.Layer(neighborhoods, id="neighborhoods_layer", type="polygons")
            .style(color="#3498db", opacity=0.7)
    ]
)

# Histogram
hist = ak.Histogram(
    name="my_histogram",
    source=points,
    x="attribute_name",
    bins=30
)
```

### Transforms

```python
# Spatial join with aggregation
joined = ak.SpatialJoin(
    root=neighborhoods,
    join=points,
    group_by=[
        ak.count(),
        ak.total("value_col"),
        ak.collect("name_col", as_="names")
    ]
)
```

### Interactions

```python
# Selection
brush = ak.interval("my_brush")

# Link selection to layer
link = ak.Link(brush, target="layer_id", action="highlight")

# Use in histogram
hist = ak.Histogram(source=data, x="field", selection=brush)
```

### Complete Spec

```python
spec = ak.Spec(
    metadata=ak.Metadata(title="My Visualization"),
    workspace=ak.Workspace(name="my_workspace", coordinate_format="EPSG:4326"),
    data=[data_source1, data_source2],
    transforms=[transform1],
    views=[map_view, histogram],
    links=[link],
    layout=ak.Layout(type="vertical")
)

# Export
spec.save_json("output.json")
spec.save_html("output.html")
spec.validate()  # Check against schema
```

---

## Common Patterns

### Thematic Mapping (Color by Attribute)

```python
ak.Layer(neighborhoods, type="polygons")
    .encode(
        color=ak.field(
            "properties.value",
            scale=ak.Scale(type="quantile", scheme="viridis")
        )
    )
```

### Linked Brushing

```python
brush = ak.interval("brush")

views = [
    ak.Histogram(source=data, x="field", selection=brush),
    ak.Map(layers=[
        ak.Layer(data, id="layer1")
    ])
]

links = [ak.Link(brush, target="layer1", action="highlight")]
```

### Multi-Layer Maps

```python
ak.Map(
    layers=[
        ak.Layer(polygons, type="polygons").style(color="#aaa", opacity=0.5),
        ak.Layer(points, type="points").style(color="#f00", size=4)
    ]
)
```

---

## Troubleshooting

### "Module not found" error

Make sure you're running from the examples directory or have added the parent directory to your Python path:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
import autark as ak
```

### "Schema validation failed"

Check that your spec structure matches the schema. Common issues:
- Missing required fields (name, type, etc.)
- Wrong field names (e.g., `latitudeColumn` vs `latitude`)
- Invalid values (e.g., zoom outside valid range)

Run with `--validate` to get detailed error messages.

### HTML doesn't render in browser

Make sure:
1. You're serving the HTML via HTTP (not opening as `file://`)
2. The runtime JavaScript is accessible at `/autk-runtime/dist/autk-runtime.js`
3. Data files are accessible at their specified URLs
4. Check browser console (F12) for errors

---

## Next Steps

- Try modifying the examples with your own data
- Combine multiple examples (e.g., spatial join + linked brushing)
- Explore more encoding options (size, opacity, height)
- Add multiple views with different layouts
- Test in Jupyter notebooks for interactive exploration

For more details, see:
- [PYTHON_API.md](../../PYTHON_API.md) - Full Python API guide
- [PYTHON_API_IMPLEMENTATION.md](../../PYTHON_API_IMPLEMENTATION.md) - Implementation tracker
- [schema/autark-spec-v0.1.json](../../schema/autark-spec-v0.1.json) - JSON Schema reference
