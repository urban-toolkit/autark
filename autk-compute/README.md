# autk-compute

<div align="center">
  <img src="https://raw.githubusercontent.com/urban-toolkit/utk-serverless/main/logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

`autk-compute` is the WebGPU computation package in the Autark ecosystem. It provides two GPU pipelines over GeoJSON data:

1. `gpgpuPipeline`
   Executes WGSL compute code over feature properties and writes results into `feature.properties.compute`.
2. `renderPipeline`
   Samples rendered views from source features and writes class or object visibility metrics into `feature.properties.compute.render`.

## Render pipeline

The render pipeline now supports only two aggregation modes:

1. `classes`
   Computes visible share per semantic layer type.
2. `objects`
   Computes visibility per individual rendered object.

Background can be counted as an extra class bucket when using `classes`:

```ts
const result = await compute.renderPipeline({
  layers: [
    { layerId: 'buildings', geojson: buildings, type: 'buildings', layerType: 'buildings' },
    { layerId: 'parks', geojson: parks, type: 'surface', layerType: 'parks' },
    { layerId: 'water', geojson: water, type: 'surface', layerType: 'water' },
  ],
  source: roads,
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
  viewSampling: { directions: 1 },
  tileSize: 64,
});

result.features.forEach((feature) => {
  const classes = feature.properties?.compute?.render?.classes ?? {};
  const sky = Number(classes.sky ?? 0);
  const water = Number(classes.water ?? 0);
  const parks = Number(classes.parks ?? 0);
  console.log({ sky, water, parks });
});
```

Render-layer inputs:

- `layerId`: unique per rendered layer in the request; used to scope object keys
- `layerType`: semantic aggregation bucket for class-share results
- `objectIdProperty`: optional stable feature property used for object aggregation keys; when omitted, the feature index is used

View sampling inputs:

- `directions`: number of azimuth samples per source feature
- `azimuthOffsetDeg`: rotates the first sampled view direction
- `pitchDeg`: applies a shared vertical pitch to every sampled direction

Use `objects` only when you really need per-feature visibility. It is materially heavier than `classes`.

Object aggregation returns keys scoped by `layerId`, not `layerType`, so two layers can share the same semantic `layerType` without colliding in `render.objects`.

## GPGPU pipeline

The GPGPU pipeline maps feature properties to columnar GPU buffers, runs a WGSL kernel, and writes outputs back into `properties.compute`.

```ts
const result = await compute.gpgpuPipeline({
  collection: buildings,
  variableMapping: { height: 'height', footprint: 'area' },
  wgslBody: 'return height * footprint;',
  resultField: 'volumeProxy',
});
```

Besides `variableMapping`, the high-level API also supports:

- `attributeArrays`: fixed-length per-feature arrays
- `attributeMatrices`: per-feature matrices with fixed dimensions or `rows: 'auto'`
- `uniforms`: global scalar constants for one dispatch
- `uniformArrays`: global fixed-length arrays for one dispatch
- `uniformMatrices`: global matrices for one dispatch

With `attributeMatrices`, using `rows: 'auto'` tells the pipeline to infer the row count per feature at runtime while still packing each matrix into a fixed GPU stride based on the maximum observed row count.

## Limits

1. `renderPipeline` class aggregation is limited by `maxStorageBufferBindingSize` for `sourceCount * layerTypeCount`.
2. `classes` aggregation supports at most `255` encoded `layerType` buckets, including the optional background bucket.
3. `objects` aggregation supports at most `65535` rendered objects.
4. `objects` aggregation also has a CPU-side accumulation limit for the final `sourceCount * objectCount` visibility buffer.
5. Large render workloads should still prefer modest `tileSize` and direction counts.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
