/**
 * @module AutkMapApi
 * Parameter interfaces for loading and updating map layers.
 *
 * This module defines the public request shapes used by `AutkMap` layer APIs.
 * The interfaces describe how GeoJSON collections, prebuilt mesh data, raster
 * payloads, thematic mappings, color-map patches, and render-state updates are
 * passed into the map so layer creation and incremental updates can be applied
 * consistently.
 */

import type { TileCrs } from './tile-projection';
import type { TileSource } from './tile-source';
import type { TerrainTileSource } from './terrain-tile-source';
import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import type {
    ElevationValidationOptions,
    ColorMapConfig,
    TransferFunction,
    LayerComponent,
    LayerGeometry,
    LayerType,
} from '@urban-toolkit/autk-core';

import type { 
    LayerRenderInfo, 
    LayerThematic 
} from './types-layers';

import type { RasterRgbBands, RasterRgbRange } from './raster-rgb';

/** Coordinate system of normalized data supplied to the map. */
export interface MapOptions {
    /** Workspace CRS; defaults to the same EPSG:3395 CRS as AutkDb. */
    crs?: TileCrs;
}

/** A normalized raster elevation collection, including its band property. */
export interface TerrainRasterSource {
    collection: FeatureCollection<Geometry | null>;
    property: string;
}

/** One terrain-loading API for elevation tiles and normalized raster data. */
export interface LoadTerrainParams extends Omit<EnableTerrainTilesParams, 'source'> {
    /** Elevation tile descriptor or normalized raster collection and band property. */
    source: TerrainTileSource | TerrainRasterSource;
    /** Optional initial WGS84 view. Required for tile terrain when the map has no origin. */
    center?: { latitude: number; longitude: number };
    /** Initial zoom; requires center and defaults to 12. */
    zoom?: number;
}

/**
 * A rectangle `[minX, minY, maxX, maxY]` in the coordinate system of the data the map was given (the workspace
 * coordinate system, in meters, for data from `AutkDb`), not relative to the map origin.
 */
export type MapBounds = [minX: number, minY: number, maxX: number, maxY: number];

/**
 * Parameters for loading a feature collection as a map layer.
 *
 * When `type` is omitted, the map may infer a vector layer type from the
 * collection's non-null geometries. Mixed-geometry collections require an
 * explicit `type`. Pass `type: 'raster'` together with `property` to load a
 * GeoTIFF-derived raster layer.
 *
 * For vector layers, `property` is optional and is used to initialize thematic
 * mapping immediately after the layer is created. For raster layers, `property`
 * selects the band array stored on the raster feature properties (for example
 * `band_1`).
 */
export interface LoadCollectionConfig {
    /**
     * Optional flag to preserve buildings that lack valid height metadata.
     */
    buildingsZeroHeight?: boolean;
    /**
     * Band values that map to 0 and 255 when a raster layer is drawn as an RGB
     * image (`property` given as three bands). Defaults to `[0, 255]` for 8-bit
     * imagery and to the smallest and largest channel value of complete, finite RGB pixels otherwise.
     * Use `[0, 1]` explicitly for normalized floating-point imagery.
     */
    rgbRange?: RasterRgbRange;
}

export interface LoadCollectionParams {
    /**
     * Source feature collection to load.
     *
     * Raster-derived collections may contain `null` geometries because values
     * are provided as flat band arrays on the feature properties rather than as
     * per-cell vector geometries.
     */
    collection: FeatureCollection<Geometry | null>;
    /**
     * Optional explicit layer type override.
     *
     * Provide this when geometry-based inference is ambiguous, such as for
     * mixed-geometry collections, or when the intended semantic layer type
     * should not be derived automatically.
     */
    type?: LayerType | null;
    /**
     * Optional geometry-building configuration applied while loading.
     */
    loadConfig?: LoadCollectionConfig;
    /**
     * Property accessor used to derive layer values.
     *
     * Use a dot-path string accessor such as `properties.shape_area`.
     *
     * For vector layers, the path is resolved from each feature and is applied
     * immediately as the initial thematic mapping when provided.
     *
     * For raster layers, the path is resolved from the feature properties and
     * must point to a flat band array such as `band_1`, which is drawn through
     * the layer color map. Pass three paths, such as
     * `['band_1', 'band_2', 'band_3']`, to draw the bands as a true-color RGB
     * image instead. The color map does not apply to an RGB raster.
     */
    property?: string | RasterRgbBands;
}

