<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk-compute</h1>

  <br>
  <p><strong>WebGPU computation engine for analytical and render-based pipelines.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## @urban-toolkit/autk-compute

`@urban-toolkit/autk-compute` provides WebGPU pipelines for running analysis over GeoJSON feature collections. It includes a GPGPU pipeline for custom WGSL expressions over feature attributes and a render pipeline for visibility-style metrics from sampled viewpoints. Results are written back to `feature.properties.compute` on the returned collection.

### Basic usage

```ts
import { AutkComputeEngine } from '@urban-toolkit/autk-compute';

const compute = new AutkComputeEngine();

const result = await compute.gpgpuPipeline({
  collection: buildingsGeojson,
  variableMapping: {
    height: 'properties.height',
    footprint: 'properties.area',
  },
  wgslBody: 'return height * footprint;',
  resultField: 'volumeProxy',
});

console.log(result.features[0].properties?.compute?.volumeProxy);
```

If the GPU rejects the pass, `gpgpuPipeline` (and `ComputeGpgpu.run`) rejects with an `Error` whose message names the GPU error type (`validation`, `out-of-memory` or `internal`) and includes the GPU's own message, for example for a `wgslBody` that does not compile, a binding over the device's `maxStorageBufferBindingSize`, a buffer the GPU cannot allocate, or a pipeline the driver cannot build. It does not resolve with the zeros a failed pass leaves in its output.

### Global arrays and matrices

`uniforms` contains scalar constants in uniform buffers. Despite their historical names, `uniformArrays` and `uniformMatrices` are **global read-only storage buffers**, shared by every feature. Large globals are read in place rather than copied into function-local arrays or passed by value. This avoids the uniform-buffer size limit and large-array compiler stack issues; it is not a promise of faster computation.

Inside `wgslBody`, access an array as `weights[index]`, with `weights_length: u32`. Matrices are flattened row-major: `matrix[row * matrix_cols + col]`, with `matrix_rows` and `matrix_cols` of type `u32`. Empty globals report zero logical length/rows; avoid indexing outside the logical dimensions. Per-feature `attributeArrays`/`attributeMatrices` keep their existing behavior.

```ts
const result = await compute.gpgpuPipeline({
  collection: buildingsGeojson,
  variableMapping: { height: 'properties.height' },
  uniforms: { scale: 2 },
  uniformArrays: { weights: [0.5, 1.5, 2.5] },
  uniformMatrices: { matrix: { data: [[1, 2], [3, 4]], cols: 2 } },
  wgslBody: 'return height * scale + weights[weights_length - 1u] + matrix[matrix_rows * matrix_cols - 1u];',
  resultField: 'weightedHeight',
});
```

Each feature buffer, global array/matrix and output consumes a storage binding. The shared device requests the adapter's `maxStorageBuffersPerShaderStage`; dispatches exceeding the resulting device limit throw before GPU resources are created. Storage binding size and total buffer size limits still apply: a dispatch over them rejects with the GPU's message. Scalars do not consume storage bindings. Global arrays/matrices cannot be modified in WGSL; code that previously modified a local copy must use separate local working data.

For actual GPU regression tests, run `npm run test:webgpu --workspace=@urban-toolkit/autk-compute` from the repository root. This uses local source through Vite and headless Chrome (no CDN/downloaded fixtures); requires Node with built-in WebSocket support and a WebGPU-enabled Chrome. Set `CHROME_BIN` if Chrome is not at the default macOS/Linux path. The test fails if no GPU is available, checks numerical results and validation errors, and prints adapter information. Ordinary Vitest tests check shader generation, binding configuration and GPU error handling against a fake device, not GPU execution.

### API summary

* `new AutkComputeEngine()`: Creates the unified compute engine.
* `gpgpuPipeline(params)`: Runs a WGSL compute pass over feature properties and writes scalar or columnar results into `properties.compute`. Rejects with the GPU's message if the GPU rejects the pass.
* `renderPipeline(params)`: Renders layer views from sampled viewpoints and writes visibility metrics into `properties.compute.render`.
* `ComputeGpgpu`: Lower-level GPGPU pipeline class used by the engine; its `run(params)` resolves and rejects as `gpgpuPipeline` does.
* `ComputeRender`: Lower-level render-analysis pipeline class used by the engine.
* `generateViewOrigins(...)`: Builds camera origins from viewpoint collections.
* `expandCameraSamples(...)`: Expands origins into directional camera samples.
* `buildCameraMatrices(...)`: Builds camera matrices for render sampling.
* `TriangulatorBuildingWithWindows`: Helper for building-window viewpoint generation.

### Pipeline capabilities

* GPGPU inputs can use `variableMapping`, `attributeArrays`, `attributeMatrices`, `uniforms`, `uniformArrays`, and `uniformMatrices`.
* Render aggregation supports `classes` for semantic layer shares and `objects` for per-object visibility.
* Render layers use `id`, `collection`, `type`, and optional `objectIdProperty` values.
* Viewpoints can be derived using strategies such as centroids or building windows, with configurable direction sampling.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
