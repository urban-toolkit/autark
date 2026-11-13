/**
 * @module AutkMapTileSelection
 * Chooses which tiles a camera needs.
 *
 * The selection finds the ground the camera can see, turns that footprint into a
 * longitude/latitude box, picks the zoom level whose tile pixel is close to one
 * screen pixel at the view centre, and lists the tiles in the box, nearest to
 * the centre first.
 *
 * Two limits keep the work bounded. The footprint reaches at most a set
 * distance from the camera, and the result never holds more than `maxTiles`
 * tiles: the zoom drops until the box fits, and if even the source's lowest
 * zoom does not fit, the tiles nearest the view centre are kept and the result
 * is flagged as `truncated`. Counting is done on tile ranges, so the cost does
 * not depend on how many tiles the footprint covers.
 *
 * The module is pure: it reads a camera through a small interface
 * ({@link GroundCamera}, which `Camera` satisfies) and has no WebGPU code.
 */

import type { LonLatBounds, TileIndex, TileRange } from './tile-index';
import { lonLatToTileCoord, metresPerPixel, tileRangeCount, tileRangeInBounds, tilesInRange } from './tile-index';
import type { TileCrs } from './tile-projection';
import { EARTH_RADIUS, crsToLonLat } from './tile-projection';
import type { ResolvedTileSource } from './tile-source';

/** The part of a camera that selection uses. `Camera` from `autk-core` provides it. */
export interface GroundCamera {
    /** Camera position in map coordinates (relative to the origin). */
    getEye(): [number, number, number];
    /**
     * The ground visible within `reach` of the point below the eye, as a convex
     * polygon that also covers what the interior of the screen sees near the
     * horizon. Empty when no ground is visible.
     */
    getGroundFootprint(reach: number): Array<[number, number]>;
    /**
     * Where the ray through a normalized screen position (`x` right, `y` up,
     * both in `[0, 1]`) meets the ground, clamped to `maxDistance` along the ray.
     */
    getGroundPoint(x: number, y: number, maxDistance: number): [number, number];
    /** Viewport width in device pixels. */
    getViewportWidth(): number;
    /** Viewport height in device pixels. */
    getViewportHeight(): number;
}

/** The view a selection is made for. */
export interface TileView {
    /** Camera looking at the map. */
    camera: GroundCamera;
    /** Map origin, in the map CRS. */
    origin: readonly [number, number];
    /** Coordinate system of the map. */
    crs: TileCrs;
    /** Backing-store dimensions for tile resolution; camera coordinates remain unchanged. */
    viewport?: readonly [number, number];
}

/** Tuning for {@link selectTiles}. Values that are not finite numbers are ignored. */
export interface TileSelectionOptions {
    /** Added to the chosen zoom: positive for sharper tiles, negative for fewer. Defaults to 0. */
    zoomBias?: number;
    /** Most tiles in one selection. Defaults to 64. */
    maxTiles?: number;
    /**
     * Farthest ground distance, in multiples of the camera height, that the
     * selection reaches. Must be positive. Defaults to 20.
     */
    maxDistanceInHeights?: number;
}

/** Result of {@link selectTiles}. */
export interface TileSelection {
    /** Zoom level chosen. */
    z: number;
    /**
     * Zoom level the view asked for, within the source's range, before the tile
     * cap lowered it. Greater than `z` when the cap is making tiles coarser than
     * one tile pixel per screen pixel.
     */
    wantedZoom: number;
    /** Tiles to draw, nearest to the view centre first. */
    tiles: TileIndex[];
    /** Longitude/latitude box of the footprint. */
    bounds: LonLatBounds;
    /**
     * True when the footprint needs more than `maxTiles` tiles even at the
     * source's lowest zoom, so only the tiles nearest the centre are listed.
     */
    truncated: boolean;
}

const DEFAULT_MAX_TILES = 64;
const DEFAULT_MAX_DISTANCE_IN_HEIGHTS = 20;
const MIN_GROUND_DISTANCE = 1000;
const MAX_ZOOM_BIAS = 30;
const RAD = Math.PI / 180;

type Point = readonly [number, number];

/** Longitude/latitude of a map-plane point. */
function toLonLat(view: TileView, p: Point): [number, number] {
    return crsToLonLat(view.crs, p[0] + view.origin[0], p[1] + view.origin[1]);
}

/** Ground distance in metres between two lon/lat points, good for nearby points. */
function groundMetres(a: [number, number], b: [number, number]): number {
    const midLat = ((a[1] + b[1]) / 2) * RAD;
    const dx = (b[0] - a[0]) * RAD * Math.cos(midLat);
    const dy = (b[1] - a[1]) * RAD;
    return EARTH_RADIUS * Math.hypot(dx, dy);
}

const finiteOr = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Shrinks a range to a window of at most `max` tiles around a point, keeping its shape.
 */
