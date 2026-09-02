# `@urban-toolkit/autk-db` new-feature opportunities

## Summary

The most valuable DB features build on durable workspaces, safe query execution, and scalable result access rather than adding more one-off loaders.

## Evidence basis

Workspace discovery is currently only an in-memory map (`db.ts:243-245`), raster payloads live in a module-global store (`raster-store.ts:21-36`), and table reads materialize `SELECT *` (`get-table/use-case.ts:40-42`). Public identifiers are interpolated directly into schema/table SQL (`db.ts:219,228`), and the generic raw-query path is an unchecked cast (`db.ts:797-809`). These constraints motivate durable catalogs, bound queries, transactions, chunked rasters, streaming, and capability discovery.

## Opportunities

### 1. Persistent workspace catalog and reopen — High

Allow applications to create, save, export, reopen, and enumerate workspaces with durable:

- table source/type/schema metadata;
- CRS and immutable workspace bounds;
- crop-layer references;
- raster payload references;
- operation/version metadata.

### 2. Parameterized query API — High

Add `query(sql, parameters, options)` with prepared-statement binding, a strict single-statement/read-only option, row decoding, and optional table materialization. This is safer and more useful than regex-based raw SQL validation.

### 3. Transaction API — High

Expose `transaction(async tx => ...)` and use it internally. The transaction object should support table/load/query operations while deferring registry changes until commit.

### 4. Durable/chunked raster storage — High

Store bands as chunked blobs, files, or tile pyramids with lazy reads. Support windowed band access, resampling, nodata masks, byte budgets, and explicit unload/reload.

### 5. Streaming Arrow results — Medium

Expose Arrow record batches or async iterators for large table/query results, plus cancellation and progress. Keep the existing plain-object conversion as a convenience path.

### 6. Schema and metadata discovery — Medium

Provide `refreshCatalog()`, `describeWorkspace()`, and adoption of externally created DuckDB tables. Infer likely geometry/raster types but require confirmation when ambiguous.

### 7. Safe migration/versioning — Medium

Track workspace catalog versions and provide migrations when table metadata or raster formats evolve. Surface migration plans before destructive changes.

### 8. Spatial indexes and query-plan guidance — Medium

Expose index creation/status, table statistics, and `EXPLAIN` output. Recommend or automatically maintain RTREE indexes after replace/update/clipping operations.

### 9. Incremental ingestion — Medium

Support append/upsert streams for CSV/JSON/GeoJSON with stable keys, schema evolution policy, and transaction-sized batches. Preserve geometry validation and provenance.

### 10. Runtime capability adapter — Low

Expose whether the active runtime supports local files, HTTP cache, workers, persistence, and particular DuckDB extensions. This lets the umbrella package present accurate environment capabilities.

## Design constraints

- Catalog and raster payload updates must be atomic.
- Public names must always be safely quoted/bound.
- Streaming APIs must not force full materialization.
- Browser and Node behavior should share contracts while using separate adapters.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
