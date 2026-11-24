# CRS option audit across Autark packages

**Baseline:** `183d916f`. **Scope:** public and internal CRS-related options in `autk-core`, `autk-map`, `autk-db`, `autk-compute`, plus gallery, tutorial, and README usage. No code was changed for this audit.

## Implementation status

Applied on top of this baseline:

- Workspace CRS is now `crs` everywhere: `WorkspaceConfiguration.crs`, `setWorkspace({ crs, precisionGrid })`, and `getWorkspaceConfiguration().crs`.
- Every loader takes `sourceCrs` at the top level: `loadGeojson`, `loadCsv`, `loadJson`, `loadGeoTiff`, and `loadOsm`. CSV and JSON no longer nest it in `geometryColumns`; OSM no longer nests it in `autoLoadLayers`.
- `loadTiles()` and `loadTerrain()` no longer accept `crs`. The map constructor is the only place that sets the map workspace CRS; the order-dependent conflict path and `_workspaceCrsEstablished` were removed.
- Constants are `DEFAULT_WORKSPACE_CRS` and `DEFAULT_SOURCE_CRS`; the old names are gone.
- Gallery, use cases, tests, and docs were migrated.

Verification: `make verify` (1,444 tests passed, 3 skipped), map, terrain, and render-order WebGPU suites, gallery build, and package validation passed.

## Short version

Autark has **three names for one concept** (`crs`, `coordinateFormat`, `sourceCrs`) and **one name with two opposite meanings**: `coordinateFormat` is the workspace CRS in `AutkDb.setWorkspace()` and the **input** CRS in every `load*()` call. The same input-CRS option is top-level in some loaders and nested in others, the map and database default it differently, and raster reprojection is allowed in one package and rejected in the other.

## Inventory of CRS options

| Package | API | Option | Meaning | Default |
| --- | --- | --- | --- | --- |
| core | `createCoordinateTransform` / `reproject*` | `sourceCrs`, `targetCrs` | input, output | required |
| core | `registerCrs`, `isSupportedCrs`, `lonLatToCrs`, `crsToLonLat` | `crs` | CRS definition or workspace | — |
| map | `new AutkMap()` | `crs` | **workspace** CRS | `EPSG:3395` |
| map | `map.workspaceCrs` | getter | **workspace** CRS | — |
| map | `loadCollection()` | `sourceCrs` | **input** vector CRS | workspace (no transform) |
| map | `loadTiles()` | `crs` | **workspace** CRS | inherited |
| map | `loadTerrain()` | `crs` | **workspace** CRS | inherited |
| db | `setWorkspace()` / `WorkspaceConfiguration` | `coordinateFormat` | **workspace** CRS | `EPSG:3395` |
| db | `loadGeojson()` | `coordinateFormat` | **input** CRS | `EPSG:4326` |
| db | `loadCsv()` → `geometryColumns` | `coordinateFormat` | **input** CRS | `EPSG:4326` |
| db | `loadJson()` → `geometryColumns` | `coordinateFormat` | **input** CRS | `EPSG:4326` |
| db | `loadGeoTiff()` | `coordinateFormat` | **input** CRS | `EPSG:4326` |
| db | `loadOsm()` → `autoLoadLayers` | `coordinateFormat` | **input** CRS | `EPSG:4326` |
| compute | — | — | assumes workspace coordinates | — |

Also: `DEFAULT_WORKSPACE_COORDINATE_FORMAT` and `DEFAULT_INPUT_COORDINATE_FORMAT` name the two roles, but both say "format" rather than CRS.

## Inconsistencies

### 1. Three names, one concept

