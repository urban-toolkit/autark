# @urban-toolkit/autk-compute

<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU 2D/3D map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## Compute engine

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

### API summary

* `new AutkComputeEngine()`: Creates the unified compute engine.
* `gpgpuPipeline(params)`: Runs a WGSL compute pass over feature properties and writes scalar or columnar results into `properties.compute`.
* `renderPipeline(params)`: Renders layer views from sampled viewpoints and writes visibility metrics into `properties.compute.render`.
* `ComputeGpgpu`: Lower-level GPGPU pipeline class used by the engine.
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
