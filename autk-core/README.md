# Autark: A Serverless Toolkit for Prototyping Urban Visual Analytics Systems
<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**Autark** is a modular and serverless toolkit built in TypeScript to streamline the implementation and deployment of urban visual analytics systems. 

It provides a client-side platform for the complete implementation of urban visual analytics systems. It supports loading, storing, querying, joining, and exporting both physical and thematic urban data using standard formats like OpenStreetMap, GeoJSON, and GeoTIFF. Employing GPU acceleration, it allows for fast implementations of urban analysis algorithms. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is composed of four modules:

* `autk-db`: A spatial database that handles physical and thematic urban datasets.
* `autk-compute`: a WebGPU based general-purpose computation engine to implement general-purpose algorithms using physical and thematic data.
* `autk-map`: A map visualization library that allows the exploration of 2D and 3D physical and thematical layers.
* `autk-plot`: A d3.js based plot library designed to consume urban data in standard formats and create linked views.

For demonstration purposes and to facilitate the adoption of Autark, we created a large collection of simple examples illustrating the core functionalities of each module. We also provide several examples on how to combine several modules to build complex applications. All examples are organized in the `example/` directory.

# autk-core

`autk-core` is the shared runtime foundation for the Autark toolkit.

It concentrates the data structures, math helpers, triangulators, and camera/
color/event primitives that the other packages build on. In practice, `autk-core`
is where GeoJSON data is normalized, interpreted, and turned into the common
mesh and rendering-friendly shapes consumed by:

## What’s inside

`autk-core` groups its exports around a few responsibilities:

- Color mapping: `ColorMap`, `ColorMapDomainStrategy`, `ColorMapInterpolator`, `ColorMapConfig`
- Transfer functions: `DEFAULT_TRANSFER_FUNCTION`, `buildTransferContext`, `computeAlphaByte`
- Camera: `Camera`, `CameraMotion`, `CameraData`, `ViewProjectionParams`
- Events: `EventEmitter`, `EventListener`, `SelectionData`
- Mesh types: `LayerGeometry`, `LayerComponent`, `LayerBorder`, `LayerBorderComponent`
- Geometry utilities: `computeOrigin`, `computeBoundingBox`, `computeGeometryCentroid`, `offsetPolyline`, `normalizeRing`, `computePointConvexHull`, `computeRingArea`, `polygonPerimeter`, `isConvex`
- Layer helpers: `LayerType`, `BoundingBox`, `isLayerType`, `mapGeometryTypeToLayerType`
- Buffer aliases: `TypedArray`, `TypedArrayConstructor`
- Data utilities: `valueAtPath`, `isNumericLike`
- Triangulators: `TriangulatorPoints`, `TriangulatorPolylines`, `TriangulatorPolygons`, `TriangulatorBuildings`, `TriangulatorBuildingWithWindows`, `TriangulatorRaster`

The complete export list lives in [`src/index.ts`](./src/index.ts).

## Notes

- Geometry helpers assume planar coordinates unless a function says otherwise.
- Triangulators convert GeoJSON and related feature data into render-ready mesh buffers.
- For implementation details and exact exports, use `src/index.ts` as the source of truth.
