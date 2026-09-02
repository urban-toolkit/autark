# `@urban-toolkit/autk-compute` code-improvement audit

## Summary

The strongest improvements are a single request-validation layer, explicit GPU/resource ownership, and replacing inferred/loosely typed buffer layouts with declared metadata.

## Opportunities

### High priority

1. **Add request validators before all fast paths and allocations.**
   Validate output shape, identifiers, descriptor dimensions, layer support, tile size, camera options, sampling counts, object IDs, and estimated bytes. Return field-specific errors instead of browser/GPU validation messages.

2. **Make mesh layout explicit.**
   Replace position-length inference in `compute-render.ts:492-521` with core-provided `positionSize`. Validate indices and geometry/component alignment once before upload.

3. **Inject a GPU device/provider.**
   `device-manager.ts` owns a process-global promise and browser globals. Add `AutkComputeEngineOptions` with `device`, `requestAdapter`, required limits/features, logging, and device-loss hooks. This also allows map and compute to coordinate device use.

4. **Separate packing, WGSL generation, dispatch, and result mapping.**
   `compute-gpgpu.ts` combines schema inference, data coercion, code generation, GPU execution, and GeoJSON mutation. Isolating these stages would make errors inspectable and allow cached schemas/shaders.

### Medium priority

5. **Replace silent zero coercion with value plus validity.**
   Missing/non-numeric scalars, short arrays, and ragged matrices become zero (`compute-gpgpu.ts:499-519`). Add configurable `error`, `zero`, `nan`, or validity-mask policies.

6. **Remove internal `any` from result aggregation.**
   Define a `ComputeProperties` contract and a safe record guard instead of `(feature.properties?.compute as any)?.render` (`compute-render.ts:1029`).

7. **Standardize error prefixes and terminology.**
   Messages alternate between `ComputeRender` and `RenderPipeline` (`compute-render.ts:287,310`). Use stable error codes and include layer/field context.

8. **Preflight device binding and buffer counts.**
   GPGPU variables each consume bindings/buffers. Validate generated binding count, uniform size, storage size, dispatch count, and output bytes before pipeline creation.

9. **Cache generated GPGPU pipelines by schema/body.**
   Repeated runs currently regenerate shader modules and pipelines. Cache by device plus normalized schema/WGSL/output arity, with device-loss invalidation.

10. **Use type-only imports consistently.**
    `api.ts`, `compute.ts`, and some implementation files import GeoJSON/core types as values. `import type` makes runtime dependencies and bundle behavior clearer.

11. **Add cancellation/progress hooks to long CPU phases.**
    Triangulation, packing, camera expansion, and batch readbacks can be long even before GPU submission. Thread an `AbortSignal` and progress callback through these phases.

## Suggested sequence

1. Central validation and explicit mesh layout.
2. Device/result ownership APIs.
3. Split GPGPU stages and add preflight resource planning.
4. Improve coercion, diagnostics, caching, and cancellation.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
