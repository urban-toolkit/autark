<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>@urban-toolkit/autk-core</h1>

  <br>
  <p><strong>Shared low-level runtime, geometry, camera, event, and color utilities for the Autark toolkit.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the umbrella package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-core`: Shared low-level core package.
* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## @urban-toolkit/autk-core

`@urban-toolkit/autk-core` contains the shared low-level building blocks used by the other Autark packages. It is useful when you want direct access to color mapping helpers, camera primitives, triangulators, event utilities, or shared type definitions without going through the higher-level map, compute, db, or plot packages.

Use the higher-level packages when possible:

- use `@urban-toolkit/autk-map` for map rendering and interaction
- use `@urban-toolkit/autk-db` for data loading and spatial queries
- use `@urban-toolkit/autk-compute` for GPU compute and render-analysis workflows
- use `@urban-toolkit/autk-plot` for charts and linked plot interactions

Use `@urban-toolkit/autk-core` directly when you specifically need shared low-level primitives.

### Installation

```bash
npm install @urban-toolkit/autk-core
```

### Basic usage

```ts
import {
  Camera,
  ColorMap,
  ColorMapDomainStrategy,
  ColorMapInterpolator,
  TriangulatorPolygons,
  computeOrigin,
} from '@urban-toolkit/autk-core';

const origin = computeOrigin(buildingsGeojson);
const [geometry, components] = TriangulatorPolygons.buildMesh(buildingsGeojson, origin);

const camera = new Camera();
const colormap = ColorMap.getColorMap(
  ColorMapInterpolator.SEQ_VIRIDIS,
  16,
  [0, 100],
);

console.log(origin, geometry.length, components.length, camera.eye, colormap.length);
```

## API summary

`@urban-toolkit/autk-core` groups its exports around a few responsibilities:

- **Color mapping**: `ColorMap`, `ColorMapDomainStrategy`, `ColorMapInterpolator`, `ColorMapConfig`, `ResolvedDomain`
- **Transfer functions**: `DEFAULT_TRANSFER_FUNCTION`, `buildTransferContext`, `computeAlphaByte`
- **Camera utilities**: `Camera`, `CameraMotion`, `CameraData`, `ViewProjectionParams`
- **Events**: `EventEmitter`, `EventListener`, `SelectionData`
- **Mesh types**: `LayerGeometry`, `LayerComponent`, `LayerBorder`, `LayerBorderComponent`
- **Layer and buffer types**: `LayerType`, `BoundingBox`, `TypedArray`, `TypedArrayConstructor`
- **Utilities**: `valueAtPath`, `isNumericLike`, `computeOrigin`, `computeGeometryCentroid`, `computeBoundingBox`, `mapGeometryTypeToLayerType`, `offsetPolyline`
- **Triangulators**: `TriangulatorPoints`, `TriangulatorPolylines`, `TriangulatorPolygons`, `TriangulatorBuildings`, `TriangulatorBuildingWithWindows`, `TriangulatorRaster`

The complete export list lives in [`src/index.ts`](./src/index.ts).

## Notes

- Geometry helpers assume planar coordinates unless a function states otherwise.
- Triangulators convert GeoJSON and related feature data into render-ready mesh buffers.
- `@urban-toolkit/autk-core` is a stable shared dependency of the other Autark packages, but it exposes lower-level APIs than the higher-level modules.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
