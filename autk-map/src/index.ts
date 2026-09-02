/**
 * @module AutkMap
 * Public entry point for the `@urban-toolkit/autk-map` package.
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

/** Parameter types for the main `AutkMap` loading and update APIs. */
export type {
    /** Parameters for loading a GeoJSON feature collection as a map layer. */
    LoadCollectionParams,
    /** Optional geometry-building configuration applied while loading a collection. */
    LoadCollectionConfig,
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

/** Built-in map style presets, helpers, and required semantic color slots. */
export { MapStyle, MAP_STYLE_KEYS } from './map-style';

/** Types for selecting and describing map style presets and color slots. */
export type { MapStyleKey, MapStylePresetId, MapStyleShape } from './map-style';

/** Map event enums and interaction status values. */
export { MapEvent, MouseStatus } from './types-events';

/** Typed event payloads emitted by the map event bus. */
export type { MapEventData, MapEventRecord } from './types-events';
