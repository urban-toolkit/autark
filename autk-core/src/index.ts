// ─── Color mapping ───────────────────────────────────────────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy } from './types-colormap';
/** Interpolator identifiers for d3-scale-chromatic color schemes. */
export { ColorMapInterpolator } from './types-colormap';
/** Colormap engine: domain resolution, label generation, color sampling. */
export { ColorMap, DEFAULT_COLORMAP_RESOLUTION } from './colormap';

export type {
    /** Resolved (computed) domain: `number[]` for numeric scales, `string[]` for categorical. */
    ResolvedDomain,
    /** Input specification describing how to build a domain (USER / MIN_MAX / PERCENTILE). */
    ColorMapDomainSpec,
    /** Full colormap configuration: interpolator + domain spec. */
    ColorMapConfig,
} from './types-colormap';

// ─── Color primitives ────────────────────────────────────────────────────────

export type {
    /** Hex color string, e.g. `#ff5733`. */
    ColorHEX,
    /** RGBA color with components in `[0–255]` and alpha in `[0–1]`. */
    ColorRGB,
    /** Flat RGBA texture array: `[r, g, b, a, r, g, b, a, …]`. */
    ColorTEX,
} from './types-colormap';

// ─── Raster / transfer function ──────────────────────────────────────────────

export {
    DEFAULT_TRANSFER_FUNCTION,
    buildTransferContext,
    computeAlphaByte,
} from './transfer-function';

export type {
    TransferFunction,
    TransferContext,
    RequiredTransferFunction,
} from './transfer-function';

// ─── Geometry / mesh ─────────────────────────────────────────────────────────

export type {
    LayerGeometry,
    LayerComponent,
    LayerBorder,
    LayerBorderComponent,
} from './types-mesh';

// ─── Triangulators ───────────────────────────────────────────────────────────

export { TriangulatorPoints }    from './triangulator-points';
export { TriangulatorPolylines } from './triangulator-polylines';
export { TriangulatorPolygons }  from './triangulator-polygons';
export { TriangulatorBuildings } from './triangulator-buildings';
export { TriangulatorRaster }    from './triangulator-raster';

// ─── Camera ──────────────────────────────────────────────────────────────────

export { Camera } from './camera';
export type { CameraData, ViewProjectionParams } from './camera';
export { CameraAnimator } from './camera-animator';

// ─── Events ──────────────────────────────────────────────────────────────────

export { EventEmitter } from './event-emitter';
export type { EventListener, SelectionData } from './event-emitter';

// ─── Shared types ────────────────────────────────────────────────────────────

export type {
    /** Geographic bounding box with named coordinate fields. */
    BoundingBox,
    /** Layer geometry kind identifier. */
    LayerType,
} from './types-layer';

export type {
    /** Supported TypedArray views for binary data buffers. */
    TypedArray,
    /** Constructors for supported TypedArray views. */
    TypedArrayConstructor,
} from './types-utils';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Resolves a dot-path accessor against an object (e.g. `"properties.area"`). */
export { valueAtPath } from './utils-data';
/** Returns `true` if the value can be coerced to a finite number. */
export { isNumericLike } from './utils-data';
/** Computes the central origin of a GeoJSON FeatureCollection. */
export { computeOrigin } from './utils-geo';
/** Flattens an array of LayerGeometry pieces into continuous typed arrays. */
export { flattenMesh } from './utils-mesh';
