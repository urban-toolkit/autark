# Spatial join API simplification plan

## Shared decisions

- This is a breaking API change. Do not keep compatibility shims, aliases, or legacy overloads.
- `SpatialQueryParams` will always mutate the root table. Remove `output` entirely.
- Spatial join execution will always use `LEFT JOIN`. Remove `joinType` entirely.
- In `groupBy.selectColumns`, remove `tableName`. All selected columns are assumed to come from `tableJoinName`.
- Remove `aggregateFnResultColumnName`. Aggregated output keys must always follow the derived naming strategy: `sjoin.<aggregateFn>.<tableJoinName>` for single-key aggregates such as `count`, `weighted`, and `collect`, and `sjoin.<aggregateFn>.<tableJoinName>.<column>` for column-based aggregates such as `sum`, `avg`, `min`, and `max`.
- Because the root table is always modified, callers that previously created a new table via spatial join must create/copy that root table before invoking spatial join.
- All internal callers, gallery examples, docs, and exported typings must be updated in the same change set.

## Task 1 — Simplify the public spatial join contract

- Goal
  - Replace the current `SpatialQueryParams` API with the smaller non-legacy contract.

- Context
  - The current API carries unused flexibility (`output`, `joinType`, per-column `tableName`, custom aggregate result names) that increases call-site noise and internal branching.
  - `db.spatialQuery()` and the generated docs currently describe the old contract.

- Proposed Approach
  - Update `autk-db/src/use-cases/spatial-join/interfaces.ts` to remove:
    - `output`
    - `joinType`
    - `groupBy.selectColumns[].tableName`
    - `groupBy.selectColumns[].aggregateFnResultColumnName`
  - Rewrite the JSDoc in `interfaces.ts`, `index.ts`, and `db.ts` examples to describe the new contract and the “always modifies root table” behavior.
  - Update any exported `.d.ts` output indirectly by rebuilding docs/types.

- Acceptance Criteria
  - `SpatialQueryParams` exposes only the new fields.
  - Public docs and examples no longer mention `output`, `joinType`, `tableName` inside `groupBy`, or `aggregateFnResultColumnName`.
  - `db.spatialQuery()` documentation states that the root table is modified in place.

- Spec
  - short

- Verify
  - `cd /Users/mlage/Git/autark && npx tsc --noEmit --skipLibCheck -p autk-db/tsconfig.json`
  - `cd /Users/mlage/Git/autark && make docs`
  - Confirm generated `autk-db/docs/interfaces/SpatialQueryParams.md` no longer contains the removed fields.

- Out of Scope
  - Changing supported spatial predicates.

## Task 2 — Refactor spatial join execution to match the new contract

- Goal
  - Make `SpatialJoinUseCase` and `queries.ts` implement the simplified API without legacy branches.

- Context
  - The use case currently derives output table behavior and join type from params.
  - Group-by resolution currently looks up tables per selected column and supports custom result names.
  - The query builder already assumes most aggregation data comes from the join table, so this refactor should remove indirection rather than add new behavior.

- Proposed Approach
  - In `spatial-join-use-case.ts`:
    - remove `created` bookkeeping
    - always target `tableRootName` as the output table
    - hardcode `LEFT` join behavior
    - replace `addTablesToGroupBy()` with a simpler mapper that binds every `groupBy.selectColumns[]` entry to `tableJoin`
  - In `queries.ts`:
    - remove `joinType` and `outputTableName` params
    - simplify NEAR and INTERSECT join SQL generation to always emit `LEFT JOIN`
    - remove all logic that depends on `aggregateFnResultColumnName`
    - derive JSON keys from `tableJoin.name` and `column` using one consistent helper
    - remove table-switching assumptions from group-by normalization and aggregate builders
  - In `db.ts`:
    - simplify `spatialQuery()` state updates because the root table is always modified in place

