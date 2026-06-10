# Autark Code Quality Review Notes

Date: 2026-06-07

These notes summarize a static code-review pass over the Autark monorepo, with emphasis on reusable library code rather than gallery or use-case examples. The goal is to capture engineering findings that can later be turned into an implementation plan.

## Overall Assessment

Autark is a substantial and technically ambitious codebase. The most sophisticated implementation areas are the DuckDB-WASM spatial database workflows, OSM processing pipeline, WebGPU map renderer, render-based compute pipeline, GPGPU shader generation, and building/roof triangulation.

The code is much stronger than a throwaway research prototype. It has clear modular packages, typed public APIs, explicit WebGPU cleanup paths in the map renderer, and serious algorithmic work. The main weaknesses are not in the core ideas, but in production hardening: safer SQL construction, more consistent error handling, deterministic behavior, lifecycle cleanup, and algorithm-level tests.

## Strengths

- The package decomposition is sensible: `autk-core`, `autk-db`, `autk-compute`, `autk-map`, `autk-plot`, and the umbrella `autk` package each have a clear role.
- WebGPU resource ownership is handled seriously in the map/rendering stack. `AutkMap.destroy()`, renderer cleanup, layer cleanup, and pipeline cleanup are all explicit.
- The compute packages contain nontrivial engineering, especially dynamic WGSL shader construction, input packing, buffer readback, render-based sampling, batching, and visibility aggregation.
- The database package provides a high-level spatial workflow on top of DuckDB-WASM, including OSM loading, OSM layer extraction, GeoJSON/CSV/JSON/GeoTIFF ingestion, spatial joins, heatmaps, and raw SQL.
- The building triangulation code supports many OSM roof forms and includes fallback behavior for difficult geometry.
- The test suite has many Playwright visual/integration tests and reference screenshots for gallery workflows.

## Main Findings

### 1. SQL Construction Is Too Ad Hoc

Severity: high

Several user-facing or semi-user-facing values are interpolated directly into SQL strings. This creates two related problems:

- Valid identifiers can break SQL when they contain characters such as hyphens.
- Malicious or accidental input could alter query structure.

Examples:

- `AutkDb.setWorkspace(name)` interpolates schema names directly:
  - `autk-db/src/db.ts:212`
  - `CREATE SCHEMA IF NOT EXISTS ${name}`
  - `USE ${name}`
- CSV loading builds qualified names and SQL options directly:
  - `autk-db/src/use-cases/load-csv/queries.ts:18`
  - `autk-db/src/use-cases/load-csv/queries.ts:123`
- Spatial join has some identifier quoting, but not consistently for schema names, table aliases, and qualified table names:
  - `autk-db/src/use-cases/spatial-join/queries.ts:51`
- Other query builders follow similar string-construction patterns for table names, staging tables, indexes, and output names.

Recommended direction:

- Add a central SQL utility module with:
  - `quoteIdentifier(identifier: string)`
  - `quoteQualifiedName(schema: string, table: string)`
  - `escapeSqlString(value: string)`
  - `assertSafeNumber(value: number, label: string)`
  - optional validation for generated temporary identifiers and index names
- Replace local ad hoc SQL escaping with the shared helpers.
- Add unit tests for all SQL builders using edge-case identifiers such as `my-analysis`, `table with space`, quotes, reserved words, and suspicious strings.

### 2. Drop Failures Can Desynchronize Metadata

Severity: medium/high

`DropTableUseCase.exec()` catches errors and returns `{ success: false }` rather than throwing:

- `autk-db/src/use-cases/drop-table/use-case.ts:31`

But `AutkDb.removeLayer()` ignores that result and removes the table from the in-memory workspace registry regardless:

- `autk-db/src/db.ts:814`

This means DuckDB and Autark metadata can disagree if a drop fails.

Recommended direction:

- Either make `DropTableUseCase.exec()` throw on failure, or have `removeLayer()` check the result before mutating `workspaceData.tables`.
- Add a regression test where the drop operation fails and verify metadata remains consistent.

