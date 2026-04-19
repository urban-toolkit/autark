# autk-core

`autk-core` is the shared runtime foundation for the Autark toolkit.

It provides the geometry, camera, color, event, and typed-array utilities used by:

- `autk-map`
- `autk-db`
- `autk-compute`
- `autk-plot`

The package currently points `main` and `types` at `src/index.ts`, so the source entrypoint is also the authoritative export surface.

## Export groups

`autk-core` exports a small number of grouped building blocks:

- Color mapping: `ColorMap`, `ColorMapDomainStrategy`, `ColorMapInterpolator`
- Transfer functions: `DEFAULT_TRANSFER_FUNCTION`, `buildTransferContext`, `computeAlphaByte`
- Triangulators: `TriangulatorPoints`, `TriangulatorPolylines`, `TriangulatorPolygons`, `TriangulatorBuildings`, `TriangulatorRaster`
- Camera: `Camera`, `CameraAnimator`
- Events: `EventEmitter`
- Geometry utilities: `computeOrigin`, `computeGeometryCentroid`, `computeBoundingBox`, `mapGeometryTypeToLayerType`, `offsetPolyline`, `flattenMesh`
- Shared types: `LayerType`, `BoundingBox`, `TypedArray`, `TypedArrayConstructor`
- Data utilities: `valueAtPath`, `isNumericLike`

The complete export list lives in [src/index.ts](/Users/mlage/Code/autark/autk-core/src/index.ts).

## Examples

```ts
import { computeBoundingBox, computeGeometryCentroid } from 'autk-core';

const bbox = computeBoundingBox(featureCollection);
const center = computeGeometryCentroid(feature.geometry);
```

```ts
import { Camera } from 'autk-core';

const matrix = Camera.buildViewProjection({
  eye: [0, 0, 10],
  lookAt: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 60,
  aspect: 1,
  near: 0.1,
  far: 1000,
});
```

## Notes

- Geometry helpers assume planar coordinates unless a function says otherwise.
- Triangulators and mesh helpers are intended for toolkit-internal rendering/data flows, but remain available to sibling modules.
- For implementation details and exact exports, use `src/index.ts` as the source of truth.
