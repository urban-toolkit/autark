# `@urban-toolkit/autk-core` code-improvement audit

## Summary

Core would benefit most from explicit geometry metadata, immutable options, centralized validation, and structured diagnostics. These changes would simplify dependent packages and eliminate repeated inference logic.

## Opportunities

### High priority

1. **Add vertex layout metadata to `LayerGeometry`.**
   `types-mesh.ts` stores a flat position array but not whether it is 2D or 3D. Consumers currently infer the dimension from layer type or array divisibility. Add `positionSize: 2 | 3` (and optionally primitive/layout metadata) and validate index bounds.

2. **Replace mutable triangulator statics with options.**
   `TriangulatorPolylines.offset` (`triangulator-polylines.ts:19`) and point size state (`triangulator-points.ts:33`) are global. Define immutable options passed to build calls and return applied configuration with results where useful.

3. **Centralize tolerant-input diagnostics.**
   Triangulators have repeated private warning helpers and direct `console.warn` calls. Introduce a `Diagnostic` shape (`code`, severity, feature index, geometry type, message) and an optional sink. This preserves tolerant processing without hard-wiring console output.

4. **Centralize finite coordinate validation.**
   Bounding-box, centroid, triangulation, heightfield, and transfer-function paths each validate different subsets. Shared scalar/position guards would make behavior predictable.

### Medium priority

5. **Use type-only imports consistently.**
   Several files import GeoJSON and local interfaces as runtime imports even when used only as types (for example `triangulator-buildings.ts` and `triangulator-polylines.ts`). Converting these to `import type` clarifies intent and reduces emitted import risk.

6. **Use typed buffers for color textures.**
   Replace `ColorTEX = number[]` with a representation that records byte versus normalized channels. Avoid an extra `number[]` → `Uint8Array` allocation in map pipelines.

7. **Split geometry family from semantic layer type.**
   `LayerType` mixes renderer geometry (`points`, `polygons`) with semantics (`parks`, `water`, `background`, `raster`). Define separate `GeometryFamily` and `SemanticLayerType`, then provide an explicit mapping.

8. **Make domain and transfer configuration resolution public and validated.**
   Callers currently repeat checks around categorical/numeric domains. Return a validated resolved object that shaders and legends can share.

9. **Avoid catch-all `any` around Turf.**
   `computeIntersectingClusterIds()` casts geometries to `any` for `bbox` and `booleanIntersects`. Narrow supported geometries and isolate unavoidable library mismatch in one adapter.

10. **Clarify mutability of returned arrays/objects.**
    Colormap domains, mesh buffers, and camera arrays are returned by reference. Document ownership or return readonly views/copies where mutation would violate invariants.

## Suggested sequence

1. Add geometry layout metadata and shared scalar/position guards.
2. Migrate triangulators to option objects.
3. Introduce diagnostics and separate semantic/geometry taxonomy.
4. Tighten imports, color buffers, and ownership documentation.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
