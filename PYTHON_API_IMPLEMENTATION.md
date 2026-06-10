# Autark Python API Implementation Plan

Date: 2026-06-07
Branch: `feature/python-api`

## Overview

This document tracks the implementation of a declarative Autark specification (AutarkSpec) and Python API, following the Vega-Lite/Altair pattern:
- Python authors structured specifications
- Specifications serialize to JSON
- TypeScript Autark runtime executes specifications
- All rendering/compute remains in TypeScript/WebGPU/DuckDB-WASM

## MVP Scope Decision (2026-06-07)

**Critical Insight:** The original plan tried to design the entire v1 surface before proving the core spec/runtime loop. This is too ambitious and risky.

**MVP v0.1 Narrow Scope:**
- JSON schema definition
- `AutarkRuntime.fromSpec()` execution
- Data sources: OSM, GeoJSON, CSV only
- Views: Map with layers, Histogram only (scatterplot if time permits)
- Transforms: Spatial join only
- Interactions: Selection + highlight links (filter semantics TBD)
- Display: Jupyter `_repr_html_()` with embedded runtime
- Examples: 3 hand-authored JSON specs + Python equivalents

**Explicitly Deferred to Phase 5 (post-MVP):**
- ❌ Arrow/Parquet support (requires TS runtime work)
- ❌ Lazy/tiled data loading (requires TS runtime work)
- ❌ Custom Python error callbacks (can't work in static HTML)
- ❌ Expression-language compute (separate project)
- ❌ Render compute (advanced)
- ❌ Advanced layouts beyond hconcat/vconcat
- ❌ GeoTIFF support
- ❌ Heatmap transform
- ❌ Table view
- ❌ anywidget bidirectional communication

**Sequencing Strategy:**
1. Write 3 hand-authored JSON specs FIRST (before Python builders)
2. Implement TypeScript runtime to execute those specs
3. Build Python API to generate equivalent specs
4. Validate round-trip: Python → JSON → Runtime → Browser

This approach exposes schema/runtime gaps faster than starting with builders.

## Concrete Implementation Issues Fixed

### Issue 1: Package Directory Structure ✅ RESOLVED
**Problem:** Initial plan referenced `packages/autk-spec/` and `packages/autk-runtime/`, but the monorepo uses flat workspace structure.

**Evidence:** `package.json:10` defines workspaces as flat directories: `autk-core`, `autk-db`, `autk-map`, etc.

**Fix:** Use `autk-spec/` and `autk-runtime/` (flat, not nested under `packages/`).

### Issue 2: GeoJSON Method Name ✅ RESOLVED
**Problem:** Plan referenced `AutkDb.loadGeoJson()` but actual method name uses lowercase 'j'.

**Fix:** Use `AutkDb.loadGeojson()` consistently.

### Issue 3: Transform Mutation Semantics ✅ RESOLVED
**Problem:** Python API design proposes immutable transforms (transforms produce new data references), but current TypeScript runtime mutates root table in place.

**Evidence:** `autk-db/src/db.ts:767` - `spatialQuery()` modifies root table directly.

**Options:**
- A: Runtime must copy/create output table before spatial join
- B: Add DB support for `outputTableName` parameter
- C: Python API documents mutation semantics honestly

**Recommendation:** Option B (add `outputTableName`) provides cleanest semantics for declarative spec.

**Decision (MVP):** Option C - Use mutation semantics for v0.1. Defer immutable transforms to future.

### Issue 4: Error Callback Limitations ✅ RESOLVED
**Problem:** Python callback error handlers cannot work in saved static HTML (no Python kernel).

**Fix:** For MVP, only serialize error policy strings (`"fail"|"warn"|"ignore"|"retry"`). Defer custom Python callbacks to future anywidget/live kernel integration.

### Issue 5: TypeScript Project References ✅ RESOLVED
**Problem:** `autk-runtime/tsconfig.json` used project references and extended non-existent `tsconfig.base.json`, causing build failures.

**Evidence:**
- `extends: "../tsconfig.base.json"` - File doesn't exist
- `composite: true` - Other packages aren't composite projects
- `references: [...]` - Rest of repo doesn't use project references

**Fix:** Removed project references, matched repo pattern (ES2020, bundler resolution) while keeping `declaration: true` for library emission. See [autk-runtime/tsconfig.json](autk-runtime/tsconfig.json).

### Issue 6: Workspace Dependencies ✅ RESOLVED
**Problem:** `autk-runtime/package.json` used `workspace:*` protocol for dependencies, while rest of repo uses concrete version numbers. This caused `npm install` to fail.

**Evidence:**
```json
"@urban-toolkit/autk-core": "workspace:*",
"@urban-toolkit/autk-db": "workspace:*",
...
```

**Fix:** Changed to concrete versions matching current package versions:
```json
"@urban-toolkit/autk-core": "2.2.0",
"@urban-toolkit/autk-db": "2.3.0",
"@urban-toolkit/autk-compute": "2.3.0",
"@urban-toolkit/autk-map": "2.3.0",
"@urban-toolkit/autk-plot": "2.3.0"
```

**Result:**
- ✅ `npm install` succeeds
- ✅ `make build` succeeds (after allowing network for `npx concurrently`)
- ✅ autk-runtime resolves local packages correctly
- ✅ Build progressed to real API integration errors (expected)

## API Mismatch Blockers (2026-06-07) ✅ RESOLVED 2026-06-10

Build and package setup exposed several runtime/API mismatches. These no longer block execution; the runtime now compiles, builds, and passes browser tests.

### DataLoader API Mismatches ([autk-runtime/src/data-loader.ts](autk-runtime/src/data-loader.ts))

**Problem:** Runtime uses incorrect parameter names that don't match actual Autark package APIs.

**Blockers:**
1. **OSM loading** - Uses `area` parameter, but `LoadOsmParams` expects different structure
2. **GeoJSON loading** - Uses `url` parameter name mismatch with `LoadGeojsonParams`
3. **CSV loading** - Uses `latitudeColumn`, `longitudeColumn` but `LoadCsvParams` expects different names

**Resolved:**
- [x] OSM maps to `queryArea`, `autoLoadLayers`, and `outputTableName`
- [x] GeoJSON maps to `geojsonFileUrl` / `geojsonObject`
- [x] CSV maps to `csvFileUrl` and `geometryColumns`

### TransformExecutor API Mismatches ([autk-runtime/src/transform-executor.ts](autk-runtime/src/transform-executor.ts))

**Problem:** Spatial join `near` parameter passed incorrectly.

**Blocker:** Runtime passes `near` in wrong structure for `spatialQuery()`.

**Resolved:**
- [x] Runtime uses the current `spatialQuery()` parameter names and `NearConfig` shape.

### ViewRenderer API Mismatches ([autk-runtime/src/view-renderer.ts](autk-runtime/src/view-renderer.ts))

**Problem:** Multiple API mismatches in map and plot rendering.

**Blockers:**
1. **getLayer() return type** - Runtime assumes `db.getLayer()` returns `{ collection }`, but it actually returns `FeatureCollection` directly
2. **AutkPlot constructor** - Runtime uses old API `new AutkPlot(container)` then `plot.histogram(...)`, but current package expects constructor config
3. **Plot creation pattern** - Current autk-plot API likely uses factory methods or different initialization pattern

**Resolved:**
- [x] Runtime handles `db.getLayer()` returning `FeatureCollection` directly
- [x] Runtime uses current `AutkPlot` constructor/config shape
- [x] Runtime separates `updateThematic()` and `updateColorMap()` calls
- [x] Runtime applies constant fill colors, stroke colors, line width, opacity, and point size styles

### LinkManager API Mismatches ([autk-runtime/src/link-manager.ts](autk-runtime/src/link-manager.ts))

**Problem:** Uses non-existent AutkMap methods and wrong plot events.

**Blockers:**
1. **AutkMap.highlight()** - Method does not exist in AutkMap API
2. **Plot events** - Listens for `"brushend"` but autk-plot uses typed events:
   - `PlotEvent.BRUSH` (`'brush'`)
   - `PlotEvent.BRUSH_X` (`'brushX'`)
   - `PlotEvent.BRUSH_Y` (`'brushY'`)
   - `PlotEvent.CLICK` (`'click'`)

**Resolved:**
- [x] Runtime uses map layer highlight APIs
- [x] Runtime listens to typed `PlotEvent` values
- [x] Histogram-to-map highlight propagation is covered by browser tests

### Remaining Runtime TODOs After Unblocking

1. Implement polygon `strokeWidth` with mesh-based outline geometry. Current `strokeColor` works, but border thickness is fixed by the WebGPU `line-list` pass.
2. Implement field-driven `encoding.opacity`, `encoding.size`, and `encoding.height`.
3. Add visual regression snapshots for stable browser rendering baselines.
4. Keep live Overpass as manual validation via `RUN_REAL_OVERPASS=1`; CI should continue using HAR playback.
5. Support highlight links targeting points layers (found 2026-06-10): `AutkMap`
   `setHighlightedIds` throws `Cannot read properties of undefined (reading
   'nPoints')` for points layers; only polygon layers work as link targets
   today. Example spec 05 omits the map link for this reason.

## Locked Executable Spec Conventions (2026-06-07)

Based on hand-authored JSON examples and runtime code review, the following conventions are **locked for MVP implementation**:

### Convention 1: OSM Sub-Layer Table Naming
**Decision:** OSM data sources generate tables using `${name}_${layer}` convention.

**Rationale:** Current `LoadOsmLayerUseCase` creates tables as `${osmInputTableName}_${layer}` (autk-db/src/use-cases/load-osm-layer/use-case.ts:79).

**Spec syntax:**
```json
{
  "data": [{"type": "osm", "name": "manhattan_osm", "layers": ["buildings", "roads"]}],
  "views": [{
    "layers": [
      {"source": "manhattan_osm_buildings"},
      {"source": "manhattan_osm_roads"}
    ]
  }]
}
```

**Runtime requirement:** When executing OSM data source specs, runtime **MUST** pass `outputTableName: data.name` to `AutkDb.loadOsm()`. Otherwise, default table name is `table_osm`, breaking layer references.

**Example runtime code:**
```ts
await db.loadOsm({
  outputTableName: spec.data[0].name,  // e.g., "manhattan_osm"
  area: spec.data[0].area,
  layers: spec.data[0].layers
});
// Results in tables: manhattan_osm_buildings, manhattan_osm_roads
```

**Rejected:** Dot notation like `manhattan_osm.buildings` (not executable).

**Python API:** Must expand layer references to `${name}_${layer}` format.

### Convention 2: Transform Output Semantics (MVP)
**Decision:** For MVP, spatial join transforms **mutate the root table in place**. No output name.

**Rationale:** Current runtime mutates root table (autk-db/src/db.ts:767). Immutable output requires runtime changes.

**Spec syntax:**
```json
{
  "data": [
    {"type": "geojson", "name": "neighborhoods"},
    {"type": "csv", "name": "trees"}
  ],
  "transforms": [{
    "type": "spatialJoin",
    "root": "neighborhoods",
    "join": "trees",
    "groupBy": [{"column": "*", "op": "count", "as": "tree_count"}]
  }],
  "views": [{
    "layers": [{"source": "neighborhoods"}]
  }]
}
```

**Key:** Reference **root table** after transform, not new output name.

**Future:** Add `outputTableName` parameter (post-MVP).

### Convention 3: Field Path Normalization
**Decision:** Map encodings use **full paths** (`properties.height`). Plot fields use **property names** (`height`).

**Rationale:** Maps call `valueAtPath()` on whole features. Plots flatten `feature.properties`.

**Spec syntax:**
```json
{
  "views": [
    {
      "type": "map",
      "layers": [{"encoding": {"color": {"field": "properties.height"}}}]
    },
    {
      "type": "histogram",
      "x": {"field": "height"}
    }
  ]
}
```

**Spatial join paths:**
- Map: `"properties.sjoin.count.tree_count"`
- Plot: `"sjoin.count.tree_count"`

### Convention 4: Link Target Semantics
**Decision:** Link targets reference **layer IDs**, not data sources.

**Rationale:** Layer-level targeting is precise for multi-layer maps.

**Spec syntax:**
```json
{
  "views": [
    {"type": "map", "layers": [{"source": "buildings", "id": "buildings_layer"}]},
    {"type": "histogram", "selection": {"name": "height_brush"}}
  ],
  "links": [{
    "selection": "height_brush",
    "target": "buildings_layer",
    "action": "highlight"
  }]
}
```

**Key:** Target is layer id, not data source name.

**Link actions (MVP):**
- **`highlight`** (MVP): Visual emphasis of selected features. Non-selected features remain visible but de-emphasized.
- **`filter`** (post-MVP): Hide non-selected features. Requires runtime decision: rebuild collection, toggle visibility, or use `isSkip`? Deferred until runtime semantics are defined.

**Future:** Support multiple targets: `"target": ["layer1", "layer2"]`.

### Convention 5: Schema Key Name
**Decision:** Use `"$schema"` (JSON Schema standard), not `"schema"`.

**Rationale:** Standard validator compatibility.

### Convention 6: Data File References
**Decision:** MVP examples use placeholder paths. Executable tests use actual gallery data.

**Action:** Before runtime tests, create fixtures or point to existing gallery data.

## Design Decisions Log

### Core Architecture
- [x] Decide on declarative JSON spec as bridge between Python and TypeScript
- [x] Finalize Python API style: object composition (R1 accepted)
- [x] Define error handling strategy: serialize policy only, defer callbacks (R11 accepted with constraints)
- [x] Define data loading strategies: eager only for MVP (R6 deferred)

### API Style Considerations
See [autark-spec-python-api-design.md](./autark-spec-python-api-design.md) for initial design.

Key open questions:
- **Method chaining vs object composition**: Current proposal uses `.data().map().plot()` chaining. Alternative: independent objects composed into `ak.Spec()`.
- **String references vs object references**: Should layer sources be `"buildings"` or `buildings` object?
- **Transform semantics**: Do transforms mutate sources or produce new datasets?

## Phase 1: Foundation and Schema

### 1.1 JSON Schema Definition
- [x] Create `schema/` directory in monorepo root
- [x] Define `autark-spec-v0.1.json` JSON Schema
  - [x] Top-level AutarkSpec interface
  - [x] Metadata schema
  - [x] Workspace schema
  - [x] MVP data source schemas (OSM, GeoJSON, CSV)
  - [ ] Deferred data source schemas (JSON, GeoTIFF, TableRef)
  - [x] MVP transform schema (SpatialJoin)
  - [ ] Deferred transform schemas (Heatmap, Compute)
  - [x] MVP view schemas (Map, Histogram)
  - [x] Encoding schemas (color, opacity, size, height)
  - [x] Scale schemas
  - [x] Selection schemas
  - [x] Link schemas
  - [x] Layout schemas
- [x] Add schema validation examples
- [x] Document schema versioning strategy

### 1.2 TypeScript Types from Schema
- [x] Generate or manually write TypeScript types for AutarkSpec
- [x] Place types in runtime package: `autk-runtime/` (no separate `autk-spec/` package for MVP)
- [x] Export all spec types
- [ ] Add unit tests for type definitions
- [x] Validate example specs against schema/types in runtime tests

### 1.3 Example Specs
Create hand-written example specs to validate design:
- [x] `examples/specs/01-basic-osm-map.json` - OSM buildings with color encoding
- [x] `examples/specs/02-linked-map-histogram.json` - Map + histogram with selection
- [x] `examples/specs/03-spatial-join.json` - Neighborhoods + trees spatial join
- [x] `examples/specs/04-geojson-input.json` - GeoJSON layer rendering (browser-tested)
- [x] `examples/specs/05-csv-points.json` - CSV with lat/lng geometry (browser-tested; map link omitted, see runtime TODO 5)
- [x] `examples/specs/06-multiple-layers.json` - Buildings + roads + parks (schema-validated; execution needs Overpass)
- [x] Document each example with comments/README

## Phase 2: TypeScript Runtime

### 2.1 Runtime Package Setup
- [x] Create `autk-runtime/` package (**NOTE:** Use flat structure, not `packages/autk-runtime/`. See package.json:10 workspaces)
- [x] Set up package.json with dependencies
  - [x] Depend on `autk-db`, `autk-compute`, `autk-map`, `autk-plot`, `autk-core`
  - [x] Add JSON Schema validator (ajv)
- [x] Set up TypeScript config (fixed project references issue)
- [x] Create basic exports structure

### 2.2 Runtime Core Implementation
- [x] Implement `AutarkRuntime` class
  - [x] `static async fromSpec(spec: AutarkSpec, options: RuntimeOptions): Promise<AutarkRuntime>`
  - [x] `async updateSpec(spec: AutarkSpec): Promise<void>`
  - [x] `async destroy(): Promise<void>`
  - [x] `getDb(): AutkDb | undefined`
  - [x] `getMap(name?: string): AutkMap | undefined`
  - [x] `getPlot(name?: string): AutkPlot | undefined`
- [x] Implement spec validation
  - [x] Version checking
  - [x] Schema validation
  - [x] Reference validation (sources, selections, links)
- [x] Add runtime error types and handling

### 2.3 Data Source Execution
- [x] Implement OSM data source loader
  - [x] Handle Overpass API loading path
  - [x] Handle PBF file loading path
  - [x] Map to `AutkDb.loadOsm()`
- [x] Implement GeoJSON data source loader
  - [x] Handle URL loading
  - [x] Handle inline values
  - [x] Map to `AutkDb.loadGeojson()` (**NOTE:** lowercase 'j', not `loadGeoJson`)
- [x] Implement CSV data source loader
  - [x] Handle URL loading
  - [ ] Handle inline values
  - [x] Handle lat/lng geometry
  - [x] Handle WKT geometry
  - [x] Map to `AutkDb.loadCsv()`
- [ ] Implement JSON data source loader
  - [ ] Map to `AutkDb.loadJson()`
- [ ] Implement GeoTIFF data source loader (optional for MVP)
  - [ ] Map to `AutkDb.loadGeoTiff()`
- [x] Add loading progress callbacks
- [x] Add error handling for failed loads

### 2.4 Transform Execution
- [x] Implement spatial join transform
  - [x] Parse join parameters
  - [x] Map to `AutkDb.spatialQuery()`
  - [x] Handle aggregation specs
- [ ] Implement heatmap transform
  - [ ] Map to `AutkDb.buildHeatmap()`
- [ ] Implement GPGPU compute transform
  - [ ] Map to `AutkCompute.gpgpuPipeline()`
  - [ ] Validate WGSL body
- [ ] Implement render compute transform (optional for MVP)
  - [ ] Map to `AutkCompute.renderPipeline()`
- [x] Add transform error handling
- [x] Handle transform dependencies/ordering

### 2.5 View Rendering
- [x] Implement map view renderer
  - [x] Create `AutkMap` instance
  - [x] Set camera parameters
  - [ ] Set map style
  - [x] Add layers from spec
- [x] Implement map layer creation
  - [x] Resolve data sources
  - [x] Apply MVP encodings (field color; constant color)
  - [x] Apply supported styles (fill color, stroke color, road/polyline width, opacity, point size)
  - [ ] Apply polygon stroke width (requires mesh-based outline path)
  - [x] Handle layer interactions
- [x] Implement encoding resolution
  - [x] Field-based encodings
  - [x] Value-based color encodings
  - [ ] Field-based opacity/size/height encodings
  - [x] Scale application
  - [x] Color scheme resolution
- [x] Implement histogram view
  - [x] Map to `AutkPlot` histogram
  - [x] Apply encodings
  - [x] Configure bins
- [ ] Implement scatterplot view
  - [ ] Map to `AutkPlot` scatterplot
  - [ ] Apply x/y encodings
- [ ] Implement table view (optional for MVP)
- [x] Add view error handling

### 2.6 Selection and Link Handling
- [x] Implement selection registration
  - [x] Track named selections
  - [x] Connect to view events
- [x] Implement link execution
  - [x] Resolve selection sources
  - [x] Resolve link targets
  - [x] Implement highlight action
  - [ ] Implement filter action
  - [ ] Implement color action
- [x] Test cross-view selection propagation

### 2.7 Layout and DOM Management
- [x] Implement basic layout engine
  - [x] Vertical layout
  - [x] Horizontal layout
  - [x] Grid layout
- [x] Implement container creation
  - [x] Auto-generate DOM structure
  - [x] Support custom container targeting
- [ ] Handle responsive behavior
- [x] Add layout error handling

### 2.8 Runtime Testing
- [x] **Testing infrastructure created** (see [autk-runtime/TESTING.md](autk-runtime/TESTING.md))
- [x] **Schema validation tests** ([tests/runtime/schema-validation.test.ts](tests/runtime/schema-validation.test.ts))
  - [x] Positive test cases (all 3 examples validate)
  - [x] Negative test cases (misspelled keys, unsafe identifiers, PBF without URL, empty near, CSV without geometry)
- [x] **Package scripts added**
  - [x] Root: `npm run validate:specs` - Validate JSON examples against schema
  - [x] Root: `npm run test:runtime` - Run all runtime tests
  - [x] Runtime: `npm run test` - Convenience script
  - [x] Runtime: `npm run validate` - Convenience script
- [x] **Local fixture tests** ([tests/runtime/runtime-fixtures.test.ts](tests/runtime/runtime-fixtures.test.ts))
  - [x] GeoJSON map loading with local fixtures
  - [x] CSV with histogram loading with local fixtures
  - [x] Runtime metadata API validation (`getTablesMetadata()`, `getMaps()`, `getPlots()`)
  - [x] Canvas rendering checks (visible, non-blank pixels)
  - [x] No console errors assertion
- [x] **Test fixtures created** ([tests/fixtures/runtime/](tests/fixtures/runtime/))
  - [x] `simple-points.geojson` - Local GeoJSON fixture
  - [x] `simple-polygons.geojson` - Local polygon fixture
  - [x] `simple-points.csv` - Local CSV fixture with lat/lng
  - [x] `fixture-01-geojson-map.json` - Test spec for GeoJSON map
  - [x] `fixture-02-csv-histogram.json` - Test spec for CSV + histogram
  - [x] `fixture-03-osm-har.json` - HAR-backed OSM test spec
  - [x] `fixture-04-osm-live.json` - Small live Overpass manual test spec
  - [x] `fixture-05-line-style.json` - Polyline width/style test spec
  - [x] `runtime-test-harness.html` - Parameterized browser test page
- [x] **HAR-backed OSM tests** ([tests/runtime/runtime-osm-har.test.ts](tests/runtime/runtime-osm-har.test.ts))
  - [x] CI-safe HAR playback enabled
  - [x] Live Overpass manual test gated behind `RUN_REAL_OVERPASS=1`
  - [x] Can re-record with `HAR_UPDATE=1` environment variable
- [ ] Unit tests for individual runtime modules (future)
- [ ] Visual regression tests with screenshots (future)

### 2.9 Runtime Documentation
- [x] **Testing guide** ([autk-runtime/TESTING.md](autk-runtime/TESTING.md))
  - [x] 6-tier testing strategy (CI-safe vs manual)
  - [x] Package scripts documentation
  - [x] Success criteria (measurable assertions)
  - [x] Debugging guide with API examples
  - [x] Design rationale (HAR vs mocks, tests location, etc.)
  - [x] References to actual autk-db and autk-plot APIs
- [ ] API documentation (future)
- [ ] Usage examples (future)
- [ ] Error handling guide (future)
- [ ] Migration guide from imperative API (future)

## Phase 3: Python Package

### 3.1 Python Package Setup
- [x] Create `python/autark/` directory structure
- [x] Set up `pyproject.toml` / `setup.py`
  - [x] Define dependencies: stdlib dataclasses for MVP
  - [x] Define optional dependencies: `jsonschema` validation extra
- [x] Set up package structure:
  ```
  python/autark/
    __init__.py
    spec.py           # Main Spec class
    data.py           # Data source classes
    transforms.py     # Transform classes
    views.py          # View classes (Map, Layer, Histogram, etc.)
    encodings.py      # Encoding classes
    selections.py     # Selection classes
    links.py          # Link classes
    display.py        # Jupyter display integration
    _serialise.py     # Serialization helpers
  ```
- [x] Set up testing framework (stdlib unittest)
- [ ] Set up type checking (mypy)

### 3.2 Core Spec Classes
- [x] Implement `AutarkSpec` class
  - [x] `__init__()` with data, transforms, views, links, layout
  - [x] `to_dict() -> dict`
  - [x] `to_json() -> str`
  - [x] `save_json(path: str)`
  - [x] `save_html(path: str)`
  - [ ] `show()` for Jupyter display
  - [x] `_repr_html_()` for notebook rendering scaffold
- [x] Implement `Metadata` class
- [x] Implement `Workspace` class
- [x] Add validation helpers
- [x] Add JSON Schema validation

### 3.3 Data Source Classes
- [x] Implement `OSM` class
  - [x] area: str
  - [x] layers: list[str]
  - [x] source: 'overpass' | 'pbf'
  - [x] to_dict() method
- [x] Implement `GeoJSON` class
  - [x] Support url: str
  - [x] Support values: FeatureCollection
  - [ ] Support GeoDataFrame input (auto-serialize)
  - [x] to_dict() method
- [x] Implement `CSV` class
  - [x] Support url: str
  - [ ] Support DataFrame input
  - [x] Support lat/lng geometry
  - [x] Support WKT geometry
  - [x] to_dict() method
- [ ] Implement `JSON` class
  - [ ] to_dict() method
- [ ] Implement `GeoTIFF` class (optional for MVP)
  - [ ] to_dict() method
- [ ] Add pandas/GeoPandas serialization helpers
  - [ ] Handle CRS conversion
  - [ ] Handle large dataset warnings
  - [ ] Consider Arrow/Parquet for large data

### 3.4 Transform Classes
- [x] Implement `SpatialJoin` class
  - [x] root, join parameters
  - [x] near config
  - [x] groupby aggregations
  - [x] to_dict() method
- [x] Implement aggregation helpers
  - [x] `count(column, as_=None)`
  - [x] `sum(column, as_=None)` (`total` helper)
  - [x] `avg(column, as_=None)`
  - [x] `min(column, as_=None)` (`minimum` helper)
  - [x] `max(column, as_=None)` (`maximum` helper)
  - [x] `weighted(column, as_=None)`
  - [x] `collect(column, as_=None)`
- [ ] Implement `Heatmap` class
  - [ ] to_dict() method
- [ ] Implement `Compute` class
  - [ ] `gpgpu()` static method
  - [ ] `render()` static method (optional for MVP)
  - [ ] to_dict() method
- [ ] Add compute expression helpers (optional)
  - [ ] Consider expression language vs raw WGSL

### 3.5 View Classes
- [x] Implement `Map` class
  - [x] layers: list[Layer]
  - [x] camera: Camera
  - [x] style: MapStyle
  - [x] to_dict() method
- [x] Implement `Layer` class
  - [x] source reference (str or object?)
  - [x] type: LayerType
  - [x] encode() method returning new Layer
  - [x] style() method returning new Layer
  - [x] to_dict() method
- [x] Implement `Histogram` class
  - [x] source, x, y, bins, selection
  - [x] to_dict() method
- [ ] Implement `Scatterplot` class
  - [ ] source, x, y, color, selection
  - [ ] to_dict() method
- [ ] Implement `BarChart` class (optional for MVP)
- [ ] Implement `Table` class (optional for MVP)

### 3.6 Encoding Classes
- [x] Implement encoding helpers
  - [x] Simple field reference: `color="height"`
  - [x] Explicit field: `color=Field("height")`
  - [x] Value: `color=Value("#ff0000")`
  - [x] Scale integration: `color=Field("height", scale=Scale(...))`
- [x] Implement `Scale` class
  - [x] type, scheme, domain, domainStrategy
  - [x] to_dict() method
- [ ] Implement `Legend` class (optional for MVP)
  - [ ] to_dict() method

### 3.7 Selection and Link Classes
- [x] Implement `Selection` class
  - [x] name, type ('point' | 'interval' | 'multi')
  - [x] fields
  - [x] to_dict() method
- [x] Implement `Link` class
  - [x] selection reference
  - [x] target reference (str or object?)
  - [x] action: 'highlight' | 'filter' | 'color'
  - [x] to_dict() method

### 3.8 Jupyter Display Integration
- [x] Implement `_repr_html_()` for AutarkSpec
  - [x] Generate HTML with embedded runtime module URL
  - [x] Embed JSON spec
  - [x] Include runtime bundle URL hook
- [x] Implement `save_html()` for standalone exports
  - [x] Generate HTML file
  - [ ] Bundle all dependencies (deferred to v0.2)
  - [x] Include data inline or as references
- [x] Test in browser with Playwright (automated tests passing)
- [x] Create Jupyter notebook test infrastructure
- [x] Fix cross-origin display (2026-06-10): DuckDB worker created via
      same-origin blob: URL (`autk-db/src/duckdb.ts`); root-relative data
      URLs resolved against the runtime origin (`python/autark/display.py`);
      schema fetched from runtime origin (`autk-runtime/src/validator.ts`).
      Covered by Playwright cross-origin regression test.
- [x] Manual test in Jupyter notebook (verified working 2026-06-10, requires `cors_server.py`)
- [ ] Manual test in JupyterLab (pending user testing)
- [x] Manual test in VS Code notebooks (verified working 2026-06-10, local Python kernel + `cors_server.py`)
- [x] anywidget integration (2026-06-10): `spec.widget()` renders with a fully
      bundled runtime (`python/autark/static/autark-widget.js`, built by
      `autk-runtime/vite.widget.config.js`); no local server needed. DuckDB
      assets load from jsDelivr when the module origin is not http(s)
      (`autk-db/src/duckdb.ts`), and the spec schema is bundled inline
      (`autk-runtime/src/validator.ts`). Covered by
      `tests/runtime/widget-bundle.test.ts` (blob: URL import like anywidget).
      Bidirectional JS→Python communication still future work.

### 3.9 Python Testing
- [x] Unit tests for MVP classes
  - [x] Test to_dict() serialization
  - [x] Test JSON schema compliance
  - [x] Test validation
- [x] Integration tests
  - [x] Build complete specs
  - [x] Validate against JSON schema
  - [ ] Test pandas/GeoPandas serialization
- [x] Type checking with mypy (strict; `python -m mypy` from python/, config in pyproject.toml)
- [ ] Example notebooks as tests

### 3.10 Python Documentation
- [x] Package README ([python/README.md](python/README.md))
  - [x] Quick example
  - [x] Feature overview
  - [x] Installation instructions
  - [x] Status and roadmap
- [x] Quick start guide ([python/QUICKSTART.md](python/QUICKSTART.md))
  - [x] Installation
  - [x] Quick start
  - [x] Core concepts
  - [x] Complete example
- [x] Examples documentation ([python/examples/README.md](python/examples/README.md))
  - [x] Usage instructions for all examples
  - [x] Python API quick reference
  - [x] Common patterns
  - [x] Troubleshooting
- [x] Jupyter integration guides
  - [x] Quick start ([JUPYTER_QUICKSTART.md](JUPYTER_QUICKSTART.md))
  - [x] Testing guide ([python/examples/JUPYTER_TESTING.md](python/examples/JUPYTER_TESTING.md))
  - [x] Test results ([JUPYTER_INTEGRATION_RESULTS.md](JUPYTER_INTEGRATION_RESULTS.md))
- [ ] Full API reference documentation (deferred to v0.2)
- [ ] Comparison to imperative TypeScript API (deferred)
- [ ] Migration guide (deferred)

## Phase 4: Integration and Examples ✅ COMPLETE

### 4.1 End-to-End Examples
Create complete working examples:
- [x] Example 1: Simple GeoJSON Map
  - [x] Python script ([python/examples/simple_geojson_map.py](python/examples/simple_geojson_map.py))
  - [x] CLI interface with --validate, --output, --html
  - [x] Generated JSON spec validates
  - [x] Demonstrates basic map creation and styling
- [x] Example 2: CSV Points Visualization
  - [x] Python script ([python/examples/csv_points_map.py](python/examples/csv_points_map.py))
  - [x] CLI interface with --validate, --output, --html
  - [x] Map + histogram with vertical layout
  - [x] Demonstrates CSV geometry handling
- [x] Example 3: Spatial Join (Neighborhoods + Trees)
  - [x] Python script ([python/examples/spatial_join.py](python/examples/spatial_join.py))
  - [x] Generated JSON spec
  - [x] Runtime/browser round-trip test passing
  - [x] Demonstrate aggregation (count, collect)
  - [x] Demonstrate thematic mapping
  - [x] Demonstrate linked selection
- [x] Test infrastructure created
  - [x] Browser test page ([test-jupyter.html](test-jupyter.html))
  - [x] Automated Playwright test ([tests/runtime/jupyter-test.test.ts](tests/runtime/jupyter-test.test.ts))
  - [x] Jupyter notebook template ([python/examples/test_jupyter_integration.ipynb](python/examples/test_jupyter_integration.ipynb))
  - [x] CLI test tool ([python/examples/test_html_output.py](python/examples/test_html_output.py))
- [ ] Example 4: GeoPandas Workflow (deferred to v0.2)
  - [ ] Load data with GeoPandas
  - [ ] Process/filter with pandas
  - [ ] Visualize with Autark
- [ ] Example 5: Urban Heat Island Analysis (deferred to future)
  - [ ] Recreate Niteroi use case from Python
  - [ ] Compare to TypeScript version

### 4.2 Gallery Integration (Deferred to v0.2)
- [ ] Add Python examples to existing gallery
- [ ] Side-by-side: TypeScript vs Python
- [ ] Demonstrate equivalent capabilities
- [ ] Link to generated specs

### 4.3 Documentation Website Updates (Deferred to v0.2)
- [ ] Add Python API section to docs
- [ ] Add API reference
- [ ] Add tutorial notebooks
- [ ] Add comparison guide
- [ ] Update homepage with Python examples

## Phase 5: Testing and Refinement

### 5.1 User Testing
- [ ] Recruit 3-5 Python users (not Autark developers)
- [ ] Provide small tutorial
- [ ] Assign building task (e.g., neighborhood analysis)
- [ ] Collect feedback on:
  - [ ] API clarity
  - [ ] Documentation quality
  - [ ] Error messages
  - [ ] Pain points
  - [ ] Missing features
- [ ] Iterate based on feedback

### 5.2 LLM/Agent Testing
- [ ] Test spec generation with Claude/GPT-4
- [ ] Provide API documentation as context
- [ ] Assign urban VA tasks
- [ ] Measure:
  - [ ] Success rate
  - [ ] Token usage
  - [ ] Iteration count
  - [ ] Error types
- [ ] Compare to imperative API results
- [ ] Document findings

### 5.3 Performance Testing
- [ ] Measure spec serialization overhead
- [ ] Test with large datasets
  - [ ] Large GeoJSON (>10k features)
  - [ ] Large CSV (>100k rows)
  - [ ] Large OSM areas
- [ ] Profile runtime execution
- [ ] Identify bottlenecks
- [ ] Optimize if needed

### 5.4 Error Handling Testing
- [ ] Test invalid specs
- [ ] Test missing data sources
- [ ] Test invalid references
- [ ] Test network failures
- [ ] Test incompatible CRS
- [ ] Verify error messages are helpful

### 5.5 Cross-Platform Testing
- [ ] Test on macOS
- [ ] Test on Linux
- [ ] Test on Windows
- [ ] Test in different browsers
  - [ ] Chrome/Edge
  - [ ] Firefox
  - [ ] Safari
- [ ] Test in different notebook environments
  - [ ] Jupyter Notebook
  - [ ] JupyterLab
  - [ ] VS Code
  - [ ] Google Colab (if possible)

## Phase 6: Polish and Release

### 6.1 API Refinement
- [ ] Review API consistency
- [ ] Add missing convenience methods
- [ ] Improve type hints
- [ ] Add docstrings to all public APIs
- [ ] Review naming conventions

### 6.2 Documentation Polish
- [ ] Proofread all documentation
- [ ] Add more examples
- [ ] Add troubleshooting section
- [ ] Add FAQ
- [ ] Create video tutorials (optional)

### 6.3 Package Publishing
- [ ] Prepare Python package for PyPI
  - [ ] Version: 0.1.0-alpha
  - [ ] License
  - [ ] README
  - [ ] CHANGELOG
- [ ] Prepare TypeScript runtime for npm
  - [ ] Version: 0.1.0-alpha
  - [ ] Update package.json
  - [ ] CHANGELOG
- [ ] Test installation from package managers
- [ ] Publish alpha releases
- [ ] Announce to community

### 6.4 Paper Integration
- [ ] Update paper with Python API section
- [ ] Add Python examples to paper
- [ ] Discuss declarative vs imperative tradeoffs
- [ ] Add to evaluation (if relevant)
- [ ] Update figures with Python snippets

## Design Recommendations from Review

These recommendations came from the detailed API review (2026-06-07). Each includes rationale and examples.

### R1: Python API Style - Object Composition Over Method Chaining

**Original Design:**
```python
view = (
    ak.View()
    .data(ak.OSM(...))
    .map(ak.Map().layer(...))
    .plot(ak.Histogram(...))
)
```

**Issues:**
- Method chaining implies order matters when it often doesn't
- Mixes data/transform/view levels in a flat chain
- Hard to build specs programmatically (loops, conditionals)
- Doesn't match how users think about composition

**Recommended Design:**
```python
# Define data sources as first-class objects
buildings = ak.OSM("buildings", area="Manhattan, NY", layers=["buildings"])

# Define views independently
map_view = ak.Map(
    layers=[
        ak.Layer(buildings, type="buildings")
        .encode(color="height")
        .style(opacity=0.9)
    ]
)

histogram = ak.Histogram(
    buildings,
    x="height",
    bins=30,
    selection=ak.Selection("height_brush", type="interval")
)

# Compose into spec
spec = ak.Spec(
    data=[buildings],
    views=[map_view, histogram],
    links=[ak.Link("height_brush", target="buildings")]
)

spec.show()
```

**Benefits:**
- Data sources, transforms, and views are first-class objects
- Easy to build views in loops or conditionally
- Clear separation of concerns
- More testable
- Matches Altair's design pattern

---

### R2: Object References Over String References

**Original Design:**
```python
buildings = ak.OSM("buildings", ...)
layer = ak.Layer(source="buildings")  # String reference
```

**Issues:**
- Stringly-typed - no validation until runtime
- Hard to track data lineage
- Refactoring is error-prone
- No IDE autocomplete

**Recommended Design:**
```python
buildings = ak.OSM("buildings", ...)
layer = ak.Layer(source=buildings)  # Object reference

# Or:
layer = ak.Layer(buildings)  # Positional

# Python side: type-safe reference with IDE support
# Serializes to JSON: {"source": "buildings"}
```

**Benefits:**
- Type-safe in Python
- IDE autocomplete
- Early validation
- Easier refactoring
- JSON remains simple (serializes to string)

**Implementation Note:**
- Data source objects need a `name` attribute
- Serialization converts object references to name strings
- Runtime resolves string names back to loaded data

---

### R3: Encoding API - Support Both Shorthand and Explicit

**Original Design:**
```python
layer.encode(color="height")
# Or always explicit:
layer.encode(color=ak.Color("height", scheme="viridis"))
```

**Issue:**
Simple cases are verbose with explicit API, but shorthand can't express complex scales.

**Recommended Design - Three Levels:**

```python
# Level 1: Simple shorthand (most common)
layer.encode(color="height")

# Level 2: Dict syntax for intermediate cases
layer.encode(
    color={"field": "height", "scale": {"scheme": "viridis", "type": "quantile"}}
)

# Level 3: Explicit objects for complex cases
layer.encode(
    color=ak.Field("height")
        .scale(scheme="viridis", type="quantile")
        .legend(title="Building Height")
)

# Or Altair-style:
layer.encode(
    color=ak.X("height").scale(scheme="viridis")
)
```

**Benefits:**
- Progressive complexity: simple things simple, complex things possible
- Familiarity for Altair users
- Type-safe with object syntax

---

### R4: Explicit Transform Data Flow

**Original Design:**
```python
spec = ak.Spec(
    data=[neighborhoods, trees],
    transforms=[
        ak.SpatialJoin(root="neighborhoods", join="trees", ...)
    ]
)
# Where does the result go? Mutates neighborhoods?
```

**Issues:**
- Unclear whether transforms mutate sources or produce new data
- Can't reference intermediate results
- Execution order ambiguous

**Recommended Design - Option A (Immutable, Explicit Output):**
```python
neighborhoods = ak.GeoJSON("neighborhoods", neighborhoods_gdf)
trees = ak.CSV("trees", trees_df, geometry=ak.LatLng("lat", "lon"))

# Transform produces new data reference
neighborhoods_with_trees = ak.SpatialJoin(
    root=neighborhoods,
    join=trees,
    groupby=[ak.count("*", as_="tree_count")]
)

# Use the result in views
map_view = ak.Map(
    layers=[
        ak.Layer(neighborhoods_with_trees)
        .encode(color="sjoin.count.tree_count")
    ]
)

spec = ak.Spec(
    data=[neighborhoods, trees, neighborhoods_with_trees],
    views=[map_view]
)
```

**Recommended Design - Option B (Explicit Mutation):**
```python
spec = ak.Spec(
    data=[neighborhoods, trees],
    transforms=[
        ak.SpatialJoin(neighborhoods, trees, ...)
            .apply_to(neighborhoods)  # Explicit mutation target
    ],
    views=[map_view]
)
```

**Benefits:**
- Clear data lineage
- Can reference intermediate results
- Explicit about mutations
- Easier to understand and debug

**Note:** Option A (immutable) is cleaner but may not match TypeScript runtime behavior. Need to verify runtime semantics.

---

### R5: Make Spatial Join Output Schema Discoverable

**Original Design:**
Result of spatial join goes to `properties.sjoin.count.tree_count` but this is hidden in docs.

**Recommended Design:**
```python
join = ak.SpatialJoin(
    root=neighborhoods,
    join=trees,
    groupby=[ak.count("*", as_="tree_count")]
)

# Make output schema queryable
join.output_fields()
# Returns: ["sjoin.count.tree_count"]

# Provide helper for encoding
layer.encode(color=join.result("tree_count"))
# Instead of: layer.encode(color="properties.sjoin.count.tree_count")
```

**Benefits:**
- Discoverable data flow
- Less error-prone
- Better for LLM/agent generation
- Still allows explicit property paths

---

### R6: Progressive Data Loading Strategies

**Original Design:**
All data loads immediately when spec executes.

**Issues:**
- Large OSM regions can be slow
- Large GeoTIFFs may block
- No user feedback during loading

**Recommended Design:**
```python
# Eager loading (default for small data)
buildings = ak.OSM("manhattan", area="Manhattan, NY", layers=["buildings"])

# Lazy loading - only fetch when needed
buildings = ak.OSM(..., loading="lazy")

# Streaming/tiled - for very large datasets
dem = ak.GeoTIFF("elevation.tif", loading="tiled", tile_size=256)

# With progress callback
buildings = ak.OSM(..., on_progress=lambda pct: print(f"{pct}%"))
```

**Benefits:**
- Better UX for large datasets
- More control over loading behavior
- Progress feedback

**Note:** Defer to Phase 5 (not MVP)

---

### R7: Selection and Link Semantics Clarification

**Original Design:**
```python
.plot(ak.Histogram(...).select("height_brush"))
.link("height_brush", target="buildings", action="highlight")
```

**Issues:**
- Selection creation mixed with view definition
- Link target is stringly-typed
- Action semantics unclear

**Recommended Design:**
```python
# Selections as first-class objects
height_brush = ak.Selection("height_brush", type="interval")

# Views reference selections
histogram = ak.Histogram(buildings, x="height", selection=height_brush)

# Links are explicit with object references
link = ak.Link(
    selection=height_brush,
    target=buildings,  # Object reference
    mode="highlight"  # Clear semantics: "highlight" | "filter" | "focus"
)

spec = ak.Spec(
    data=[buildings],
    views=[map_view, histogram],
    links=[link]
)
```

**Benefits:**
- Clear ownership of selections
- Type-safe target references
- Explicit link semantics
- Easier to build complex multi-view interactions

---

### R8: GeoPandas Integration - Support Arrow/Parquet

**Original Design:**
Always serialize GeoPandas to GeoJSON.

**Issues:**
- GeoJSON doesn't preserve CRS well in browsers
- Large GeoDataFrames (>10k features) serialize poorly
- Loss of pandas dtypes/categoricals

**Recommended Design:**
```python
# Small datasets: GeoJSON (default)
ak.GeoJSON("parcels", gdf)

# Large datasets: Arrow or Parquet
ak.GeoDataFrame("parcels", gdf, format="arrow")
ak.GeoDataFrame("parcels", gdf, format="parquet")

# Auto-select based on size
ak.GeoDataFrame("parcels", gdf, format="auto")  # Uses arrow if >10k features
```

**Benefits:**
- Better scalability
- Preserves dtypes
- Faster serialization/deserialization
- Future-proof

**Implementation Note:** Requires Arrow/Parquet support in TypeScript runtime.

**Note:** Defer to Phase 5 (not MVP), start with GeoJSON only.

---

### R9: Compute API - Expression Language with WGSL Escape Hatch

**Original Design:**
Only support raw WGSL:
```python
ak.Compute.gpgpu(
    source="buildings",
    inputs={"height": "height", "area": "area"},
    body="return height * area;",
    as_="volume"
)
```

**Issues:**
- Requires WGSL knowledge
- Error-prone
- Hard for LLMs to generate correctly
- Can't reuse common computations

**Recommended Design - Three Levels:**

```python
# Level 1: Expression strings (covers 80% of cases)
buildings.compute(
    volume=ak.expr("height * area")
)

# Level 2: Functional API (composable, reusable)
buildings.compute(
    volume=ak.multiply("height", "area"),
    normalized_height=ak.divide("height", ak.max("height"))
)

# Level 3: Raw WGSL (escape hatch for complex cases)
buildings.compute_wgsl(
    inputs={"height": "height", "area": "area"},
    body="return height * area;",
    as_="volume"
)
```

**Benefits:**
- Lower barrier to entry
- More LLM-friendly
- Still supports advanced users
- Can add operations incrementally

**Implementation Note:** Expression language needs careful design - consider:
- Simple math ops: +, -, *, /, %
- Comparison: <, >, ==, !=, <=, >=
- Logical: &&, ||, !
- Functions: sqrt, pow, log, exp, sin, cos, abs, min, max
- Aggregations: sum, avg, min, max (over datasets)
- Conditionals: if/else or ternary

---

### R10: Layout Composition Operators

**Original Design:**
Minimal layout:
```ts
interface LayoutSpec {
  type?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
}
```

**Issues:**
- Can't control relative sizes
- No responsive behavior
- Can't target specific containers for embedding

**Recommended Design - Option A (Composition Operators):**
```python
# Explicit composition (like Altair)
spec = ak.hconcat(
    map_view,
    ak.vconcat(histogram, scatterplot),
    widths=[0.7, 0.3]
)

# Or nested
left_panel = ak.vconcat(histogram, scatterplot)
spec = ak.hconcat(map_view, left_panel, widths=[2, 1])
```

**Recommended Design - Option B (Named Targets):**
```python
spec = ak.Spec(
    views={
        "main_map": map_view,
        "sidebar": ak.vconcat(histogram, scatterplot)
    },
    layout=ak.Layout(template="sidebar-right", split=0.7)
)
```

**Benefits:**
- Explicit size control
- Composable layouts
- Familiar patterns (Altair, Plotly subplots)
- Easy to create complex dashboards

**Note:** Consider both - composition for simple cases, named targets for embedding.

---

### R11: Error Handling Strategy

**Original Design:**
Not specified.

**Recommended Design:**
```python
# Global error handling
spec = ak.Spec(
    data=[buildings],
    views=[map_view],
    on_error="warn"  # "fail" | "warn" | "ignore"
)

# Per-component error handling
buildings = ak.OSM(
    "buildings",
    area="Manhattan, NY",
    layers=["buildings"],
    on_error="retry",
    max_retries=3,
    timeout=30.0
)

# Custom error handler
def handle_error(error: AutarkError):
    print(f"Error: {error.message}")

spec = ak.Spec(
    data=[buildings],
    on_error=handle_error
)
```

**Benefits:**
- Clear failure semantics
- Configurable per use case
- Better debugging
- Production-ready

---

## Open Design Questions

Track unresolved design decisions here. These correspond to the recommendations above.

### Q1: Method Chaining vs Object Composition?
**Status:** ✅ ACCEPTED for MVP
**Recommendation:** Object composition (see R1)
**Decision:** Use object composition. Data sources, transforms, views, selections, and links are first-class objects composed into `ak.Spec()`.

### Q2: String References vs Object References?
**Status:** ✅ ACCEPTED for MVP
**Recommendation:** Object references that serialize to strings (see R2)
**Decision:** Python API uses object references (e.g., `Layer(buildings)` not `Layer("buildings")`). Serialization converts to string names. Runtime resolves string names back to loaded data.

### Q3: Encoding API Style?
**Status:** ✅ ACCEPTED for MVP (with naming adjustment)
**Recommendation:** Three levels - shorthand, dict, explicit objects (see R3)
**Decision:** Support all three levels. Use `ak.Field()`, `ak.Value()`, `ak.Scale()` for explicit objects. Avoid `ak.X()` notation (too plot-specific for map encodings).

### Q4: Transform Semantics?
**Status:** ✅ LOCKED for MVP (mutation), future (immutable)
**Recommendation (MVP):** Transforms mutate root table in place (see R4 Option C)
**Decision:**
- **v0.1 MVP:** Spatial join transforms mutate root table. No `outputTableName` parameter. Reference root table after transform.
- **v0.2 Future:** Add `outputTableName` parameter for immutable semantics. Python API can then present transforms as producing new data sources.

**Rationale:** Examples now use mutation semantics. Runtime implementation is simpler without copying tables. Immutable semantics deferred to post-MVP when runtime supports it.

### Q5: Spatial Join Output Schema?
**Status:** ✅ ACCEPTED for MVP
**Recommendation:** Add `.output_fields()` and `.result()` helpers (see R5)
**Decision:** Implement `.result()` helper method. Property path strings like `properties.sjoin.count.tree_count` are error-prone for users and LLMs.

### Q6: Data Loading Strategies?
**Status:** ❌ DEFERRED (not MVP)
**Recommendation:** Support lazy/tiled loading (see R6)
**Decision:** Defer to Phase 5. Requires significant runtime support. MVP uses eager loading only.

### Q7: Selection and Link Semantics?
**Status:** ✅ ACCEPTED for MVP
**Recommendation:** First-class Selection objects, object references in Links (see R7)
**Decision:** Implement first-class `Selection` and `Link` objects. Maps well to existing `AutkPlot` selection API (autk-plot/src/plot.ts:81).

### Q8: Large Dataset Handling?
**Status:** ❌ DEFERRED (not MVP)
**Recommendation:** Support Arrow/Parquet (see R8)
**Decision:** Defer to Phase 5. Start with GeoJSON only. Arrow/Parquet requires TypeScript runtime support.

### Q9: Compute API?
**Status:** ❌ DEFERRED (not MVP)
**Recommendation:** Expression language + functional API + WGSL escape hatch (see R9)
**Decision:** Defer compute entirely from MVP, OR expose only raw WGSL escape hatch for v0.1. Expression language design is a separate project. Revisit in Phase 5.

### Q10: Layout System?
**Status:** ✅ ACCEPTED for MVP (with priority)
**Recommendation:** Support composition operators (hconcat/vconcat) and named targets (see R10)
**Decision:** Implement `hconcat`/`vconcat` composition operators as primary API. Named targets are useful for embedding but secondary priority.

### Q11: Error Handling Strategy?
**Status:** ⚠️ ACCEPTED with browser/runtime distinction
**Recommendation:** Configurable per-component with global defaults (see R11)
**Decision:** Support `on_error="fail"|"warn"|"ignore"|"retry"` that serializes to JSON. Python callback error handlers **cannot** work in saved static HTML (no Python kernel). For MVP: serialize error policy only, defer custom callbacks to widget/live kernel scenarios.

## Dependencies and Prerequisites

### TypeScript Side
- Existing packages: `autk-db`, `autk-compute`, `autk-map`, `autk-plot`, `autk-core`
- JSON Schema validator library (ajv)
- Bundle creation for Jupyter embeds

### Python Side
- Python 3.9+ (for type hints)
- pandas (for data manipulation)
- geopandas (for spatial data)
- pydantic or dataclasses (for validation)
- typing (for type hints)
- jsonschema (for validation)
- jupyter (optional, for display)
- ipywidgets/anywidget (optional, for interaction)

### Build/Dev Tools
- TypeScript compiler
- Python build tools (build, twine)
- Testing: pytest, playwright
- Documentation: Sphinx or MkDocs for Python, existing setup for TypeScript

## Success Criteria

### MVP Success (v0.1) - ✅ 10/10 CRITERIA MET
- [x] Can create OSM map from Python (HAR-backed runtime coverage, live manual validation available)
- [x] Can create GeoJSON map from Python ✅
- [x] Can add histogram linked to map ✅
- [x] Can perform spatial join ✅
- [x] Spec validates against JSON schema ✅
- [x] Runtime executes all MVP flows correctly ✅ (GeoJSON, CSV, spatial join, OSM HAR)
- [x] Display works in Jupyter ✅ (browser tests pass; manual testing pending)
- [x] Can export standalone HTML scaffold ✅
- [x] Documentation covers all MVP features ✅
- [x] At least 3 working end-to-end examples ✅ (simple_geojson_map, csv_points_map, spatial_join)

### Full Success (v1.0)
- [ ] Feature parity with imperative TypeScript API
- [ ] User study shows Python API is learnable
- [ ] LLM/agent evaluation shows improved generation
- [ ] Performance acceptable for typical datasets (<10k features)
- [ ] Error messages are helpful
- [ ] Published on PyPI and npm
- [ ] Documentation complete
- [ ] Gallery with 10+ examples
- [ ] Community adoption

## Notes and References

- Initial design: [autark-spec-python-api-design.md](./autark-spec-python-api-design.md)
- Code review: [autark-code-quality-review.md](./autark-code-quality-review.md)
- Paper notes: [autark-paper-revision-notes.md](./autark-paper-revision-notes.md)
- Design review feedback: (this conversation)

## Progress Tracking

**Started:** 2026-06-07
**Current Phase:** MVP v0.1 Complete (awaiting user testing)
**Last Updated:** 2026-06-10

**Recent Updates (2026-06-10):**
- ✅ Fixed critical AJV strict mode bug in runtime validator
- ✅ Jupyter integration tested and validated in browser
- ✅ Created 2 additional Python examples (simple_geojson_map, csv_points_map)
- ✅ Created comprehensive documentation (quickstart, examples guide, Jupyter guides)
- ✅ Runtime tests passing with CI-safe OSM HAR coverage (`npm run test:runtime`: 18 passed, 1 skipped manual live-network test)
- ✅ Live Overpass manual path validated with `RUN_REAL_OVERPASS=1`
- ✅ Runtime styles expanded: constant fill color, stroke color, road/polyline width, opacity, and point size
- ✅ All automated checks passing in latest run (`make typecheck`, `make lint`, runtime tests, fixture schema validation, Python unittest)
- ✅ MVP success criteria: 10/10 met

**See also:**
- [MVP_COMPLETION_SUMMARY.md](MVP_COMPLETION_SUMMARY.md) - Detailed completion report
- [JUPYTER_INTEGRATION_RESULTS.md](JUPYTER_INTEGRATION_RESULTS.md) - Jupyter test results

### Phase 1: Foundation and Schema ✅ COMPLETE

**Completed:**
- ✅ JSON Schema definition ([schema/autark-spec-v0.1.json](schema/autark-spec-v0.1.json))
  - Strict validation with `additionalProperties: false` on all objects
  - SQL-safe identifier patterns (`^[A-Za-z_][A-Za-z0-9_]*$`)
  - Conditional requirements (PBF URL, near distance)
  - Reference integrity documented for runtime validation
  - All negative tests pass (rejects typos, unsafe names, etc.)
- ✅ Three executable example specs validated successfully
  - [examples/specs/01-basic-osm-map.json](examples/specs/01-basic-osm-map.json)
  - [examples/specs/02-linked-map-histogram.json](examples/specs/02-linked-map-histogram.json)
  - [examples/specs/03-spatial-join.json](examples/specs/03-spatial-join.json)
- ✅ Example specs documented with README
- ✅ Locked executable conventions documented
- ✅ Design contradictions resolved (transform semantics, field paths, etc.)
- ✅ Schema validation scripts added (`npm run validate:specs`)

### Phase 2: TypeScript Runtime ✅ BROWSER TESTS PASS, ✅ OSM HAR COVERED

**Package Created:** `autk-runtime/`

**Completed:**
- ✅ **Package structure and configuration**
  - package.json with dependencies (autk-db, autk-map, autk-plot, ajv)
  - tsconfig.json fixed (removed project references, matches repo pattern)
  - Package scripts: `build`, `watch`, `clean`, `test`, `validate`
- ✅ **Complete TypeScript types from JSON Schema** ([autk-runtime/src/types.ts](autk-runtime/src/types.ts))
  - All spec interfaces: AutarkSpec, DataSource, Transform, View, Link, Layout
  - Runtime options and error types
  - 100% schema coverage
- ✅ **Runtime execution pipeline** ([autk-runtime/src/runtime.ts](autk-runtime/src/runtime.ts))
  - Main AutarkRuntime class
  - 8-phase execution flow
  - Reference integrity validation
  - Progress callbacks
  - Resource cleanup
- ✅ **JSON Schema validator** ([autk-runtime/src/validator.ts](autk-runtime/src/validator.ts))
  - AJV-based validation
  - SpecValidationError with detailed messages
- ✅ **Data source loaders** ([autk-runtime/src/data-loader.ts](autk-runtime/src/data-loader.ts))
  - OSM (Overpass/PBF) with correct `outputTableName`
  - GeoJSON with URL support
  - CSV with lat/lng and WKT geometry
- ✅ **Transform executor** ([autk-runtime/src/transform-executor.ts](autk-runtime/src/transform-executor.ts))
  - Spatial join with mutation semantics
  - Aggregation support
- ✅ **View rendering** ([autk-runtime/src/view-renderer.ts](autk-runtime/src/view-renderer.ts))
  - Map creation with canvas
  - Layer loading with type inference
  - Camera application (pitch, bearing, zoom with workaround for absolute positioning)
  - Color encoding (field-based with scales and constant color values)
  - Supported styles: fill color, stroke color, road/polyline width, opacity, point size
  - Deferred style: polygon stroke width
  - Histogram creation with bins and field mapping
  - Data flattening for plots
- ✅ **Link management** ([autk-runtime/src/link-manager.ts](autk-runtime/src/link-manager.ts)) - **160 lines**
  - Selection-to-layer resolution
  - Event wiring (plot events to map highlight)
  - Event cleanup on destroy
- ✅ **Layout system** ([autk-runtime/src/layout-manager.ts](autk-runtime/src/layout-manager.ts)) - **120 lines**
  - DOM container creation
  - Vertical/horizontal/grid layouts
  - Gap configuration and flex sizing
- ✅ **Testing infrastructure** (see section 2.8 above)
  - Schema validation tests (positive + negative)
  - Local fixture tests (GeoJSON, CSV)
  - HAR-backed OSM tests (CI-safe)
  - Manual live Overpass smoke test gated by `RUN_REAL_OVERPASS=1`
  - Test harness and fixtures
  - Package scripts (`npm run test:runtime`, `npm run validate:specs`)
- ✅ **Testing documentation** ([autk-runtime/TESTING.md](autk-runtime/TESTING.md))
  - 6-tier testing strategy
  - Measurable success criteria
  - Debugging guides
  - API reference corrections

**Status:** ✅ **BUILD + BROWSER TESTS PASS** - OSM is covered by HAR in CI; live Overpass remains manual by design.

**Total Code:** ~1,600 lines of production TypeScript + ~500 lines of tests/fixtures

**Build Progress:**
- ✅ TypeScript configuration fixed (project references removed)
- ✅ Package dependencies fixed (`workspace:*` → concrete versions)
- ✅ `npm install` succeeds
- ✅ `make build` succeeds
- ✅ Local package resolution works
- ✅ **All API mismatches fixed** - TypeScript compiles cleanly
- ✅ **All 8 TypeScript errors resolved**
- ✅ Browser runtime fixtures pass (`npm run test:runtime`)
- ✅ Local hand-authored spatial join example executes end-to-end in browser
- ✅ CRS/camera local-coordinate rendering issue fixed
- ✅ Workspace initialization race fixed (`await db.setWorkspace(...)`)
- ✅ Histogram selection events are wired to map layer highlights

**API Fixes Completed:**
1. ✅ **DataLoader** - Fixed OSM/GeoJSON/CSV parameter names and structures
   - OSM: `queryArea` + `autoLoadLayers` structure
   - GeoJSON: `geojsonFileUrl` / `geojsonObject` parameters
   - CSV: `geometryColumns` object structure
2. ✅ **ViewRenderer** - Fixed `getLayer()` usage and AutkPlot constructor
   - `getLayer()` returns `FeatureCollection` directly (not wrapped)
   - `loadCollection(id, { collection, type })` signature
   - `AutkPlot(div, { type, collection, ... })` constructor
   - Split `updateThematic()` and `updateColorMap()` calls
   - `ColorMapDomainStrategy` discriminated union types
3. ✅ **LinkManager** - Fixed highlight methods and plot events
   - `setHighlightedIds()` / `clearHighlightedIds()` methods
   - `PlotEvent.BRUSH` enum instead of `'brushend'` string
4. ✅ **TransformExecutor** - Fixed spatial query parameters
   - `tableRootName` / `tableJoinName` parameter names
   - `near` as `NearConfig` object (not separate distance/useCentroid)

**What Works:**
- ✅ Package setup and build pipeline
- ✅ TypeScript compilation succeeds with no errors
- ✅ Test infrastructure ready for automated CI-safe testing
- ✅ JSON → Validation flow
- ✅ All API calls aligned with actual Autark package interfaces
- ✅ Local GeoJSON map fixture renders in browser
- ✅ Local CSV + histogram fixture renders in browser
- ✅ Local spatial join example loads GeoJSON + CSV, mutates root table, renders map + histogram
- ✅ Histogram-to-map highlight link wiring is covered by an automated browser test

**Current Browser-Tested Results:**
- ✅ `npm run validate:specs` passes for all 3 example specs
- ✅ `npm run test:runtime` passes: 18 passed, 1 skipped (manual live Overpass)
- ✅ `examples/specs/03-spatial-join.json` is executable using local data in `examples/data/`
- ✅ OSM runtime execution is covered with HAR playback and a live-network manual smoke fixture
- ✅ Selection/highlight link behavior has focused event-level browser coverage
- ✅ Style coverage includes constant fill color, stroke color, road/polyline width, opacity, and point size

**Next Steps:**
1. ~~Fix tsconfig.json (project references)~~ ✅ DONE
2. ~~Fix package.json (workspace dependencies)~~ ✅ DONE
3. ~~Create test infrastructure~~ ✅ DONE
4. ~~Build with TypeScript compiler~~ ✅ DONE
5. ~~Fix DataLoader parameter names~~ ✅ DONE
6. ~~Fix ViewRenderer API calls~~ ✅ DONE
7. ~~Fix LinkManager API calls~~ ✅ DONE
8. ~~Fix TransformExecutor near parameter~~ ✅ DONE
9. ~~Run automated tests (`npm run test:runtime`)~~ ✅ DONE
10. ~~Run local hand-authored spatial-join example in browser~~ ✅ DONE
11. ~~Add focused browser test for selection/highlight links~~ ✅ DONE
12. ~~Resolve OSM example strategy: HAR-backed deterministic tests or defer live Overpass to manual validation~~ ✅ DONE
13. ~~Start Phase 3 Python builders~~ ✅ DONE

### Phase 3: Python Package ✅ COMPLETE

**Target:** Python builders to generate AutarkSpec JSON

**Package Created:** `python/autark/`

**Completed:**
- ✅ Python package scaffold (`python/pyproject.toml`, `python/autark/`)
- ✅ Object-composition API matching R1 recommendation:
  - `ak.Spec(...)`
  - data builders: `ak.OSM`, `ak.GeoJSON`, `ak.CSV`, `ak.latlng`, `ak.wkt`
  - transform builders: `ak.SpatialJoin`, `ak.Near`, aggregation helpers
  - view builders: `ak.Map`, `ak.Layer`, `ak.Histogram`, `ak.Camera`, `ak.Layout`
  - encoding builders: `ak.Field`, `ak.Value`, `ak.Scale`
  - interaction builders: `ak.Selection`, `ak.interval`, `ak.Link`
- ✅ Object references serialize to locked string names where the schema requires references
- ✅ OSM sub-layer helper uses locked `${name}_${layer}` convention
- ✅ `AutarkSpec.to_dict()`, `to_json()`, `save_json()`
- ✅ Optional JSON Schema validation via `jsonschema`
- ✅ Initial HTML/Jupyter representation using the TypeScript runtime module URL
- ✅ Canonical Python spatial join example (`python/examples/spatial_join.py`)
- ✅ Unit tests using stdlib `unittest`
- ✅ Python-generated spatial join spec matches `examples/specs/03-spatial-join.json` exactly
- ✅ Browser runtime test executes the Python-generated spatial join spec end-to-end

**Python Test Results:**
- ✅ `cd python && python -m unittest discover -s tests` passes: 4 passed
- ✅ Python-generated spatial join spec validates against `schema/autark-spec-v0.1.json`
- ✅ `npm run test:runtime` includes Python-generated spec round-trip: Python builder → JSON → TypeScript runtime → browser render/link assertions
- ✅ Browser tests pass for Jupyter integration (automated Playwright test)

**Additional Examples Created (2026-06-10):**
- ✅ [python/examples/simple_geojson_map.py](python/examples/simple_geojson_map.py) - Basic GeoJSON map with styling
- ✅ [python/examples/csv_points_map.py](python/examples/csv_points_map.py) - CSV points + histogram
- ✅ All examples include CLI interfaces (`--validate`, `--output`, `--html`)
- ✅ All examples validate against JSON schema

**Documentation Created (2026-06-10):**
- ✅ [python/README.md](python/README.md) - Package overview
- ✅ [python/QUICKSTART.md](python/QUICKSTART.md) - Quick start guide
- ✅ [python/examples/README.md](python/examples/README.md) - Complete examples guide with API reference
- ✅ [JUPYTER_QUICKSTART.md](JUPYTER_QUICKSTART.md) - Jupyter integration guide
- ✅ [python/examples/JUPYTER_TESTING.md](python/examples/JUPYTER_TESTING.md) - Troubleshooting
- ✅ [JUPYTER_INTEGRATION_RESULTS.md](JUPYTER_INTEGRATION_RESULTS.md) - Test results
- ✅ [MVP_COMPLETION_SUMMARY.md](MVP_COMPLETION_SUMMARY.md) - Completion report

**Deliberately Deferred to v0.2:**
- pandas/GeoPandas direct serialization helpers
- Runtime bundling for offline use
- PyPI packaging and publishing
- Full API reference documentation
- Broader OSM/Overpass example coverage beyond current HAR/live smoke fixtures

### Success Metrics

**MVP Success (v0.1):**
- [x] JSON Schema complete and validated
- [x] Example specs validate successfully
- [x] Runtime implementation complete (initial pass)
- [x] Runtime TypeScript configuration fixed (removed project references)
- [x] Runtime package dependencies fixed (workspace:* → concrete versions)
- [x] Testing infrastructure created (schema validation, fixtures, HAR tests, Jupyter tests)
- [x] Testing documentation complete
- [x] Runtime builds and compiles successfully (`npm install` + `make build`)
- [x] Runtime API mismatches fixed ✅ **ALL FIXED**
  - [x] DataLoader parameter names (OSM, GeoJSON, CSV)
  - [x] ViewRenderer API calls (getLayer, AutkPlot constructor, updateThematic/updateColorMap)
  - [x] LinkManager API calls (setHighlightedIds, PlotEvent enum)
  - [x] TransformExecutor near parameter structure
  - [x] **AJV strict mode bug fixed** (2026-06-10)
- [x] Runtime executes all example specs in browser
  - [x] Local spatial join example executes
  - [x] GeoJSON map example executes
  - [x] CSV + histogram example executes
  - [x] OSM HAR runtime fixture executes
- [x] Can create OSM map from Python (API exists; runtime OSM path verified through HAR/live fixtures)
- [x] Can create GeoJSON map from Python ✅ **VALIDATED**
- [x] Can add histogram linked to map ✅ **VALIDATED**
- [x] Can perform spatial join ✅ **VALIDATED**
- [x] Display works in Jupyter ✅ **BROWSER TESTS PASS** (manual notebook testing pending)
- [x] Can export standalone HTML scaffold ✅ **WORKING**
- [x] Documentation covers all MVP features ✅ **COMPLETE**
  - [x] Package README
  - [x] Quick start guide
  - [x] Examples documentation
  - [x] Jupyter integration guides
  - [x] API quick reference
- [x] At least 3 working end-to-end examples ✅ **3 EXAMPLES COMPLETE**
  - [x] simple_geojson_map.py
  - [x] csv_points_map.py
  - [x] spatial_join.py

**Current Status:** MVP runtime/Python API complete for v0.1; remaining items are polish or explicitly deferred v0.2 scope.
- Phase 1: ✅ **COMPLETE** (Schema, examples, conventions)
- Phase 2: ✅ **COMPLETE** - Runtime tested and working (OSM HAR covered; live Overpass manual)
- Phase 3: ✅ **COMPLETE** - Python API fully implemented
- Phase 4: ✅ **COMPLETE** - Examples and documentation created

**Remaining TODOs:**
- Manual testing in actual Jupyter/JupyterLab/VS Code notebooks (user testing)
- Polygon `strokeWidth` support via mesh-based outline geometry
- Field-driven `encoding.opacity`, `encoding.size`, and `encoding.height`
- Visual regression snapshots
- Full API reference documentation (deferred to v0.2)
