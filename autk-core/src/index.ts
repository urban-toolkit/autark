/**
 * @module AutkCore
 * Shared color, geometry, camera, event, and utility exports for Autark.
 *
 * This entry point re-exports the core building blocks used across the
 * workspace: colormap configuration and color primitives, transfer-function
 * helpers, geometry types and triangulators, camera and camera-motion
 * utilities, typed events, shared layer and buffer types, and general data
 * helpers.
 */

/** Colormap configuration, domain strategies, and color primitives. */
// ─── Color mapping ───────────────────────────────────────────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy } from './types-colormap';
/** Interpolator identifiers for d3-scale-chromatic color schemes. */
export { ColorMapInterpolator } from './types-colormap';
/** Colormap engine: domain resolution, label generation, color sampling. */
export { ColorMap, DEFAULT_COLORMAP_RESOLUTION } from './colormap';

export type {
    /** Resolved (computed) domain values for numeric or categorical scales. */
    ResolvedDomain,
    /** Input specification describing how the colormap domain is derived. */
    ColorMapDomainSpec,
    /** Full colormap configuration combining interpolator and domain strategy. */
    ColorMapConfig,
} from './types-colormap';

/** Hex, RGBA, and texture-ready color representations. */
// ─── Color primitives ────────────────────────────────────────────────────────

export type {
    /** Hex color string, e.g. `#ff5733`. */
    ColorHEX,
    /** RGBA color with byte components and normalized alpha. */
    ColorRGB,
    /** Flat RGBA texture array suitable for upload to GPU-backed textures. */
    ColorTEX,
} from './types-colormap';

/** Scalar-to-opacity transfer-function helpers used by raster rendering. */
// ─── Raster / transfer function ──────────────────────────────────────────────

export {
    /** Default transfer-function configuration for scalar-to-opacity mapping. */
    DEFAULT_TRANSFER_FUNCTION,
    /** Precomputes min/max and opacity parameters for efficient alpha evaluation. */
    buildTransferContext,
    /** Maps a scalar value to an 8-bit alpha channel using a transfer context. */
    computeAlphaByte,
} from './transfer-function';

export type {
    /** Transfer-function options controlling how scalar values map to opacity. */
    TransferFunction,
    /** Derived transfer-function state used during per-value alpha evaluation. */
    TransferContext,
    /** Fully resolved transfer-function config with defaults applied. */
    RequiredTransferFunction,
} from './transfer-function';

/** Shared geometry buffer and component types for generated meshes. */
// ─── Geometry / mesh ─────────────────────────────────────────────────────────

export type {
    /** Mesh geometry buffers for a rendered layer fragment. */
    LayerGeometry,
    /** Aggregate counts describing one triangulated layer component. */
    LayerComponent,
    /** Border geometry buffers for stroked or outlined layers. */
    LayerBorder,
    /** Aggregate counts describing one triangulated border component. */
    LayerBorderComponent,
} from './types-mesh';

/** Feature triangulators for points, lines, polygons, buildings, and raster grids. */
// ─── Triangulators ───────────────────────────────────────────────────────────

/** Triangulates point features into renderable marker geometry. */
export { TriangulatorPoints }    from './triangulator-points';
/** Triangulates polyline features into stroked mesh geometry. */
export { TriangulatorPolylines } from './triangulator-polylines';
/** Triangulates polygon features into filled mesh geometry. */
export { TriangulatorPolygons }  from './triangulator-polygons';
/** Triangulates OSM-style building features into extruded 3D meshes. */
export { TriangulatorBuildings } from './triangulator-buildings';
/** Triangulates simplified building shells and emits procedural window layouts. */
export { TriangulatorBuildingWithWindows } from './triangulator-windows';

export type {
    /** Describes one generated procedural window instance on a building facade. */
    BuildingWindowLayoutEntry,
    /** Generated window point collection plus detailed per-window layout metadata. */
    BuildingWindowLayoutResult,
} from './triangulator-windows';
/** Triangulates raster cells into renderable grid geometry. */
export { TriangulatorRaster }    from './triangulator-raster';

/** Camera primitives and motion utilities for map navigation. */
// ─── Camera ──────────────────────────────────────────────────────────────────

/** Interactive 3-DOF map camera with view and projection matrix management. */
export { Camera } from './camera';
export type {
    /** Initial camera position and orientation parameters. */
    CameraData,
    /** One-shot parameters for constructing a view-projection matrix. */
    ViewProjectionParams,
} from './camera';

/** Sequential camera motion builder for smooth view transitions. */
export { CameraMotion } from './camera-motion';

/** Typed event emitter helpers shared across interaction and rendering layers. */
// ─── Events ──────────────────────────────────────────────────────────────────

/** Lightweight typed event emitter used across interaction and rendering layers. */
export { EventEmitter } from './event-emitter';
export type {
    /** Listener callback invoked with a typed event payload. */
    EventListener,
    /** Shared selection payload used across interaction events. */
    SelectionData,
} from './event-emitter';

/** Layer, geometry, and typed-array types shared across packages. */
// ─── Shared types ────────────────────────────────────────────────────────────

export type {
    /** Geographic bounding box with named coordinate fields. */
    BoundingBox,
    /** Shared layer geometry kind identifier used across rendering modules. */
    LayerType,
} from './types-layer';

/** OSM base layer types in fixed bottom-up render order. */
export { OSM_BASE_LAYER_ORDER } from './types-layer';

/** All `LayerType` values as a readonly array. */
export { LAYER_TYPE_VALUES } from './types-layer';

export type {
    /** Supported TypedArray views for binary data buffers. */
    TypedArray,
    /** Constructors for supported TypedArray views. */
    TypedArrayConstructor,
} from './types-buffer';

/** General-purpose GeoJSON, layer, and path utilities. */
// ─── Utilities ───────────────────────────────────────────────────────────────

/** Resolves a dot-path accessor against an object (e.g. `"properties.area"`). */
export { valueAtPath } from './utils-data';
/** Returns `true` if the value can be coerced to a finite number. */
export { isNumericLike } from './utils-data';
/** Computes the central origin of a GeoJSON FeatureCollection. */
export { computeOrigin } from './utils-geojson';
/** Computes a geometry-aware centroid for a GeoJSON geometry. */
export { computeGeometryCentroid } from './utils-geojson';
/** Computes the bounding box of a GeoJSON collection or geometry. */
export { computeBoundingBox } from './utils-geojson';
/** Returns true when a string matches a shared layer type. */
export { isLayerType } from './utils-layer';
/** Maps a GeoJSON geometry type to the shared layer taxonomy. */
export { mapGeometryTypeToLayerType } from './utils-layer';
/** Builds a closed planar offset polygon from a local-space polyline. */
export { offsetPolyline } from './utils-geometry';
