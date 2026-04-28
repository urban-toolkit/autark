/**
 * @module AutkMapCoreTypes
 * Shared `autk-core` definitions used by `autk-map`.
 *
 * This module centralizes the core type, class, constant, and helper
 * re-exports that the map renderer, layer pipeline, and interaction code rely
 * on. It keeps color mapping, transfer-function handling, camera state,
 * events, geometry metadata, and shared utility definitions available from a
 * single package-local entry point.
 */

// ─── Color mapping ───────────────────────────────────────────────────────────

/** Color mapping strategies and interpolation modes used by thematic styling. */
export { ColorMapDomainStrategy, ColorMapInterpolator } from 'autk-core';

/** Color map builder and default lookup-table resolution for layer styling. */
export { ColorMap, DEFAULT_COLORMAP_RESOLUTION } from 'autk-core';

/** Shared color encodings and color map configuration types. */
export type { ColorHEX, ColorRGB, ColorTEX } from 'autk-core';
export type { ColorMapConfig, ColorMapDomainSpec, ResolvedDomain } from 'autk-core';

// ─── Transfer function / raster ──────────────────────────────────────────────

/** Default transfer-function configuration and raster alpha helpers. */
export { DEFAULT_TRANSFER_FUNCTION, buildTransferContext, computeAlphaByte } from 'autk-core';

/** Transfer-function shapes used to describe raster opacity and value mapping. */
export type { TransferFunction, RequiredTransferFunction } from 'autk-core';

// ─── Camera ──────────────────────────────────────────────────────────────────

/** Camera controller and associated view/projection parameter types. */
export { Camera } from 'autk-core';

/** Serializable camera state and view/projection parameter definitions. */
export type { CameraData, ViewProjectionParams } from 'autk-core';

// ─── Events ──────────────────────────────────────────────────────────────────

/** Typed event bus and listener signatures used by map interaction code. */
export { EventEmitter } from 'autk-core';

/** Listener signature used by the shared event emitter. */
export type { EventListener } from 'autk-core';

// ─── Geometry / mesh ─────────────────────────────────────────────────────────

/** Layer geometry, component, and border metadata used to build renderable meshes. */
export type { LayerGeometry, LayerComponent, LayerBorder, LayerBorderComponent } from 'autk-core';

// ─── Shared types ────────────────────────────────────────────────────────────

/** Common shared types used across layer management and GPU data handling. */
export type { BoundingBox, LayerType, TypedArray, TypedArrayConstructor } from 'autk-core';

/** OSM base layer render order shared with autk-core. */
export { OSM_BASE_LAYER_ORDER, LAYER_TYPE_VALUES } from 'autk-core';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Generic lookup and geometry helpers used by layer-loading and update paths. */
export {
    valueAtPath,
    isNumericLike,
    computeOrigin,
    computeBoundingBox,
    isLayerType,
    mapGeometryTypeToLayerType,
} from 'autk-core';

// ─── Triangulators ───────────────────────────────────────────────────────────

/** Geometry triangulators that convert source features into renderable mesh data. */
export { TriangulatorPoints }    from 'autk-core';
export { TriangulatorPolylines } from 'autk-core';
export { TriangulatorPolygons }  from 'autk-core';
export { TriangulatorBuildings } from 'autk-core';
export { TriangulatorRaster }    from 'autk-core';