- Acceptance Criteria
  - Spatial joins always rewrite the root table and return that updated table.
  - SQL generation contains no branch for non-LEFT joins.
  - Group-by column resolution no longer requires per-column table lookup.
  - Aggregated JSON keys are deterministic and derived solely from `tableJoinName`, aggregate function, and column name.

- Spec
  - short

- Verify
  - `cd /Users/mlage/Git/autark && npx tsc --noEmit --skipLibCheck -p autk-db/tsconfig.json`
  - `cd /Users/mlage/Git/autark && make test APP=usecases OPEN=/src/urbane/main.html` if a spatial-join usecase fixture already exists; otherwise verify with targeted runtime script or existing automated tests updated in Task 3.
  - Run a manual smoke query in a local example after build:
    1. load two vector tables
    2. call `db.spatialQuery({ tableRootName, tableJoinName, spatialPredicate: 'INTERSECT' })`
    3. confirm the returned table name equals `tableRootName`

- Out of Scope
  - Adding new aggregation functions.

## Task 3 — Update all internal callers and examples to the new API

- Goal
  - Remove all old spatial join call shapes across the repo in one pass.

- Context
  - `BuildHeatmapUseCase` currently passes `joinType` and depends on old groupBy column naming.
  - Gallery examples and any library consumers inside the monorepo will break immediately after Task 1 unless updated.

- Proposed Approach
  - Update `autk-db/src/use-cases/build-heatmap/build-heatmap-use-case.ts` and `interfaces.ts`:
    - remove `tableName` and `aggregateFnResultColumnName` from heatmap `groupBy.selectColumns`
    - update raster band JSON path derivation to the new naming strategy
    - remove explicit `joinType` and `output` when calling `spatialJoinUseCase.exec()`
  - Update all gallery examples that call `spatialQuery()` or build `groupBy.selectColumns`.
  - If any tests or fixtures rely on custom aggregate names or create-new output behavior, rewrite them to the new root-modifying workflow.

- Acceptance Criteria
  - No source file in the repo references removed spatial join fields.
  - Build heatmap still produces valid band extraction paths under the new `sjoin` key layout.
  - Gallery/example code compiles against the new API.

- Spec
  - none

- Verify
  - `cd /Users/mlage/Git/autark && grep -Rni "aggregateFnResultColumnName\|joinType\|output:.*MODIFY_ROOT\|output:.*CREATE_NEW\|selectColumns:.*tableName" autk-db gallery usecases --include='*.ts' --include='*.tsx' --include='*.js'`
  - `cd /Users/mlage/Git/autark && make typecheck`
  - Build or run at least one gallery spatial-join example and one heatmap example.

- Out of Scope
  - Redesigning the heatmap API beyond what is required by the spatial join change.

## Task 4 — Add regression coverage for the simplified contract

- Goal
  - Lock in the new behavior so future changes do not reintroduce optional output/join behaviors or legacy naming.

- Context
  - This change removes multiple dimensions of configurability, so tests must assert the narrower contract explicitly.
  - The highest-risk areas are JSON output shape, NEAR behavior, and heatmap band extraction paths.

- Proposed Approach
  - Add or update tests around:
    - root-table in-place mutation
    - default `LEFT` join semantics for unmatched root rows
    - `groupBy` aggregation output naming under `properties.sjoin`
    - heatmap raster extraction from the new JSON paths
  - Prefer focused use-case tests over broad end-to-end-only coverage.

- Acceptance Criteria
  - Tests fail if a spatial join stops preserving unmatched root rows.
  - Tests fail if aggregated keys deviate from the new naming strategy.
  - Tests cover at least one `INTERSECT` and one `NEAR` flow using the simplified params.

- Spec
  - none

- Verify
  - `cd /Users/mlage/Git/autark && make typecheck`
  - `cd /Users/mlage/Git/autark && make verify`

- Out of Scope
  - Exhaustive SQL snapshot coverage for every aggregation permutation.
