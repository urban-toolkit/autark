# `@urban-toolkit/autk-compute` API consistency audit

## Summary

The engine and lower-level classes mostly share parameter types, but the package root omits public types, accepts unsupported layer types, and exposes browser/device assumptions that are not represented in the API.

## Findings

| Priority | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|
| High | Root type exports are incomplete. | `api.ts:35,91` exports `RenderViewSampling` and `RenderAggregation`; `compute.ts:19-27` re-exports them, but `index.ts:26-33` does not. | Consumers of the package root cannot directly name all fields used by exported parameter types. | Export every public API type from `index.ts` and generate this list from `api.ts`. |
| High | `RenderLayer.type` accepts more types than the renderer supports. | `api.ts:28` uses the full core `LayerType`; `compute-render.ts:438-459` only handles buildings, polygon families, and line families, then warns and skips all others. | Valid typed `points`, `raster`, or `background` layers silently produce no rendered geometry and can still appear as zero-valued class buckets. | Narrow the type to a `RenderComputeLayerType`, or implement the missing layer families. Throw for unsupported input rather than skip it. |
| Medium | Exported viewpoint functions use unexported named contracts. | `viewpoint.ts` publicly declares `ViewOrigin`, `CameraSample`, and `ResolvedRenderViewpoints`; `index.ts:19-24` exports functions but none of those types, and omits `resolveRenderViewpoints`. | Consumers can call helpers but cannot import the canonical input/output types from the package root. | Export the contracts and either export `resolveRenderViewpoints` or make it clearly internal. |
| Medium | README advertises a symbol not exported by this package. | `autk-compute/README.md:61` lists `TriangulatorBuildingWithWindows`; `index.ts` does not export it. | The documented import fails unless consumers know to import from `autk-core`. | Correct the README or intentionally re-export the helper. Prefer documenting the core import to avoid duplicate ownership. |
| Medium | Device acquisition is implicit and browser-global. | `device-manager.ts:26-44` reads `navigator`, `window`, and requests maximum adapter limits. | There is no API for a caller-owned device, adapter policy, power preference, feature negotiation, or non-window runtime. | Accept a device/provider in constructors or an engine options object; keep browser auto-acquisition as a default adapter. |
| Medium | Result destination is fixed to `feature.properties.compute`. | `compute-gpgpu.ts:591-604`; `compute-render.ts:1019-1035`. | Existing application data named `compute` can be overwritten or spread as an unexpected shape. | Add configurable result namespace/collision policy and validate existing values before merging. |
| Low | Empty-collection behavior differs from non-empty validation behavior. | `compute-gpgpu.ts:75-78` returns before shader identifier and descriptor validation. | The same invalid config succeeds for empty data and fails when the first feature arrives. | Validate the full request before the empty-data fast path. |

## Recommended order

1. Narrow render-layer types and fail on unsupported types.
2. Complete root exports and documentation.
3. Add engine/device options and result namespace policy.
4. Make validation independent of feature count.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
