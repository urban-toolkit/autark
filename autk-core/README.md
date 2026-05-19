<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="150"/></br>

  <h1>autk-core</h1>

  <br>
  <p><strong>Shared runtime foundation for the Autark toolkit.</strong></p>

  <p>
    <a href="https://arxiv.org/abs/2604.20759">Paper</a> ·
    <a href="https://autarkjs.org/">Website</a>
  </p>  
</div>
<br>

## Autark toolkit

**Autark** is a serverless, modular TypeScript toolkit for prototyping urban visual analytics systems entirely in the browser. It supports client-side workflows for loading, storing, querying, joining, computing, and visualizing physical and thematic urban data using standard formats such as OpenStreetMap, GeoJSON, GeoTIFF, and CSV.

The toolkit is available as the complete package `@urban-toolkit/autk` or as individual modules:

* `@urban-toolkit/autk-db`: In-browser spatial database for urban datasets.
* `@urban-toolkit/autk-compute`: WebGPU computation engine for analytical and render-based pipelines.
* `@urban-toolkit/autk-map`: WebGPU-based 2D/3D vector map visualization library.
* `@urban-toolkit/autk-plot`: D3.js-based plotting library for linked urban data views.

## Shared core package

`autk-core` is the shared runtime foundation for the Autark toolkit. It contains the data structures, math helpers, triangulators, camera utilities, color utilities, and event primitives used by the other packages.

## What is inside

`autk-core` groups its exports around a few responsibilities:

- Color mapping: `ColorMap`, `ColorMapDomainStrategy`, `ColorMapInterpolator`, `ColorMapConfig`
- Transfer functions: `DEFAULT_TRANSFER_FUNCTION`, `buildTransferContext`, `computeAlphaByte`
- Camera utilities: `Camera`, `CameraMotion`, `CameraData`, `ViewProjectionParams`
- Events: `EventEmitter`, `EventListener`, `SelectionData`
- Mesh types: `LayerGeometry`, `LayerComponent`, `LayerBorder`, `LayerBorderComponent`
- Geometry utilities: `computeOrigin`, `computeBoundingBox`, `computeGeometryCentroid`, `offsetPolyline`, `normalizeRing`, `computePointConvexHull`, `computeRingArea`, `polygonPerimeter`, `isConvex`
- Layer helpers: `LayerType`, `BoundingBox`, `isLayerType`, `mapGeometryTypeToLayerType`
- Buffer aliases: `TypedArray`, `TypedArrayConstructor`
- Data utilities: `valueAtPath`, `isNumericLike`
- Triangulators: `TriangulatorPoints`, `TriangulatorPolylines`, `TriangulatorPolygons`, `TriangulatorBuildings`, `TriangulatorBuildingWithWindows`, `TriangulatorRaster`

The complete export list lives in [`src/index.ts`](./src/index.ts).

## Notes

- Geometry helpers assume planar coordinates unless a function states otherwise.
- Triangulators convert GeoJSON and related feature data into render-ready mesh buffers.
- For implementation details and exact exports, use `src/index.ts` as the source of truth.
