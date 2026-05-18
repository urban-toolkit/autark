# Build heatmap / load grid layer merge plan

## Shared decisions

- This is a breaking API cleanup.
- Keep `build-heatmap` as the only use case for grid-based heatmap generation.
- Remove `load-grid-layer` as a standalone use case and remove the public `db.loadGridLayer()` API.
- Grid creation logic may remain as an internal helper inside `build-heatmap`, but not as a separate public use case or exported type.
- `BuildHeatmapUseCase` becomes responsible for the full workflow: validate inputs, create the grid table, run the spatial aggregation, and convert the result into raster-band properties.
- Update docs, exports, and examples in the same change set so there is no legacy surface left behind.
- If any internal logic from `load-grid-layer` remains useful, keep it file-local or private to `build-heatmap`; do not preserve the old abstraction boundary.

## Task 1 — Fold grid creation into `build-heatmap`

- Goal
  - Make `BuildHeatmapUseCase` fully self-contained by moving grid-table creation out of `LoadGridLayerUseCase`.

- Context
  - `BuildHeatmapUseCase` currently depends on `LoadGridLayerUseCase` only to create a raster-like centroid grid before running the spatial join.
  - That split adds one extra public abstraction without giving the user a distinct end-to-end workflow.

- Proposed Approach
  - Move the grid table creation logic from `autk-db/src/use-cases/load-grid-layer/load-grid-layer-use-case.ts` into `autk-db/src/use-cases/build-heatmap/build-heatmap-use-case.ts`.
  - Keep the logic private to `BuildHeatmapUseCase` as one or more private methods or file-local helpers.
  - Preserve current grid behavior:
    - validate bounding box, rows, and columns
    - create/replace the output table
    - insert centroid points for each cell
    - create the spatial index
    - return table metadata compatible with the later raster conversion step
  - Make sure error behavior currently owned by `load-grid-layer` is preserved in `build-heatmap`.

- Acceptance Criteria
  - `BuildHeatmapUseCase` no longer imports or instantiates `LoadGridLayerUseCase`.
  - Building a heatmap still creates the same kind of intermediate grid table and final raster table.
  - Invalid bounding box, rows, or columns fail with clear errors from `build-heatmap` itself.

- Spec
  - short

- Verify
  - `cd /Users/mlage/Git/autark && make typecheck`
  - `cd /Users/mlage/Git/autark && grep -Rni "LoadGridLayerUseCase\|load-grid-layer" autk-db/src/use-cases/build-heatmap autk-db/src/db.ts`
  - Run one existing heatmap example after build:
    - `cd /Users/mlage/Git/autark && make dev APP=gallery OPEN=/src/autk-map/heatmap-vis.ts`
    - confirm the heatmap loads and renders

- Out of Scope
  - Changing the heatmap JSON band naming strategy.

## Task 2 — Remove the standalone `load-grid-layer` public surface

- Goal
  - Delete the standalone `load-grid-layer` use case and its public API once `build-heatmap` owns the behavior.

- Context
  - The current repo exposes `LoadGridLayerUseCase`, `LoadGridLayerParams`, and `db.loadGridLayer()`, but the user no longer wants grid loading as a separate concept.
  - Keeping the old public API would preserve a legacy abstraction the user explicitly wants gone.

- Proposed Approach
  - Remove the `autk-db/src/use-cases/load-grid-layer/` directory.
  - Remove exports from `autk-db/src/index.ts`.
  - Remove `LoadGridLayerUseCase` initialization, storage, docs, and the `loadGridLayer()` method from `autk-db/src/db.ts`.
  - Regenerate docs so public API pages for `LoadGridLayerParams` and `loadGridLayer()` disappear.

- Acceptance Criteria
  - `load-grid-layer` no longer exists under `autk-db/src/use-cases/`.
  - `db.loadGridLayer()` is removed from source and generated docs.
  - `LoadGridLayerParams` is no longer exported from `@urban-toolkit/autk-db`.

- Spec
  - none

- Verify
  - `cd /Users/mlage/Git/autark && grep -Rni "loadGridLayer\|LoadGridLayerParams\|LoadGridLayerUseCase\|load-grid-layer" autk-db/src autk-db/README.md gallery usecases --include='*.ts' --include='*.tsx' --include='*.md'`
  - `cd /Users/mlage/Git/autark && make docs`
  - Confirm generated docs no longer include `loadGridLayer()` or `LoadGridLayerParams`.

- Out of Scope
  - Providing compatibility aliases or deprecation wrappers.

## Task 3 — Update documentation and examples to the single heatmap workflow

- Goal
  - Make the documentation reflect that heatmap generation is the only supported grid workflow.

- Context
  - The public API rename/removal is breaking. The repo must not suggest that users can or should construct grid layers directly via `loadGridLayer()`.
  - Heatmap examples already exercise the intended workflow and should become the canonical usage path.

- Proposed Approach
  - Update `autk-db/README.md`, `db.ts` JSDoc, and any generated API text touched by exports.
  - Remove references to generated grid layers as a standalone loading feature.
  - If any example or use case mentions `loadGridLayer()`, replace it with `buildHeatmap()` or remove the reference.
  - Clarify in `buildHeatmap` docs that it owns both grid creation and raster conversion.

- Acceptance Criteria
  - Public docs describe one grid-based workflow: `buildHeatmap()`.
  - No example or README text instructs users to call `loadGridLayer()`.
  - `buildHeatmap()` docs explain that it creates the grid internally.

- Spec
  - none

- Verify
  - `cd /Users/mlage/Git/autark && grep -Rni "loadGridLayer" autk-db/README.md autk-db/src gallery usecases --include='*.ts' --include='*.tsx' --include='*.md'`
  - `cd /Users/mlage/Git/autark && make docs`

- Out of Scope
  - Broader redesign of the heatmap parameter shape.

## Task 4 — Add regression coverage for the merged workflow

- Goal
  - Lock in the merged behavior so future changes do not reintroduce a separate grid-loading dependency.

- Context
  - The riskiest part of the merge is preserving the exact grid creation semantics and raster output shape while changing the internal ownership.
  - Heatmap generation depends on multiple steps: grid creation, spatial join, and raster property transformation.

- Proposed Approach
  - Add or update tests around `BuildHeatmapUseCase` to cover:
    - grid creation from workspace bounding box
    - invalid bounding box / invalid rows-columns errors
    - resulting raster-band properties after aggregation
  - Prefer focused `autk-db` tests over only relying on gallery/manual verification.

- Acceptance Criteria
  - Tests fail if `buildHeatmap()` stops creating a valid grid before the join.
  - Tests fail if the final table no longer exposes raster bands as expected.
  - Tests cover at least one successful heatmap build and one validation failure.

- Spec
  - none

- Verify
  - `cd /Users/mlage/Git/autark && make typecheck`
  - `cd /Users/mlage/Git/autark && make verify`

- Out of Scope
  - Exhaustive visual regression coverage for all gallery heatmap examples.
