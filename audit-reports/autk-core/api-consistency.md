# `@urban-toolkit/autk-core` API consistency audit

## Summary

Core provides a broad, useful shared surface, but several runtime guards, geometry contracts, and stateful utilities do not match their declared types or documentation.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| High | `LayerType` and its runtime guard disagree. | `types-layer.ts:18,31` includes `background`; `utils-layer.ts:25-35` omits it. | Valid typed input fails runtime validation, affecting every package that trusts the guard. | Implement `isLayerType` from `LAYER_TYPE_VALUES` so the union, values, and guard have one source of truth. |
| High | `GeometryCollection` is declared as `polygons` even when it contains points, lines, or mixed families. | `utils-layer.ts:55-60`; specialized triangulators separately inspect collection children. | Inference can route valid data to the wrong renderer and silently skip children. | Return an explicit `mixed`/set-of-families result, or require callers to inspect children rather than pretending every collection is polygonal. |
| Medium | Triangulator configuration is partly global and partly per call. | `triangulator-points.ts:33-51` has global point size; `triangulator-polylines.ts:19` has mutable global offset, while `buildMesh()` also accepts a resolver. | Multiple maps and core consumers can affect one another; configuration style differs by primitive. | Pass point size/width through immutable options on every build and deprecate process-wide setters. |
| Medium | Coordinate and height return types are weaker than their actual shape. | Many public triangulators accept `origin: number[]`; `computeBuildingHeights()` returns `number[]` although it is empty or a two-value tuple. | Callers can pass malformed origins, and tuple invariants are not represented by TypeScript. | Introduce `Vec2`, `Vec3`, `Origin2D`, and `[minHeight, maxHeight] | null` public types. |
| Medium | Failure behavior varies between exceptions, empty arrays, `null`, and `console.warn`. | Raster triangulation returns empty arrays with a warning (`triangulator-raster.ts:39-44`); heightfields throw; centroid/bbox helpers return `null`; polygon/line triangulators warn and skip. | Consumers need package-internal knowledge to distinguish empty input, unsupported geometry, and malformed data. | Define consistent strict and tolerant modes, with structured diagnostics for tolerant processing. |
| Low | `ColorTEX` is only `number[]` despite being described as texture-ready. | `types-colormap.ts:187-189`; `ColorMap.getColorMap()` emits byte RGB but normalized alpha. | Buffer format, channel range, and ownership are unclear to GPU consumers. | Expose a typed texture format (`Uint8Array`, channel encoding metadata) or rename the current representation to indicate mixed channel conventions. |
| Low | `EventEmitter.emit()` documentation is self-contradictory. | `event-emitter.ts:83` says “Never throws” and “Listener errors propagate.” | Consumers cannot rely on the stated error contract. | Document synchronous propagation, or catch and report listener errors under an explicit policy. |

## Recommended order

1. Unify layer taxonomy and geometry-family inference.
2. Remove mutable global triangulator options.
3. Strengthen coordinate/tuple contracts.
4. Standardize diagnostics and error behavior.
5. Clarify texture and event contracts.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
