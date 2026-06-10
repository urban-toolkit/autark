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
- Hatch/Jupyter build hook generates and packages `autark-widget.js`

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

## Open Backlog

These unchecked items are intentionally retained until they are implemented or
explicitly rejected. Items that were already completed after the original plan
were not reintroduced here.

### Runtime Data Sources And Schema

- [ ] Wire `type: "json"` into `schema/autark-spec-v0.1.json`.
- [ ] Load JSON data sources in `autk-runtime/src/data-loader.ts` through
  `AutkDb.loadJson()`.
- [ ] Wire `type: "geotiff"` into `schema/autark-spec-v0.1.json`.
- [ ] Load GeoTIFF data sources in `autk-runtime/src/data-loader.ts` through
  `AutkDb.loadGeoTiff()`.
- [ ] Add GeoTIFF map/raster workflow tests.
- [ ] Decide whether `TableRef` belongs in AutarkSpec and add schema/runtime
  support if accepted.
- [ ] Handle inline CSV `values` in the runtime loader, or remove inline CSV
  values from the schema until supported.
- [ ] Add unit tests for TypeScript spec type definitions.

### Runtime Rendering And Interaction

- [ ] Apply map-level `view.style` in the map renderer.
- [ ] Apply polygon `strokeWidth` through mesh-based outline geometry or an
  equivalent supported rendering path.
- [ ] Implement field-driven `encoding.opacity`.
- [ ] Implement field-driven `encoding.size`.
- [ ] Implement field-driven `encoding.height`.
- [ ] Honor aggregation `as` aliases in runtime transform execution, or remove
  alias examples from executable docs until supported.
- [ ] Implement link `filter` action.
- [ ] Implement link `color` action.
- [ ] Add explicit responsive resize/reflow behavior for rendered views.
- [ ] Add unit tests for individual runtime modules.
- [ ] Add visual regression tests with screenshots.

### Python API Refinement

- [ ] Decide whether to add `spec.show()` for explicit Jupyter display, or keep
  `_repr_html_()` / `widget()` as the only display APIs.
- [ ] Add warnings or fallback strategies for large inline GeoJSON datasets.
- [ ] Consider Arrow/Parquet helpers for large tabular/spatial data.
- [ ] Consider tiled/streaming helpers for large raster/vector data.
- [ ] Add higher-level compute expression helpers over raw WGSL, or document
  raw WGSL as the only supported compute authoring model.
- [ ] Add optional chart builders beyond MVP, such as bar chart and time series.
- [ ] Add legend helper classes if the runtime schema exposes stable legend
  configuration.
- [ ] Add missing convenience methods where repeated user patterns emerge.
- [ ] Improve public type hints.
- [ ] Add docstrings to all public APIs.
- [ ] Review naming conventions before release.

### Jupyter And Packaging

- [x] Generate and include `autark/static/autark-widget.js` during Python
  package builds with Hatch and `hatch-jupyter-builder`.
- [ ] Bundle DuckDB WASM assets, or document CDN requirements as the supported
  behavior for the widget path.
- [ ] Test manually in Jupyter Notebook.
- [ ] Test manually in JupyterLab.
- [ ] Test manually in VS Code notebooks.
- [ ] Test manually in Google Colab if feasible.

### Examples And Documentation

- [ ] Add full generated API reference documentation.
- [ ] Add comparison guide: declarative Python API versus imperative TypeScript
  API.
- [ ] Add migration guide from imperative TypeScript API.
- [ ] Add tutorial notebooks.
- [ ] Add troubleshooting section and FAQ to the consolidated docs.
- [ ] Add more examples after user feedback.
- [ ] Add Example 5: Urban Heat Island Analysis.
- [ ] Recreate the Niteroi use case from Python.
- [ ] Compare the Python Niteroi workflow to the TypeScript version.
- [ ] Add Python examples to the existing gallery.
- [ ] Add side-by-side TypeScript versus Python examples.
- [ ] Link gallery examples to generated specs.
- [ ] Update homepage/docs site with Python examples.
- [ ] Keep `PYTHON_API.md`, `python/README.md`, and
  `python/examples/README.md` synchronized.

### User Testing, Evaluation, And Quality

- [ ] Recruit 3-5 Python users who are not Autark developers.
- [ ] Provide a short tutorial for user testing.
- [ ] Assign a representative building task, such as neighborhood analysis.
- [ ] Collect feedback on API clarity.
- [ ] Collect feedback on documentation quality.
- [ ] Collect feedback on error messages.
- [ ] Collect feedback on pain points and missing features.
- [ ] Iterate based on feedback.
- [ ] Test spec generation with Claude/GPT-style models.
- [ ] Measure LLM success rate.
- [ ] Measure LLM token usage.
- [ ] Measure LLM iteration count.
- [ ] Categorize LLM error types.
- [ ] Compare LLM results to imperative API results.
- [ ] Document evaluation findings.
- [ ] Measure spec serialization overhead.
- [ ] Test with large GeoJSON datasets over 10k features.
- [ ] Test with large CSV datasets over 100k rows.
- [ ] Test with large OSM areas.
- [ ] Profile runtime execution.
- [ ] Identify and optimize bottlenecks.
- [ ] Test invalid specs.
- [ ] Test missing data sources.
- [ ] Test invalid references.
- [ ] Test network failures.
- [ ] Test incompatible CRS inputs.
- [ ] Verify error messages are helpful.
- [ ] Test on macOS.
- [ ] Test on Linux.
- [ ] Test on Windows.
- [ ] Test in Chrome/Edge.
- [ ] Test in Firefox.
- [ ] Test in Safari.

### Release And Paper

- [ ] Decide package publishing metadata and release process.
- [ ] Prepare Python package for PyPI.
- [ ] Add Python package changelog.
- [ ] Prepare TypeScript runtime package for npm.
- [ ] Add TypeScript runtime changelog.
- [ ] Publish alpha releases.
- [ ] Announce to early users/community.
- [ ] Update the paper with the Python API section.
- [ ] Add Python examples to the paper.
- [ ] Discuss declarative versus imperative tradeoffs.
- [ ] Add Python API to evaluation if relevant.
- [ ] Update figures with Python snippets.

### Long-Term Success Criteria

- [ ] Feature parity with imperative TypeScript API.
- [ ] User study shows Python API is learnable.
- [ ] LLM/agent evaluation shows improved generation.
- [ ] Performance acceptable for typical datasets.
- [ ] Error messages are helpful.
- [ ] Published Python and runtime packages.
- [ ] Documentation complete.
- [ ] Gallery with 10+ examples.
- [ ] Community adoption.

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