function windowAround(range: TileRange, centre: { x: number; y: number }, max: number): TileRange {
    const fullWidth = range.x1 - range.x0 + 1;
    const fullHeight = range.y1 - range.y0 + 1;
    const scale = Math.sqrt(max / (fullWidth * fullHeight));
    let width = Math.max(1, Math.floor(fullWidth * scale));
    let height = Math.max(1, Math.floor(fullHeight * scale));
    while (width * height > max) {
        if (width >= height) width--;
        else height--;
    }
    // Rounding down leaves part of the budget unused; spend it, keeping the shape.
    for (;;) {
        const growWidth = width < fullWidth && (width + 1) * height <= max;
        const growHeight = height < fullHeight && width * (height + 1) <= max;
        if (!growWidth && !growHeight) break;
        if (growWidth && (!growHeight || width / fullWidth <= height / fullHeight)) width++;
        else height++;
    }
    const x0 = Math.min(range.x1 - width + 1, Math.max(range.x0, Math.floor(centre.x) - Math.floor((width - 1) / 2)));
    const y0 = Math.min(range.y1 - height + 1, Math.max(range.y0, Math.floor(centre.y) - Math.floor((height - 1) / 2)));
    return { z: range.z, x0, x1: x0 + width - 1, y0, y1: y0 + height - 1 };
}

/**
 * Selects the tiles a view needs.
 *
 * @param view - Camera, map origin and map CRS.
 * @param source - Resolved tile source; its zoom range and tile size apply.
 * @param options - Zoom bias, tile cap and distance limit.
 * @returns The zoom, the tiles nearest-first and the footprint box, or `null`
 *   when the camera sees no ground or the footprint is not finite.
 */
export function selectTiles(
    view: TileView,
    source: ResolvedTileSource,
    options: TileSelectionOptions = {},
): TileSelection | null {
    const { camera } = view;
    if (!(camera.getViewportWidth() > 0) || !(camera.getViewportHeight() > 0)) return null;
    const width = view.viewport?.[0] ?? camera.getViewportWidth();
    const height = view.viewport?.[1] ?? camera.getViewportHeight();
    if (!(width > 0) || !(height > 0)) return null;

    const maxTiles = Math.max(1, Math.floor(finiteOr(options.maxTiles, DEFAULT_MAX_TILES)));
    const zoomBias = Math.min(MAX_ZOOM_BIAS, Math.max(-MAX_ZOOM_BIAS, finiteOr(options.zoomBias, 0)));
    const heights = finiteOr(options.maxDistanceInHeights, DEFAULT_MAX_DISTANCE_IN_HEIGHTS);

    const eye = camera.getEye();
    const reach = Math.max(Math.max(Math.abs(eye[2]), 1) * (heights > 0 ? heights : DEFAULT_MAX_DISTANCE_IN_HEIGHTS), MIN_GROUND_DISTANCE);

    const polygon = camera.getGroundFootprint(reach);
    if (polygon.length < 3) return null;

    const lonLats = polygon.map((p) => toLonLat(view, p));
    if (!lonLats.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))) return null;
    const bounds: LonLatBounds = {
        west: Math.min(...lonLats.map((p) => p[0])),
        east: Math.max(...lonLats.map((p) => p[0])),
        south: Math.min(...lonLats.map((p) => p[1])),
        north: Math.max(...lonLats.map((p) => p[1])),
    };

    // Zoom from the ground size of one screen pixel at the centre of the view.
    const centre = camera.getGroundPoint(0.5, 0.5, reach);
    const beside = camera.getGroundPoint(0.5 + 1 / width, 0.5, reach);
    const above = camera.getGroundPoint(0.5, 0.5 + 1 / height, reach);
    const centreLonLat = toLonLat(view, centre);
    const screenMetres = Math.max(
        groundMetres(centreLonLat, toLonLat(view, beside)),
        groundMetres(centreLonLat, toLonLat(view, above)),
    );
    if (!(screenMetres > 0) || !Number.isFinite(screenMetres)) return null;

    const metresAtZoom0 = metresPerPixel(0, centreLonLat[1], source.tileSize);
    const exact = Math.log2(metresAtZoom0 / screenMetres) + zoomBias;
    let z = Math.min(source.maxZoom, Math.max(source.minZoom, Math.round(exact)));

    const wantedZoom = z;

    // Lower the zoom until the footprint fits, counting tiles without listing them.
    let range = tileRangeInBounds(bounds, z);
    while (range && tileRangeCount(range) > maxTiles && z > source.minZoom) {
        z--;
        range = tileRangeInBounds(bounds, z);
    }
    if (!range) return { z, wantedZoom, tiles: [], bounds, truncated: false };

    const c = lonLatToTileCoord(centreLonLat[0], centreLonLat[1], z);
    let truncated = false;
    if (tileRangeCount(range) > maxTiles) {
        range = windowAround(range, c, maxTiles);
        truncated = true;
    }

    const tiles = tilesInRange(range);
    const distance = (t: TileIndex) => Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y);
    tiles.sort((a, b) => distance(a) - distance(b));
    return { z, wantedZoom, tiles, bounds, truncated };
}
