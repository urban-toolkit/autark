/**
 * @module AutkMap
 * Public entry point for the `autk-map` package.
 *
 * This module re-exports the main `AutkMap` controller together with the
 * supporting map, color, geometry, style, event, and API types needed to load
 * data, configure rendering, and integrate with the rest of the package. It is
 * intended to provide a single import surface for consumers of the map API.
 */

/** Main map controller for rendering, interaction, and layer lifecycle. */
export { AutkMap } from './map';

/** WebGPU renderer used by the map controller. */
export { Renderer } from './renderer';

/** Ordered layer stack manager used by the map controller. */
export { LayerManager } from './layer-manager';

/** DOM-based UI controller used by the map controller. */
export { AutkMapUi } from './map-ui';

/** Strategy enum controlling how a color-map domain is derived from data. */
export { ColorMapDomainStrategy } from './types-core';

/** Interpolator identifiers for D3 color schemes used by map color maps. */
export { ColorMapInterpolator } from './types-core';
/** Color-map utility for domain resolution, label generation, and color sampling. */
export { ColorMap } from './types-core';

/** Color-mapping types used when configuring thematic rendering. */
export type {
    /** Computed domain values resolved from the configured color-map strategy. */
    ResolvedDomain,
    /** Domain configuration describing how domain values should be determined. */
    ColorMapDomainSpec,
    /** Complete color-map configuration, including interpolator and domain settings. */
    ColorMapConfig,
} from './types-core';

/** Color primitive types used across rendering and style APIs. */
export type { ColorHEX, ColorRGB, ColorTEX } from './types-core';

/** Camera implementation used for map view and projection control. */
export { Camera } from './types-core';

/** Camera state shape used when reading or updating camera data. */
export type { CameraData } from './types-core';

/** Geometry and mesh types used by prebuilt layer data. */
export type {
    /** Mesh payload for a complete layer. */
    LayerGeometry,
    /** One renderable geometry component within a layer mesh. */
    LayerComponent,
    /** Border mesh payload associated with a layer. */
    LayerBorder,
    /** One renderable border component within a border mesh. */
    LayerBorderComponent,
} from './types-core';

/** Triangulators for converting supported data sources into renderable meshes. */
export {
    TriangulatorBuildings,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorRaster,
} from './types-core';

/** Shared spatial and layer-identification types. */
export type {
    /** Geographic bounding box with named coordinate fields. */
    BoundingBox,
    /** Layer type identifier used to select rendering and triangulation behavior. */
    LayerType,
} from './types-core';

/** Parameter types for the main `AutkMap` loading and update APIs. */
export type {
    /** Parameters for loading a GeoJSON feature collection as a map layer. */
    LoadCollectionParams,
    /** Parameters for loading a prebuilt mesh directly into the map. */
    LoadMeshParams,
    /** Parameters for updating raster values and related raster color state. */
    UpdateRasterParams,
    /** Parameters for updating thematic values from a feature collection. */
    UpdateThematicParams,
    /** Parameters for patching a layer color-map configuration. */
    UpdateColorMapParams,
    /** Parameters for patching one or more layer render settings. */
    UpdateRenderInfoParams,
} from './api';

/** Layer state and configuration types exposed by the map API. */
export type {
    /** Static layer metadata. */
    LayerInfo,
    /** Layer color-map state. */
    LayerColormap,
    /** Layer rendering configuration. */
    LayerRenderInfo,
    /** Layer geometry and derived data payload. */
    LayerData,
    /** Layer thematic values and domain metadata. */
    LayerThematic,
} from './types-layers';

/** Abstract base class returned by layer lookup and picking APIs. */
export { Layer } from './layer';

/** Built-in map style presets and helpers. */
export { MapStyle } from './map-style';

/** Types for selecting and describing map style presets. */
export type { MapStylePresetId, MapStyleShape } from './map-style';

/** Map event enums and interaction status values. */
export { MapEvent, MouseStatus } from './types-events';

/** Typed event payloads emitted by the map event bus. */
export type { MapEventData, MapEventRecord } from './types-events';
