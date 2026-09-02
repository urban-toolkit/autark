# `@urban-toolkit/autk-db` code-improvement audit

## Summary

DB needs shared SQL construction, transactional operation boundaries, durable metadata/payload ownership, and a smaller lifecycle-aware `AutkDb` controller.

## Opportunities

### High priority

1. **Create one SQL identifier/literal module.**
   Quote schemas, tables, columns, aliases, index names, property paths, and file paths using separate functions. Replace local helpers and direct template interpolation throughout `db.ts`, query builders, heatmaps, joins, and OSM processing.

2. **Wrap multi-step mutations in transactions.**
   OSM materialization/cleanup, spatial joins, clipping, heatmap rewrites, update staging, and registry changes should commit or roll back as one operation. Update in-memory metadata only after commit.

3. **Move workspace/table metadata into DuckDB.**
   Store source, type, bands, CRS, bounds, crop layer, and payload references in catalog tables. Hydrate `workspaces` from those tables rather than treating a per-instance map as authoritative.

4. **Give raster storage explicit ownership.**
   The module-global `rasterStore` should become an injected store or instance-owned service. Add persistence, byte accounting, overwrite cleanup, and disposal.

### Medium priority

5. **Add a lifecycle state machine.**
   Replace repeated checks of many optional use-case fields with `uninitialized → ready → disposed`, one `assertReady()`, and an idempotent initialization promise. Add `dispose()`.

6. **Split the large `AutkDb` facade.**
   `db.ts` is over 1,000 lines and coordinates initialization, OSM workflows, constraints, registry, query APIs, and raster cleanup. Move workspace/catalog and operation-transaction coordination into dedicated services while preserving the public facade.

7. **Use discriminated source-input types.**
   CSV, JSON, GeoJSON, and GeoTIFF loaders use pairs of optional URL/object/buffer fields then reject both/neither at runtime. Model these as unions so invalid combinations do not type-check.

8. **Use structured operation errors.**
   Add stable codes and context (`workspace`, `table`, operation, SQL phase) rather than mixing console messages, generic `Error`, and success-result strings.

9. **Replace unchecked generic query casting with decoders.**
   Let callers provide a row schema/decoder, or return Arrow/unknown records with conversion metadata.

10. **Add pagination/streaming to table reads.**
    `getTable()` executes `SELECT *` and materializes every row (`get-table/use-case.ts:40-42`). Add limit/offset/order/filter or Arrow batch iteration to control memory.

11. **Avoid process-wide console output.**
    Route OSM timings, overwrite notices, and cleanup warnings through an injected logger/progress sink.

12. **Clarify browser/Node adapters.**
    Keep runtime-specific worker/cache logic behind explicit adapter interfaces, and document which loaders depend on `fetch`, Cache API, or worker assets.

## Suggested sequence

1. Secure SQL composition and transaction boundaries.
2. Persist catalog/raster state and add disposal.
3. Simplify lifecycle/facade structure.
4. Improve input types, errors, logging, and streaming.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
