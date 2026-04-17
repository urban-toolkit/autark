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
   Computes visible share per semantic class.
2. `objects`
   Computes visibility per individual rendered object.

Background can be counted as an extra class bucket when using `classes`:

```ts
const result = await compute.renderPipeline({
  layers: [
    { geojson: buildings, type: 'buildings', classId: 'buildings' },
    { geojson: parks, type: 'surface', classId: 'parks' },
    { geojson: water, type: 'surface', classId: 'water' },
  ],
  source: roads,
  aggregation: { type: 'classes', includeBackground: true, backgroundClassId: 'sky' },
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

Use `objects` only when you really need per-feature visibility. It is materially heavier than `classes`.

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

The high-level API also supports global constants for a dispatch through `uniforms`, `uniformArrays`, and `uniformMatrices`.

## Limits

1. `renderPipeline` class aggregation is limited by `maxStorageBufferBindingSize` for `sourceCount * classCount`.
2. `objects` aggregation is limited to at most `65535` rendered objects.
3. Large render workloads should still prefer modest `tileSize` and direction counts.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
