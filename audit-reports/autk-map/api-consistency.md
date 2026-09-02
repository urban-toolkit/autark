# `@urban-toolkit/autk-map` API consistency audit

## Summary

Map exposes a convenient controller but mixes strict exceptions, silent ignores, and console diagnostics. Several public types also permit values that the implementation cannot load or update correctly.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| High | The accepted `LayerType` includes `background`, but collection loading does not support it. | `LoadCollectionParams.type` uses core `LayerType` (`api.ts:76`); `map.ts:260-301` has no `background` case and logs “unknown.” | A compile-time valid request is rejected at runtime. | Narrow loadable types or implement/document a background layer. Keep renderer background styling separate if it is not a data layer. |
| High | Public operations have no consistent failure contract. | `loadCollection()` and thematic/raster updates return `void` and log; `loadMesh()` and terrain methods throw; unknown update IDs are silently ignored (`map.ts:643-646`); renderer initialization logs and resolves (`renderer.ts:260-272`). | Callers cannot reliably detect whether a layer was created or an update applied. | Return typed results or throw typed errors under a documented strict policy; optionally support a tolerant diagnostics mode. |
| Medium | `updateRenderInfo()` supports two shapes but the exported API type describes one. | Method accepts `UpdateRenderInfoParams | Partial<LayerRenderInfo>` (`map.ts:643`); `api.ts:194-199` only defines `{ renderInfo }`. README uses the wrapped form while gallery code uses direct patches. | Consumers see two conventions and generated docs do not fully describe the direct form. | Select one canonical form, provide overload declarations during migration, and align examples. |
| Medium | `setSkippedIds()` semantics differ by layer implementation. | Vector layers toggle IDs (`layer-vector.ts:407-425`); sprite layers clear then replace (`layer-sprite.ts:197-207`); controller wording says toggle (`map.ts:721-736`). | The same public call behaves differently for points and polygons/buildings. | Make `setSkippedIds` replace everywhere and add a separate `toggleSkippedIds`, or consistently toggle everywhere. |
| Medium | Raster update type does not state the fixed-size contract. | `UpdateRasterParams` accepts any raster collection/property (`api.ts:137-156`); implementation does not update texture resolution/geometry (`map.ts:522-575`). | Callers can reasonably pass a new raster size, but existing GPU texture dimensions remain unchanged. | Require same dimensions and exact scalar/RGBA length in the type/docs, or add a resize/rebuild update path. |
| Medium | Low-level classes are exposed without a supported extension seam. | Root exports `Renderer`, `LayerManager`, and abstract `Layer`; manager hardcodes concrete internal layer classes (`layer-manager.ts:86-93`) that are not root exports. | Consumers can access internals but cannot register a custom layer implementation through the manager. | Either treat these as advanced/internal exports or add a `LayerFactory`/`addCustomLayer` contract. |
| Low | Styling state differs from plot’s style model. | `MapStyle` is instance-owned; plot’s `PlotStyle` is static process-wide. | Cross-view theming cannot be configured with one ownership model. | Move shared style primitives/configuration to core and prefer instance-owned style state in both packages. |

## Recommended order

1. Define load/update result and error contracts.
2. Narrow layer/raster types to actual capabilities.
3. Standardize render-info and skip-selection calls.
4. Decide whether low-level exports are extension APIs or internals.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