### 3. Error Handling Is Inconsistent Across Public APIs

Severity: medium

Some public methods throw, while others log and return. This makes failures harder to handle programmatically.

Examples:

- `AutkMap.loadCollection()` documents that it never throws and logs errors:
  - `autk-map/src/map.ts:221`
- Duplicate layer ids log an error and return `null`:
  - `autk-map/src/layer-manager.ts:81`
- `AutkMap.createLayer()` silently does nothing when `addLayer()` returns `null`:
  - `autk-map/src/map.ts:1191`
- Renderer initialization logs errors and returns `false`:
  - `autk-map/src/renderer.ts:205`

For demos, console output is acceptable. For a toolkit, silent returns make notebook workflows, tutorials, tests, and agent-assisted development harder.

Recommended direction:

- Define an error-handling policy for public APIs:
  - throw typed errors for invalid caller input and unrecoverable failures;
  - return structured result objects for expected recoverable failures;
  - reserve `console.warn/error` for optional diagnostics.
- Consider a configurable logger/progress callback for long-running OSM and PBF workflows.

### 4. `AutkDb` Needs a Public Teardown API

Severity: medium

The map side has explicit lifecycle cleanup, but the database side does not appear to expose an equivalent public method.

`AutkDb` owns an `AsyncDuckDB` and connection:

- `autk-db/src/db.ts:62`

It initializes them in `init()`:

- `autk-db/src/db.ts:158`

The DuckDB loader creates browser/Node workers with termination capability:

- `autk-db/src/duckdb.ts:79`

Recommended direction:

- Add `await db.close()` or `await db.destroy()`.
- Close the active connection.
- Terminate DuckDB/worker resources where the DuckDB-WASM API supports it.
- Clear internal use-case references and workspace state.
- Add tests for repeated init/destroy cycles.

### 5. Building Fallback Heights Are Nondeterministic

Severity: medium

`TriangulatorBuildings.buildMesh()` assigns random fallback heights when `allowZeroHeightBuildings` is enabled:

- `autk-core/src/triangulator-buildings.ts:86`
- `heightInfo = [0, (3 + 4 * Math.random()) * 3.4]`

This makes rendering, screenshots, visual tests, paper figures, and debugging less reproducible.

Recommended direction:

- Replace the random fallback with a deterministic default height.
- Or accept a seeded random generator / height callback when variability is desired.
- Add a test verifying deterministic output for the same input.

### 6. Algorithm-Level Test Coverage Is Thin

Severity: medium

The repo has many Playwright gallery tests and reference images, but I did not see package-level unit/property tests for the core algorithms.

Important areas that deserve targeted tests:

- SQL query builders and identifier quoting.
- OSM relation reconstruction and multipolygon ring handling.
- Spatial join query generation, especially `NEAR`, `groupBy`, `weighted`, `collect`, and normalization.
- Building and roof triangulation, including degenerate rings and unsupported roof tags.
- GPGPU shader generation and invalid identifier rejection.
- Render-compute batching limits and aggregation edge cases.
- GeoJSON/CSV/JSON/GeoTIFF loader cleanup paths.

Recommended direction:

- Add a small unit-test framework such as Vitest for package-level tests.
- Keep Playwright visual tests for end-to-end behavior.
- Add property or golden-output tests for geometry and SQL builder code.

### 7. Large Modules Concentrate Too Much Responsibility

Severity: low/medium

Several important modules are large and own multiple responsibilities:

- `autk-map/src/map.ts`
- `autk-db/src/db.ts`
- `autk-compute/src/compute-render.ts`
- `autk-compute/src/compute-gpgpu.ts`
- `autk-core/src/triangulator-roofs.ts`
- `autk-db/src/use-cases/spatial-join/queries.ts`

This is understandable given the complexity of the system, but it increases review, testing, and maintenance cost.

Recommended direction:

