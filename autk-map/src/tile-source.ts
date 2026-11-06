/**
 * @module AutkMapTileSource
 * Description, validation and URL building for web map tile sources.
 *
 * A source is a URL template plus the facts a tile layer needs to use it:
 * zoom limits, tile size, subdomains and the attribution it must show. The
 * template uses `{z}`, `{x}` and `{y}`, plus optionally `{s}` for a subdomain
 * and `{reverseY}` for TMS-style sources that count rows from the south.
 */

import type { TileIndex } from './tile-index';
import { MAX_TILE_ZOOM, isValidTile, tilesPerAxis } from './tile-index';

/** A web map tile source as written by an application. */
export interface TileSource {
    /**
     * URL with `{z}`, `{x}` and `{y}` (or `{reverseY}`) placeholders, and
     * optionally `{s}` for a subdomain.
     */
    urlTemplate: string;
    /** Credit shown on the map. Required: providers' terms ask for it. */
    attribution: string;
    /** Smallest zoom level the source serves. Defaults to 0. */
    minZoom?: number;
    /** Largest zoom level the source serves. Defaults to 19. */
    maxZoom?: number;
    /** Tile edge in pixels. Defaults to 256. */
    tileSize?: number;
    /**
     * Subdomains substituted for `{s}`, as a string of one-letter names or an
     * array. Required when the template uses `{s}`.
     */
    subdomains?: string | readonly string[];
}

/** A {@link TileSource} with defaults applied and validated. */
export interface ResolvedTileSource {
    readonly urlTemplate: string;
    readonly attribution: string;
    readonly minZoom: number;
    readonly maxZoom: number;
    readonly tileSize: number;
    readonly subdomains: readonly string[];
}

const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 19;
const DEFAULT_TILE_SIZE = 256;
const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const KNOWN_PLACEHOLDERS = new Set(['z', 'x', 'y', 's', 'reverseY']);

/**
 * Applies defaults to a tile source and checks it.
 *
 * @param source - Source as written by the application.
 * @returns The resolved source.
 * @throws If the template has unknown or missing placeholders, a zoom limit or
 *   the tile size is invalid, the attribution is empty, or `{s}` is used
 *   without subdomains.
 * @example
 * const resolved = resolveTileSource({
 *     urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
 *     attribution: '© OpenStreetMap contributors',
 * });
 */
export function resolveTileSource(source: TileSource): ResolvedTileSource {
    const { urlTemplate } = source;
    if (typeof urlTemplate !== 'string' || urlTemplate.length === 0) {
        throw new Error('Tile source needs a urlTemplate.');
    }

    const placeholders = new Set<string>();
    for (const match of urlTemplate.matchAll(PLACEHOLDER_PATTERN)) {
        const name = match[1] as string;
        if (!KNOWN_PLACEHOLDERS.has(name)) {
            throw new Error(`Tile source urlTemplate has unknown placeholder {${name}}. Supported: {z}, {x}, {y}, {reverseY}, {s}.`);
        }
        placeholders.add(name);
    }
    if (!placeholders.has('z') || !placeholders.has('x')) {
        throw new Error('Tile source urlTemplate must contain {z} and {x}.');
    }
    if (!placeholders.has('y') && !placeholders.has('reverseY')) {
        throw new Error('Tile source urlTemplate must contain {y} or {reverseY}.');
    }
    if (placeholders.has('y') && placeholders.has('reverseY')) {
        throw new Error('Tile source urlTemplate cannot contain both {y} and {reverseY}.');
    }

    if (typeof source.attribution !== 'string' || source.attribution.trim().length === 0) {
        throw new Error('Tile source needs an attribution: tile providers require the credit to be shown.');
    }

    const minZoom = source.minZoom ?? DEFAULT_MIN_ZOOM;
    const maxZoom = source.maxZoom ?? DEFAULT_MAX_ZOOM;
    for (const [name, value] of [['minZoom', minZoom], ['maxZoom', maxZoom]] as const) {
        if (!Number.isInteger(value) || value < 0 || value > MAX_TILE_ZOOM) {
            throw new Error(`Tile source ${name} must be an integer from 0 to ${MAX_TILE_ZOOM}.`);
        }
    }
    if (minZoom > maxZoom) {
        throw new Error('Tile source minZoom cannot be greater than maxZoom.');
    }

    const tileSize = source.tileSize ?? DEFAULT_TILE_SIZE;
    if (!Number.isInteger(tileSize) || tileSize <= 0) {
        throw new Error('Tile source tileSize must be a positive integer.');
    }

    const subdomains = typeof source.subdomains === 'string'
        ? Array.from(source.subdomains)
        : [...(source.subdomains ?? [])];
    if (placeholders.has('s') && subdomains.length === 0) {
        throw new Error('Tile source urlTemplate uses {s} but no subdomains were given.');
    }

    return { urlTemplate, attribution: source.attribution, minZoom, maxZoom, tileSize, subdomains };
}

/**
 * Builds the URL of one tile.
 *
 * The subdomain is chosen from the tile address, so a tile always comes from
 * the same host and the browser HTTP cache keeps working.
 *
 * @param source - Resolved source.
 * @param tile - Tile address.
 * @returns The tile URL.
 * @throws If the tile address is outside the grid.
 */
export function expandTileUrl(source: ResolvedTileSource, tile: TileIndex): string {
    if (!isValidTile(tile)) {
        throw new Error(`Invalid tile ${tile.z}/${tile.x}/${tile.y}.`);
    }
    const subdomain = source.subdomains.length > 0
        ? source.subdomains[(tile.x + tile.y) % source.subdomains.length] as string
        : '';
    const values: Record<string, string> = {
        z: String(tile.z),
        x: String(tile.x),
        y: String(tile.y),
        reverseY: String(tilesPerAxis(tile.z) - 1 - tile.y),
        s: subdomain,
    };
    return source.urlTemplate.replace(PLACEHOLDER_PATTERN, (_, name: string) => values[name] as string);
}

/**
 * Identifier of a source, used in cache keys.
 *
 * Two sources with the same template and tile size share tiles.
 *
 * @param source - Resolved source.
 * @returns A short string.
 */
export function tileSourceId(source: ResolvedTileSource): string {
    return `${source.urlTemplate}@${source.tileSize}`;
}

/**
 * Ready-made tile sources.
 *
 * These are conveniences, not licences. Each provider sets its own terms, and
 * the attribution must stay visible.
 *
 * - `esriWorldImagery`: Esri World Imagery satellite and aerial imagery. Free
 *   for development and light use; check Esri's terms for production.
 * - `openStreetMap`: the public OpenStreetMap tile server. Its usage policy
 *   forbids heavy use and bulk downloading; use your own server or a
 *   commercial provider for production.
 * - `cartoLight`: Carto's light basemap. Free for non-commercial use; check
 *   Carto's terms otherwise.
 */
export const TILE_SOURCES = {
    esriWorldImagery: {
        urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19,
    },
    openStreetMap: {
        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    },
    cartoLight: {
        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
    },
} as const satisfies Record<string, TileSource>;
