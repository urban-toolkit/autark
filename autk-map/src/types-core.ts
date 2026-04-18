/**
 * Single aggregation point for all `autk-core` re-exports used within `autk-map`.
 *
 * Internal modules import from here instead of directly from `autk-core`,
 * keeping the dependency edge explicit and centralized.
 */

// ─── Color mapping ───────────────────────────────────────────────────────────

export { ColorMapDomainStrategy, ColorMapInterpolator } from 'autk-core';
export { ColorMap, DEFAULT_COLORMAP_RESOLUTION } from 'autk-core';

export type { ColorHEX, ColorRGB, ColorTEX } from 'autk-core';
export type { ColorMapConfig, ColorMapDomainSpec, ResolvedDomain } from 'autk-core';

// ─── Transfer function / raster ──────────────────────────────────────────────

export { DEFAULT_TRANSFER_FUNCTION, buildTransferContext, computeAlphaByte } from 'autk-core';
export type { TransferFunction, RequiredTransferFunction } from 'autk-core';

// ─── Camera ──────────────────────────────────────────────────────────────────

export { Camera } from 'autk-core';
export type { CameraData, ViewProjectionParams } from 'autk-core';

// ─── Events ──────────────────────────────────────────────────────────────────

export { EventEmitter } from 'autk-core';
export type { EventListener } from 'autk-core';

// ─── Geometry / mesh ─────────────────────────────────────────────────────────

export type { LayerGeometry, LayerComponent, LayerBorder, LayerBorderComponent } from 'autk-core';

// ─── Shared types ────────────────────────────────────────────────────────────

export type { BoundingBox, LayerType, TypedArray, TypedArrayConstructor } from 'autk-core';

// ─── Utilities ───────────────────────────────────────────────────────────────

export {
    valueAtPath,
    isNumericLike,
    computeOrigin,
    computeBoundingBox,
    isLayerType,
    mapGeometryTypeToLayerType,
} from 'autk-core';

// ─── Triangulators ───────────────────────────────────────────────────────────

export { TriangulatorPoints }    from 'autk-core';
export { TriangulatorPolylines } from 'autk-core';
export { TriangulatorPolygons }  from 'autk-core';
export { TriangulatorBuildings } from 'autk-core';
export { TriangulatorRaster }    from 'autk-core';