/**
 * Parameters for loading a prebuilt triangle mesh directly.
 *
 * Mesh inputs bypass GeoJSON triangulation and are added as already-prepared
 * geometry. The geometry, components, and optional thematic values are expected
 * to remain aligned by index so rendering, picking, and color mapping refer to
 * the same logical mesh parts.
 */
export interface LoadMeshParams {
    /**
     * Mesh geometry in map-local coordinates.
     *
     * Coordinates must already be expressed relative to the map's current
     * shared origin.
     */
    geometry: LayerGeometry[];
    /**
     * Per-component metadata aligned with `geometry`.
     *
     * Component ordering is used for picking and for associating thematic data
     * with rendered mesh parts.
     */
    components: LayerComponent[];
    /**
     * Optional thematic values aligned one-to-one with `components`.
     *
     * When provided, each thematic entry should correspond to the component at
     * the same index.
     */
    thematic?: LayerThematic[];
    /**
     * Mesh render type.
     *
     * Currently only `'buildings'` is supported by the map mesh-loading API.
     */
    type?: 'buildings';
}

/**
 * Parameters for updating a raster layer's values.
 *
 * Raster updates replace the value source for an existing raster layer. The
 * `property` accessor is resolved from `collection.features[0].properties` and
 * must point to a flat band array such as `band_1`, or be three such accessors
 * to draw the bands as a true-color RGB image.
 */
export interface UpdateRasterParams {
    /**
     * GeoTIFF-derived feature collection containing raster payload data.
     */
    collection: FeatureCollection<Geometry | null>;
    /**
     * Dot-path accessor for the flat raster band array on feature properties.
     *
     * Pass three accessors in red, green, blue order, such as
     * `['band_1', 'band_2', 'band_3']`, to draw them as a true-color RGB image.
     * Each band must match the existing layer's width times height; updates do not resize the grid.
     * The bands must have the same length, and the color map and
     * `transferFunction` do not apply.
     */
    property: string | RasterRgbBands;
    /**
     * Optional transfer function used to derive raster opacity from values.
     * Ignored for an RGB raster.
     */
    transferFunction?: TransferFunction;
    /**
     * Band values that map to 0 and 255 for an RGB raster. Defaults to
     * `[0, 255]` for 8-bit imagery and to the smallest and largest channel value of complete, finite pixels
     * otherwise, so reflectance data may need an explicit range such as
     * `[0, 3000]` to look right. Use `[0, 1]` explicitly for normalized imagery.
     */
    rgbRange?: RasterRgbRange;
}

/**
 * Parameters for loading a tile basemap with {@link AutkMap.loadTiles}.
 *
 * Tiles are web map tiles in the Web Mercator (EPSG:3857) grid, fetched as the
 * camera moves and drawn below every other layer.
 */
export interface LoadTilesParams {
    /**
     * Where the tiles come from: a preset from `TILE_SOURCES` or a custom
     * URL template. The attribution is required and is shown on the map, as
     * text or, where the source gives a URL, as a link; the caller is
     * responsible for following the provider's terms of use.
     */
    source: TileSource;
    /**
     * Workspace/output coordinate system of the map's data, not the source CRS
     * of an imported file. Inherits the map workspace CRS, whose default is the shared
     * `DEFAULT_WORKSPACE_COORDINATE_FORMAT` (`'EPSG:3395'`), also used by AutkDb.
     * The first geographic load may declare a custom workspace CRS when the map constructor
     * did not specify one. Subsequent conflicting settings are rejected before allocation.
     */
    crs?: TileCrs;
    /**
     * Optional WGS84 center for the initial view, using named latitude/longitude in degrees.
     * Initializes a tile-only scene without another data layer. An existing shared origin is preserved.
     * The point is projected into `crs`; supplying a center explicitly positions the camera.
     */
    center?: { latitude: number; longitude: number };
    /**
     * Initial Web Mercator zoom (0–30, fractional values allowed); requires `center`.
     * Defaults to 12 when `center` is supplied. Uses the source tile size and CSS pixels;
     * device pixel ratio independently controls imagery resolution.
     */
    zoom?: number;
    /** Layer opacity from 0 to 1. Defaults to 1. */
    opacity?: number;
    /** Positive safe integer soft cache limit. Defaults to 256. Invalid values are rejected. */
    maxCachedTiles?: number;
    /**
     * Added to the zoom level chosen for the view. Positive values give
     * sharper tiles and more requests, negative values the opposite.
     * Defaults to 0.
     */
    zoomBias?: number;
    /**
     * Positive safe integer cap on selected tiles; ancestor preloads add requests. The zoom drops to fit; if the
     * source's lowest zoom still needs more, only the tiles nearest the view
     * centre are used. Defaults to 64.
     */
    maxTiles?: number;
}

