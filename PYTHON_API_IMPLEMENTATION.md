# Autark Python API Implementation Tracker

This tracker records implementation status only. For user-facing API
documentation and examples, see `PYTHON_API.md`.

Checkpoint before documentation consolidation:

```text
b941f2a feat(python): expand spec builders and runtime support
```

## Completed MVP Work

### Locked Executable Spec Conventions

- OSM sub-layer tables use `${name}_${layer}`, for example
  `manhattan_osm_buildings`.
- MVP spatial joins mutate the `root` table in place.
- Heatmap, GPGPU compute, and render compute transforms write to explicit
  `output` tables.
- Map field encodings use full feature-property paths when needed, for example
  `properties.height`; plot encodings use table column/property names.
- Link targets resolve to rendered layer/view identifiers.
- `highlight` is the implemented MVP link action.
- Data file references in specs are runtime/browser URLs, not Python filesystem
  paths unless served by the current HTML/runtime context.

### Spec Core

- `ak.Spec` / `ak.AutarkSpec`
- `ak.Metadata`
- `ak.Workspace`
- `to_dict()`, `to_json()`, `save_json()`
- `save_html()`
- `_repr_html_()`
- `spec.widget()`
- JSON Schema validation with `spec.validate()`

### Data Sources

- `ak.OSM`
- `ak.GeoJSON`
- `ak.GeoJSON.from_dataframe()`
- `ak.GeoJSON.from_geopandas()`
- `ak.CSV`
- `ak.JSON` Python builder
- `ak.GeoTIFF` Python builder
- CSV lat/lng geometry helper
- CSV WKT geometry helper

### Transforms

- `ak.SpatialJoin`
- `ak.Near`
- Aggregation helpers:
  - `count`
  - `sum` / `total`
  - `avg`
  - `min` / `minimum`
  - `max` / `maximum`
  - `weighted`
  - `collect`
- `ak.Heatmap`
- `ak.HeatmapGrid`
- `ak.Compute.gpgpu()`
- `ak.Compute.render()`

### Views

- `ak.Map`
- `ak.Layer`
- `ak.Camera`
- `ak.Histogram`
- `ak.Scatterplot`
- `ak.Table`
- `ak.Layout`

### Encodings

- `ak.field()`
- `ak.value()`
- `ak.Field`
- `ak.Value`
- `ak.Scale`
- Field, value, scale, and style serialization

### Selections And Links

- `ak.interval()`
- `ak.point()`
- `ak.multi()`
- `ak.Link`
- Runtime highlight linking for histogram/scatterplot/table driven selections

### Runtime And Schema Wiring

- GeoJSON data loading, including inline values
- CSV data loading with geometry options
- OSM loading, with HAR-backed runtime coverage
- Spatial join transform execution
- Heatmap transform execution through `AutkDb.buildHeatmap()`
- GPGPU compute transform execution through `AutkCompute.gpgpuPipeline()`
- Render compute transform execution through `AutkCompute.renderPipeline()`
- Map, histogram, scatterplot, and table rendering
- Widget bundle selection sync

### Examples

- `python/examples/simple_geojson_map.py`
- `python/examples/csv_points_map.py`
- `python/examples/spatial_join.py`
- `python/examples/geopandas_workflow.py`
- `examples/specs/01-basic-osm-map.json`
- `examples/specs/02-linked-map-histogram.json`
- `examples/specs/03-spatial-join.json`
- `examples/specs/04-geojson-input.json`
- `examples/specs/05-csv-points.json`
- `examples/specs/06-multiple-layers.json`
- `tests/fixtures/runtime/fixture-06-scatter-table.json`

## Deferred Work

### Runtime Data Sources

- Wire `type: "json"` into `schema/autark-spec-v0.1.json`.
- Load JSON data sources in `autk-runtime/src/data-loader.ts` through
  `AutkDb.loadJson()`.
- Wire `type: "geotiff"` into `schema/autark-spec-v0.1.json`.
- Load GeoTIFF data sources in `autk-runtime/src/data-loader.ts` through
  `AutkDb.loadGeoTiff()`.
- Add map raster layer workflow tests for GeoTIFF-backed tables.

### Python API Refinement

- Add warnings or fallback strategies for large inline GeoJSON datasets.
- Consider Arrow/Parquet or tiled data helpers for large data.
- Add higher-level compute expression helpers over raw WGSL.
- Add optional chart builders beyond MVP, such as bar chart and time series.
- Add legend helper classes if the runtime schema exposes stable legend config.

### Documentation And Release

- Keep `PYTHON_API.md`, `python/README.md`, and `python/examples/README.md`
  synchronized.
- Add generated API reference once the Python package surface stabilizes.
- Decide package publishing metadata and release process.

## Verification Commands

Runtime:

```bash
npm run validate:specs
npm run test:runtime
```

Python:

```bash
cd python
python -m unittest tests.test_spec_builders
python -m unittest discover -s tests
python -m mypy
```

The full Python discovery suite includes notebook/widget tests that start a
local Jupyter kernel, so it may need permission to bind local ports in sandboxed
environments.
