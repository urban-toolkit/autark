# `@urban-toolkit/autk-compute` new-feature opportunities

## Summary

Compute can grow beyond one-shot GeoJSON mutation by exposing reusable execution plans, richer render metrics, and predictable resource/cancellation controls.

## Evidence basis

GPGPU execution regenerates, allocates, dispatches, reads back, and writes into `feature.properties.compute` per request (`compute-gpgpu.ts:591-604`). Render compute accepts the full `LayerType` but only handles building, polygon, and line families (`api.ts:28`, `compute-render.ts:438-459`), while device acquisition is browser-global (`device-manager.ts:26-44`). These limits support reusable plans, alternate sinks, explicit resources, missing-data masks, additional layer families, and device coordination.

## Opportunities

### 1. Compiled GPGPU plans — High

Add a two-stage API:

1. compile/validate a schema and WGSL body;
2. execute it against multiple collections or updated buffers.

Expose generated WGSL, packed-layout metadata, required device limits, and output schema for debugging and reuse.

### 2. Explicit missing-data support — High

Allow each feature scalar/array/matrix input to carry a validity mask. WGSL functions could receive `<name>_valid` or configurable default policies, avoiding the current conflation of missing values with numeric zero.

### 3. Progress, cancellation, and resource budgets — High

Support `AbortSignal`, batch progress, maximum GPU bytes, maximum CPU accumulation bytes, and optional time slicing during packing/triangulation. Return cancellation without partially modifying input data.

### 4. Additional render-compute layer families — Medium

Implement points/sprites and raster/terrain visibility, or expose a custom mesh input with explicit vertex dimension. The current `LayerType` suggests these families but skips them.

### 5. Richer visibility outputs — Medium

Add optional metrics such as:

- visible pixel ratio by sample rather than only aggregate;
- first/nearest visible object;
- depth/distance summaries;
- directional exposure histograms;
- occlusion contribution and background/sky exposure;
- confidence/coverage information for features with no samples.

### 6. Custom viewpoint providers — Medium

Accept explicit `CameraSample[]` and callback/iterator strategies in addition to centroid and building-window presets. Include constrained azimuth/pitch ranges, per-feature camera parameters, and deterministic sample IDs.

### 7. Streaming/chunked GPGPU execution — Medium

Split collections when feature buffers exceed device limits and merge outputs while preserving source indices. This should be driven by a resource plan rather than failing at allocation time.

### 8. Configurable result sinks — Medium

Allow results to be returned as columnar typed arrays, Arrow tables, callbacks, or a configurable GeoJSON property namespace. Avoid forcing a deep-copy/writeback for all workloads.

### 9. Shared device coordination with map — Low

Expose a supported way for map and compute to share or intentionally isolate a device, including loss recovery and scheduling policy. This can reduce duplicate device acquisition and clarify contention.

## Design constraints

- Validate all plans before GPU allocation.
- Keep result provenance stable across chunking and sampling.
- Make CPU/GPU memory costs inspectable.
- Never infer vertex layout from buffer-length divisibility.

> Scope note: Unit-test and E2E-test recommendations are intentionally excluded.
