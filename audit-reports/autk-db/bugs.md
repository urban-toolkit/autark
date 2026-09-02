# `@urban-toolkit/autk-db` bug audit

## Summary

The most serious issues are unsafe SQL composition, silent table-unregistration after failed drops, non-transactional updates, and raster payload state that can diverge from DuckDB metadata.

## Findings

### 1. Unquoted identifier interpolation is pervasive — Critical

**Evidence:** workspace names are inserted into `CREATE SCHEMA`/`USE` (`db.ts:219,228`); drop/get-table queries concatenate `${workspace}.${tableName}` (`drop-table/queries.ts:8-10`, `get-table/use-case.ts:40-41`); update queries also interpolate table, staging, and ID expressions (`update-table/queries.ts`).

**Impact:** valid SQL identifiers with spaces/reserved words fail, and user-controlled names or `idColumn` values can inject additional SQL. `parseIdColumn()` also embeds a property key inside quotes without escaping (`update-table/interfaces.ts:79-91`).

**Fix:** use one tested `quoteIdentifier()` for identifiers, escape SQL string literals separately, reject multipart input where not supported, and never accept raw ID expressions from public strings.

### 2. `removeLayer()` unregisters tables even when the drop failed — High

**Evidence:** `DropTableUseCase.exec()` catches errors and returns `success: false` (`drop-table/use-case.ts:28-44`). `AutkDb.removeLayer()` ignores that result, deletes raster payloads, and removes metadata (`db.ts:826-836`).

**Impact:** the physical DuckDB table can remain while the API forgets it and discards its in-memory raster data. Re-loading the same name then produces confusing overwrite/stale-state behavior.

**Fix:** inspect the result and throw/return failure before changing registry or raster state. Prefer allowing the drop error to propagate.

### 3. Non-layer update is a destructive two-statement operation without a transaction — High

**Evidence:** update strategy deletes matching IDs, then inserts staging rows (`update-table/use-case.ts:214-221`); there is no `BEGIN`/`COMMIT`/rollback.

**Impact:** an insert/schema failure after deletion permanently loses matching rows. Concurrent readers can observe the intermediate state.

**Fix:** execute staging creation, delete/update/insert, metadata refresh, and cleanup under an explicit transaction with rollback.

### 4. Compact raster payloads exist only in a module-global memory map — High

**Evidence:** `raster-store.ts:22-37` stores `Float32Array` bands in a process-global `Map`; DuckDB stores only metadata; `getRaster()` throws when the map entry is absent (`get-raster/use-case.ts:36-39`).

**Impact:** raster tables cannot survive reload, worker/process restart, another package copy, or reconstruction of `AutkDb`. Table metadata can exist while raster reads fail.

**Fix:** persist payloads in DuckDB/blob/file storage or define an explicit external raster store with lifecycle and hydration. Keep metadata and payload writes atomic.

### 5. `updateTable()` accepts raster metadata but cannot update its payload coherently — High

**Evidence:** `UpdateTableUseCase` treats only `isVectorTable()` as a layer (`update-table/use-case.ts:64`), so rasters follow plain JSON replacement/update. The raster-store entry is not updated or cleared. `AutkDb.updateTable()` accepts any registered `Table` (`db.ts:742-760`).

**Impact:** compact raster table dimensions/bounds can be replaced while old bands remain, causing mismatched texture sizes and values.

**Fix:** reject raster tables in generic `updateTable()` or add a dedicated raster update that atomically replaces metadata, bands, bounds, and registry state.

### 6. Raw-query “read-only” validation is lexical and bypassable — High

**Evidence:** it only requires a `select`/`with` prefix and scans eight forbidden words (`raw-query/use-case.ts:49-59`). It rejects harmless literals/comments containing those words, but does not block multi-statements using `COPY`, `ATTACH`, `DETACH`, `CALL`, `INSTALL`, `LOAD`, `SET`, `USE`, `EXPORT`, or other side-effecting commands.

**Impact:** the API provides neither reliable read-only safety nor predictable acceptance of valid SELECTs.

**Fix:** reject multiple statements, use DuckDB statement parsing/preparation where available, execute in a read-only connection/sandbox, or rename the API and clearly state that SQL is trusted.

### 7. Workspace metadata is not hydrated from the database — Medium

**Evidence:** `init()` creates a fresh map containing only the default workspace (`db.ts:164-175`); `setWorkspace()` creates empty metadata whenever the local map lacks a name (`db.ts:218-227`).

**Impact:** reconnecting to a database or switching to an existing schema loses table type/source/bounds metadata, so API lookups report tables missing even when DuckDB contains them.

**Fix:** persist metadata in catalog tables and hydrate it during initialization/workspace selection, with schema discovery as fallback.

### 8. There is no public DB/connection/worker teardown — Medium

**Evidence:** `AutkDb` has no `close`, `destroy`, or `dispose`; Node creates a worker (`duckdb-node.ts:26`) and browser creates one (`duckdb-browser.ts:67`) that is owned by DuckDB.

**Impact:** applications cannot deterministically close connections, terminate workers, or release module-global raster payloads.

**Fix:** add idempotent `dispose()` that closes the connection/database worker and clears instance-owned resources.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