- `crs` — [`MapOptions.crs`](../autk-map/src/api.ts#L39), [`AutkMap.workspaceCrs`](../autk-map/src/map.ts#L236), tile and terrain options.
- `coordinateFormat` — [`WorkspaceConfiguration`](../autk-db/src/interfaces.ts#L156), every database loader, and the database README.
- `sourceCrs` — [`LoadCollectionParams.sourceCrs`](../autk-map/src/api.ts#L111) and the core transform helpers.

A reader has to learn that all three are the same kind of value, and that `coordinateFormat` does not describe a number format.

### 2. One name with opposite meanings

`coordinateFormat` is the **target** in `db.setWorkspace('x', { coordinateFormat: 'EPSG:4326' })` and the **source** in `db.loadCsv({ geometryColumns: { coordinateFormat: 'EPSG:4326' } })`. The same word, in the same package, tells the database both where data comes from and where it must end up. The map avoids this because it uses `crs` for workspace and `sourceCrs` for input, but the database is the larger surface.

### 3. The same option is nested differently

Input CRS placement varies by loader:

- `loadGeojson({ coordinateFormat })` — top level.
- `loadGeoTiff({ coordinateFormat })` — top level.
- `loadCsv({ geometryColumns: { coordinateFormat } })` — inside geometry columns.
- `loadJson({ geometryColumns: { coordinateFormat } })` — inside geometry columns.
- `loadOsm({ autoLoadLayers: { coordinateFormat } })` — inside auto-load options.

The placement carries no meaning: all five describe the CRS of incoming coordinates, not how columns are named.

### 4. The same input defaults differently

- `map.loadCollection()` with no `sourceCrs` assumes the collection is **already in the workspace CRS** ([api.ts](../autk-map/src/api.ts#L107)).
- Every `db.load*()` with no `coordinateFormat` assumes **EPSG:4326** ([consts.ts](../autk-db/src/consts.ts#L13)).

So the same unannotated GeoJSON is treated as projected by the map and as longitude/latitude by the database. Both defaults are defensible, but together they are a trap: passing database output back through `map.loadCollection()` with a `sourceCrs` reprojects it twice.

### 5. Raster handling differs between packages

[`map.loadCollection()`](../autk-map/src/map.ts#L370) **rejects** raster reprojection (`Raster collections must already use the workspace CRS`) and only performs that check when `sourceCrs` is supplied. [`db.loadGeoTiff()`](../autk-db/src/use-cases/load-geotiff/use-case.ts#L65) accepts an input CRS and transforms the raster extent.

The rule is therefore: rasters can be reprojected, but only through the database, and only if the map caller remembered to normalize first. Omitting `sourceCrs` in the map bypasses the guard entirely.

### 6. Workspace CRS is not established through one path

- Constructor: `new AutkMap(canvas, { crs })`.
- Tile load: `loadTiles({ crs })` can establish it.
- Terrain load: `loadTerrain({ crs })` can establish it.
- `setView()` **locks** the current CRS without accepting one ([map.ts](../autk-map/src/map.ts#L258)).
- `loadCollection()` has no workspace option; it reprojects into the current CRS ([map.ts](../autk-map/src/map.ts#L364)).
- `AutkDb` always has a workspace CRS, defaulting to `EPSG:3395`, and refuses to change it after tables exist ([db.ts](../autk-db/src/db.ts#L235)).

The result is order-dependent behavior: `setView()` first means a later `loadTiles({ crs: 'EPSG:4326' })` throws, while the same call before `setView()` succeeds. Loading a collection first has the same locking effect and offers no way to choose the CRS at that moment.

### 7. Validation differs

- The map validates the workspace CRS with core `isSupportedCrs` before constructing ([map.ts](../autk-map/src/map.ts#L205)).
- `db.setWorkspace()` only checks that `coordinateFormat` is a nonempty string ([db.ts](../autk-db/src/db.ts#L1016)).

A misspelled CRS can therefore be accepted by the database and fail later inside DuckDB or Proj4js.

### 8. Database and map workspace CRS can silently diverge

Nothing ties `db.getWorkspaceConfiguration().coordinateFormat` to `map.workspaceCrs`. Applications must pass the same value to both. The gallery already works around this by exporting the constant and reading it manually ([tiles-example.ts](../gallery/src/autk-map/tiles-example.ts#L8)), which is evidence the coupling is real but unenforced.

### 9. `precisionGrid` has no counterpart

`WorkspaceConfiguration` couples CRS and precision grid, and the grid is expressed in workspace CRS units ([README](../autk-db/README.md#L62)). The map has no workspace configuration object, only a CRS getter, so "workspace configuration" means two different things in the two packages.

### 10. Terminology drifts in documentation

- Map README: "`sourceCrs` accepts a name known to Proj4js" and "`crs` is the workspace coordinate system" ([map README](../autk-map/README.md#L220)).
- Database README: "`coordinateFormat`" everywhere, including the workspace section ([db README](../autk-db/README.md#L51)).
- Tutorial: prose only, no option names ([map.html](../tutorial/map.html#L55)).

Each page is internally correct; there is no page that states the two roles and their names across packages.

## What is already consistent

- Core helpers use `sourceCrs` and `targetCrs` for input and output, and `crs` for a single CRS.
- Database internals use `sourceCrs` / `targetCrs` consistently, including the raster store.
- Both packages import `DEFAULT_WORKSPACE_COORDINATE_FORMAT` from core, so the default value itself is shared.
- Compute performs no reprojection and consumes whatever it is given; its documentation says positions remain "in source order and CRS" ([compute README](../autk-compute/README.md#L84)), which is accurate but easy to misread as a CRS feature.

## Implemented vocabulary

Use two names everywhere, with no overload:

| Role | Name |
| --- | --- |
| The CRS stored data, camera plane, and rendering use | `crs` |
| The CRS of data handed to a loader | `sourceCrs` |

Sketch:

```ts
// Workspace
new AutkMap(canvas, { crs: 'EPSG:32618' });
map.workspaceCrs; // 'EPSG:32618'

await db.setWorkspace('utm18', { crs: 'EPSG:32618', precisionGrid: 0.01 });
db.getWorkspaceConfiguration().crs;

// Input
map.loadCollection('roads', { collection, sourceCrs: 'EPSG:4326' });
await db.loadGeojson({ outputTableName: 'roads', sourceCrs: 'EPSG:4326' });
await db.loadCsv({ ..., geometryColumns: { latColumnName: 'lat', longColumnName: 'lon' }, sourceCrs: 'EPSG:4326' });
await db.loadGeoTiff({ ..., sourceCrs: 'EPSG:3395' });
```

`sourceCrs` is a loader option, next to the file path, not inside geometry-column descriptions. `loadTiles()` and `loadTerrain()` no longer accept a CRS; the constructor owns it.

## Applied migration

| Current | Proposed | Notes |
| --- | --- | --- |
| `MapOptions.crs` | `crs` | unchanged |
| `map.workspaceCrs` | `workspaceCrs` | unchanged |
| `loadCollection({ sourceCrs })` | `sourceCrs` | unchanged |
| `loadTiles({ crs })`, `loadTerrain({ crs })` | removed | constructor owns the workspace CRS |
| `WorkspaceConfiguration.coordinateFormat` | `crs` | workspace |
| `setWorkspace(name, { coordinateFormat })` | `{ crs }` | workspace |
| `getWorkspaceConfiguration().coordinateFormat` | `.crs` | workspace |
| `loadGeojson({ coordinateFormat })` | `sourceCrs` | top level |
| `loadCsv({ geometryColumns: { coordinateFormat } })` | `loadCsv({ sourceCrs })` | move out of `geometryColumns` |
| `loadJson({ geometryColumns: { coordinateFormat } })` | `loadJson({ sourceCrs })` | move out of `geometryColumns` |
| `loadGeoTiff({ coordinateFormat })` | `sourceCrs` | top level |
| `loadOsm({ autoLoadLayers: { coordinateFormat } })` | `loadOsm({ sourceCrs })` | move out of `autoLoadLayers` |
| `DEFAULT_WORKSPACE_COORDINATE_FORMAT` | `DEFAULT_WORKSPACE_CRS` | re-export from core |
| `DEFAULT_INPUT_COORDINATE_FORMAT` | `DEFAULT_SOURCE_CRS` | keep in db |

## Decisions to make before changing code

1. **Defaults.** Keep the current split (map input defaults to workspace, database input defaults to EPSG:4326) or make both explicit. Keeping the split is safer for existing data; documenting it as "the map expects normalized data, the database expects RFC 7946" makes the behavior predictable. Forcing one default would silently reproject or skip reprojection for someone.
2. **Breaking vs. aliases.** A rename of this size is a breaking change. Given the repository's no-deprecated-API policy, the clean option is a single breaking rename with migration notes, not a long-lived alias layer.
3. **Raster reprojection.** Keep the database as the only raster reprojection path and make that explicit in the map error, or teach the map to transform raster extents too. The second option changes rendering behavior and needs its own tests.
4. **Workspace sync.** Consider a small helper, for example `db.workspaceCrs` and a documented pattern `new AutkMap(canvas, { crs: db.workspaceCrs })`. A full automatic binding between `AutkDb` and `AutkMap` is a larger design change.
5. **Validation.** Decide whether `db.setWorkspace()` should call core `isSupportedCrs`. DuckDB may accept CRS definitions that Proj4js does not, so shared validation could reject valid database setups; the alternative is to validate only the syntax and document the difference.

## Suggested rollout

1. Rename the workspace option in core and database (`coordinateFormat` → `crs`) and update `WorkspaceConfiguration`, `setWorkspace`, getters, and docs.
2. Rename input options to `sourceCrs` and lift them to the loader's top level for CSV, JSON, and OSM.
3. Remove or rename `crs` in `loadTiles()` and `loadTerrain()`; update the order-dependent tests around `setView()` and first loads.
4. Update gallery, tutorial, use cases, and the code snippets that teach these calls.
5. Add a short "Coordinate reference systems" section to the root README that states the two roles, the two defaults, and the database-to-map workflow.

No behavior needs to change for steps 1–3 beyond names and option placement; the default split and raster rule are policy decisions, not mechanical renames.
