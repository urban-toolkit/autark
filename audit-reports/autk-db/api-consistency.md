# `@urban-toolkit/autk-db` API consistency audit

## Summary

The high-level `AutkDb` API covers substantial functionality, but query output, metadata ownership, naming, environment support, and error behavior are inconsistent.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| High | `rawQuery` documentation omits a required `output`, while implementation dereferences it unconditionally. | Example in `db.ts:787-795` supplies only `query`; `RawQueryParams.output` is required (`raw-query/interfaces.ts:6-17`); `db.ts:803` and `raw-query/use-case.ts:22` read `params.output.type`. | Following the public example causes a runtime `TypeError` in plain JS and a compile error in TS. | Default to `{ type: 'RETURN_OBJECT' }` or make a discriminated overload where `output` is optional only for returned rows. |
| High | Table/workspace identifiers are accepted as ordinary strings but interpolated as raw SQL identifiers. | `setWorkspace()` uses `CREATE SCHEMA ... ${name}` and `USE ${name}` (`db.ts:219,228`); the same pattern appears in drop/get/update/load query builders. | Names with spaces, quotes, dots, or reserved words fail; malicious strings can alter SQL. | Centralize identifier quoting and validate every schema, table, column, alias, and generated index name. |
| Medium | Public metadata getters expose live mutable registry objects. | `getTablesMetadata()` directly returns `this.getCurrentWorkspaceData().tables` (`db.ts:144-145`). | Callers can add/remove/edit entries without changing DuckDB, corrupting all later validation and routing. | Return readonly snapshots or defensive copies; provide explicit metadata mutation/refresh APIs. |
| Medium | `removeLayer()` actually removes any table, while other APIs distinguish layers, rasters, and plain tables. | `db.ts:822-837`; README calls it a table drop (`autk-db/README.md:86`). | Method naming understates destructive scope and is inconsistent with `getTable`, `getLayer`, and `getRaster`. | Rename/add `dropTable()` and retain `removeLayer()` only as a compatibility alias with layer validation. |
| Medium | Error behavior alternates between throwing and result objects. | Most `AutkDb` methods throw; `DropTableUseCase.exec()` catches and returns `{ success: false }` (`drop-table/use-case.ts:28-44`), while `AutkDb.removeLayer()` returns `void`. | Errors can be silently ignored at one layer and thrown at another; callers cannot consistently recover. | Use exceptions for failed high-level operations or expose a consistent `Result` contract across operations. |
| Medium | Runtime support and docs disagree. | Package exports a Node build (`package.json:23-26`, `duckdb-node.ts`), while README repeatedly calls the package in-browser only (`README.md:7,18,29`). | Node users miss supported functionality and browser-only helpers such as Cache API may be mistaken for universal APIs. | Document a runtime capability matrix and runtime-specific restrictions/assets. |
| Low | `rawQuery<T>()` permits an unchecked caller-selected return type. | `db.ts:797-809` casts raw rows to arbitrary `T`. | TypeScript can claim a schema that was never validated. | Return `RawQueryOutput` by default and accept a row decoder/schema for typed output. |
| Low | Workspace discovery is instance-local, not database-derived. | `getWorkspaces()` returns only keys in the in-memory map (`db.ts:243-245`). | It does not mean “all DuckDB schemas,” despite the method name. | Rename to `getRegisteredWorkspaces()` or discover/hydrate schemas and metadata from DuckDB. |

## Recommended order

1. Secure/quote identifiers and fix `rawQuery` output typing/defaults.
2. Standardize error behavior.
3. Protect metadata ownership and clarify workspace discovery.
4. Rename destructive APIs and document Node support.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