- Refactor only where there is a clear seam:
  - SQL utilities and query builders;
  - map layer creation;
  - renderer lifecycle;
  - compute shader generation;
  - roof shape-specific geometry helpers.
- Avoid broad rewrites. Prioritize extracting testable pure functions.

### 8. Type Safety Is Mostly Good, But Some Escape Hatches Are Too Broad

Severity: low/medium

The packages use `strict: true`, which is good. However, ESLint disables `@typescript-eslint/no-explicit-any`:

- `eslint.config.cjs:40`

There are real `any` escape hatches in:

- D3 plot code.
- DuckDB worker adaptation.
- GeoJSON/turf interop.
- OSM processing rows.
- compute render result merging.

Recommended direction:

- Do not try to eliminate all `any` immediately.
- Start by tightening `any` at package boundaries and public APIs.
- Keep localized interop casts where third-party typings are weak, but wrap them in small helper functions.

### 9. Console Logging Should Become Configurable Diagnostics

Severity: low/medium

Library code emits many `console.log`, `console.warn`, and `console.error` messages during normal operation, especially in OSM loading, PBF loading, triangulation, map layer creation, and renderer initialization.

Examples:

- `autk-db/src/db.ts:380`
- `autk-db/src/use-cases/load-osm-overpass/use-case.ts`
- `autk-db/src/use-cases/load-osm-pbf/use-case.ts`
- `autk-map/src/map.ts`
- `autk-core/src/triangulator-buildings.ts`

Recommended direction:

- Add an optional logger interface:
  - `debug`
  - `info`
  - `warn`
  - `error`
  - progress events for long-running operations
- Default to quiet or warning-only behavior for library consumers.
- Let examples opt into verbose logging.

## Suggested Implementation Plan

This section is intentionally rough. It can be converted into issues or milestones later.

### Phase 1: Safety and Correctness

1. Add shared SQL identifier/literal utilities.
2. Convert the highest-risk query builders to use them:
   - workspace/schema handling;
   - CSV/JSON loaders;
   - drop table;
   - spatial join;
   - get layer/table;
   - raw query output table creation.
3. Fix `removeLayer()` metadata synchronization on failed drop.
4. Replace random building fallback heights with deterministic behavior.
5. Add unit tests for the above.

### Phase 2: Lifecycle and API Hardening

1. Add `AutkDb.close()` / `AutkDb.destroy()`.
2. Define public API error semantics.
3. Replace silent log-and-return paths with typed errors or structured results.
4. Add a configurable logger/progress interface.
5. Add tests for repeated database and map lifecycle operations.

### Phase 3: Algorithmic Test Coverage

1. Add package-level unit tests for:
   - spatial join SQL generation;
   - OSM relation reconstruction;
   - triangulation edge cases;
   - roof generation;
   - GPGPU shader generation;
   - render-compute batching and aggregation.
2. Keep existing Playwright tests as integration/visual regression tests.
3. Add small golden fixtures for known urban datasets and geometry outputs.

### Phase 4: Maintainability Refactors

1. Extract pure helpers from the largest modules where tests can lock behavior.
2. Reduce `any` at public boundaries.
3. Split map layer creation and render pipeline setup only where it simplifies tests.
4. Avoid broad rewrites unless test coverage is already in place.

## Paper-Relevant Takeaways

From a paper perspective, the implementation is strong enough to support a system contribution, but the manuscript should distinguish between:

- the sophisticated implementation already present, and
- the engineering hardening that remains.

The strongest implementation claims are:

- serverless DuckDB-WASM spatial workflows;
- modular urban data loading and layer extraction;
- WebGPU map rendering;
- render-based compute over sampled viewpoints;
- dynamic GPGPU feature computation;
- OSM building and roof triangulation;
- linked map/plot workflows.

The paper should avoid overclaiming production maturity unless the hardening items above are addressed. A strong revision can present Autark as a research toolkit with serious system architecture, real implementation depth, and a clear roadmap for broader adoption.