/**
 * Parameters for `AutkMap.enableTerrainTiles`, which streams terrain elevation
 * from a web tile service.
 */
export interface EnableTerrainTilesParams {
    /** Conservative, region-independent elevation validation. Enabled by default; false preserves raw heights. */
    validation?: false | ElevationValidationOptions;
    /**
     * Where the elevation tiles come from: a preset from `TERRAIN_TILE_SOURCES`
     * or a custom source with its `encoding`. The attribution is required and is
     * shown on the map; the caller is responsible for following the provider's terms.
     */
    source: TerrainTileSource;
    /**
     * Coordinate system of the map's data. Inherited from the map; defaults to `'EPSG:3395'`, the workspace default of `AutkDb`.
     * Only metre-based systems are accepted: heights are metres, so a map plane in degrees would give a distorted scene.
     */
    crs?: Exclude<TileCrs, 'EPSG:4326'>;
    /**
     * Nested windows of height samples around the view, finest first; each covers
     * twice the area of the one before. Fewer are used when the source has too few
     * zoom levels. Defaults to 6, at most 8.
     */
    levels?: number;
    /** Samples along each window edge, an even number. Defaults to 512. */
    windowSize?: number;
    /**
     * Added to the finest zoom (14, or the source's `maxZoom` when lower).
     * Negative values give coarser terrain and fewer requests. Defaults to 0.
     */
    zoomBias?: number;
    /** Elevation tiles kept in memory. Defaults to 128. */
    maxCachedTiles?: number;
    /**
     * Multiplies every height. Heights are metres while the map plane is
     * EPSG:3395 metres, which are stretched by about `1/cos(latitude)`, as are
     * building heights, so the default keeps them consistent. Defaults to 1.
     */
    verticalScale?: number;
    /** Milliseconds of terrain composition per frame before the rest waits for the next frame (default 4; `Infinity` for no limit). */
    composeBudgetMs?: number;
    /** Draped-layer overlay edge in pixels, from 64 to 4096. Defaults to 2048 for tiles and 4096 for raster terrain. */
    overlaySize?: number;
}

/**
 * Parameters for updating a layer's thematic (color-mapped) values.
 *
 * The supplied collection is used to recompute thematic values for an existing
 * layer. Correct alignment depends on how the target layer matches source data,
 * so callers should preserve stable feature ordering or identifiers when
 * preparing update collections.
 */
export interface UpdateThematicParams {
    /**
     * Source feature collection used to derive thematic values.
     *
     * Prefer the original loaded feature collection, or one with stable
     * matching `feature.id` values, so thematic values align correctly to the
     * rendered components.
     */
    collection: FeatureCollection;
    /**
     * Dot-path accessor resolved from each item in the collection.
     */
    property: string;
}

/**
 * Parameters for patching a layer's color-map configuration.
 *
 * The provided object is treated as a partial patch and merged into the layer's
 * existing color-map state rather than replacing the full configuration.
 */
export interface UpdateColorMapParams {
    /**
     * Partial color-map patch merged with the existing layer color-map state.
     */
    colorMap: Partial<ColorMapConfig>;
}

/**
 * Parameters for updating one or more render properties of a layer.
 *
 * Use this to patch render-state fields such as visibility, opacity, picking,
 * or other supported layer render flags without rebuilding the layer.
 */
export interface UpdateRenderInfoParams {
    /**
     * Partial render-state patch applied to the target layer.
     */
    renderInfo: Partial<LayerRenderInfo>;
}

/**
 * Options for starting map rendering with `AutkMap.draw`.
 *
 * By default the map draws once and then only when something changes.
 * Set `onDemand: false` or provide `fps` to use a continuous loop.
 */
export interface MapDrawOptions {
    /**
     * Target frames per second of the continuous loop (default `60`).
     *
     * Pass `0` to render as fast as possible. Ignored when `onDemand` is `true`.
     */
    fps?: number;
    /**
     * Draws only when the picture changes (default `true` unless `fps` is provided).
     *
     * The map then requests a frame itself after every change it can observe:
     * camera navigation and resizing, layer loads, updates and removals, style
     * changes, picking and terrain changes. Changes made in the same frame are
     * drawn once. Direct mutations require `AutkMap.requestRender()` and,
     * for cached uniforms or CPU buffers, the corresponding layer dirty mark.
     */
    onDemand?: boolean;
}
