/**
 * @module AutkMapTileProjection
 * Coordinate conversions between longitude/latitude and the map coordinate
 * systems a tile layer can draw into.
 *
 * Web map tiles are laid out in EPSG:3857 (spherical Mercator). The map itself
 * works in the coordinate system of the data it shows, which for `autk-db`
 * workspaces is EPSG:3395 (ellipsoidal "World Mercator") unless configured
 * otherwise. Both share the same x axis but differ in y, because 3395 uses
 * the WGS84 ellipsoid. At Lagos (6.5°N) the two y values differ by about
 * 4.8 km, and at 40°N by about 27 km, so a tile cannot be placed as a plain
 * rectangle.
 *
 * Only forward formulas are needed to draw. The inverses exist to find which
 * tiles cover the screen.
 */

/** Map coordinate systems a tile layer can draw into. */
export type TileCrs = 'EPSG:3395' | 'EPSG:3857' | 'EPSG:4326';

/** All supported tile layer coordinate systems. */
export const TILE_CRS_VALUES: readonly TileCrs[] = ['EPSG:3395', 'EPSG:3857', 'EPSG:4326'] as const;

/** WGS84 semi-major axis in metres, also the sphere radius of EPSG:3857. */
export const EARTH_RADIUS = 6378137;

/** WGS84 first eccentricity. */
const ECCENTRICITY = 0.0818191908426215;

/** Latitude at which the Web Mercator square ends, in degrees. */
export const WEB_MERCATOR_MAX_LAT = 85.0511287798066;

/** Half the side of the Web Mercator square in metres (`π · EARTH_RADIUS`). */
export const WEB_MERCATOR_EXTENT = Math.PI * EARTH_RADIUS;

const DEG = Math.PI / 180;

/**
 * Tells whether a value names a supported tile layer coordinate system.
 *
 * @param value - Value to test.
 * @returns `true` for `'EPSG:3395'`, `'EPSG:3857'` and `'EPSG:4326'`.
 */
export function isTileCrs(value: unknown): value is TileCrs {
    return typeof value === 'string' && (TILE_CRS_VALUES as readonly string[]).includes(value);
}

/**
 * Clamps a latitude to the range Web Mercator can represent.
 *
 * @param lat - Latitude in degrees.
 * @returns The latitude limited to ±{@link WEB_MERCATOR_MAX_LAT}.
 */
export function clampLatitude(lat: number): number {
    return Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, lat));
}

/**
 * Spherical Mercator y (EPSG:3857) of a latitude.
 *
 * @param lat - Latitude in degrees, clamped to the Web Mercator range.
 * @returns y in metres, positive north.
 */
export function latToMercatorY(lat: number): number {
    const phi = clampLatitude(lat) * DEG;
    return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

/**
 * Latitude of a spherical Mercator y (EPSG:3857), the closed-form inverse of
 * {@link latToMercatorY}.
 *
 * @param y - y in metres, positive north.
 * @returns Latitude in degrees.
 */
export function mercatorYToLat(y: number): number {
    return (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / DEG;
}

/**
 * Ellipsoidal Mercator y (EPSG:3395) of a latitude.
 *
 * @param lat - Latitude in degrees, clamped to the Web Mercator range.
 * @returns y in metres, positive north.
 */
function latToWorldMercatorY(lat: number): number {
    const phi = clampLatitude(lat) * DEG;
    const sin = Math.sin(phi);
    const ellipsoid = Math.pow((1 - ECCENTRICITY * sin) / (1 + ECCENTRICITY * sin), ECCENTRICITY / 2);
    return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2) * ellipsoid);
}

/**
 * Latitude of an ellipsoidal Mercator y (EPSG:3395), by fixed-point iteration.
 *
 * @param y - y in metres, positive north.
 * @returns Latitude in degrees.
 */
function worldMercatorYToLat(y: number): number {
    const t = Math.exp(-y / EARTH_RADIUS);
    let phi = Math.PI / 2 - 2 * Math.atan(t);
    for (let i = 0; i < 12; i++) {
        const sin = Math.sin(phi);
        const next = Math.PI / 2 - 2 * Math.atan(
            t * Math.pow((1 - ECCENTRICITY * sin) / (1 + ECCENTRICITY * sin), ECCENTRICITY / 2),
        );
        const converged = Math.abs(next - phi) < 1e-14;
        phi = next;
        if (converged) break;
    }
    return phi / DEG;
}

/**
 * Converts a longitude/latitude pair to a map coordinate system.
 *
 * Mercator systems limit the latitude to ±{@link WEB_MERCATOR_MAX_LAT}.
 *
 * @param crs - Target coordinate system.
 * @param lon - Longitude in degrees.
 * @param lat - Latitude in degrees.
 * @returns `[x, y]` in the units of `crs` (metres, or degrees for EPSG:4326).
 * @example
 * lonLatToCrs('EPSG:3395', 2.65, 6.46); // → [294,998, 715,6xx]
 */
export function lonLatToCrs(crs: TileCrs, lon: number, lat: number): [number, number] {
    switch (crs) {
        case 'EPSG:4326':
            return [lon, lat];
        case 'EPSG:3857':
            return [EARTH_RADIUS * lon * DEG, latToMercatorY(lat)];
        case 'EPSG:3395':
            return [EARTH_RADIUS * lon * DEG, latToWorldMercatorY(lat)];
    }
}

/**
 * Converts a map coordinate to longitude/latitude, the inverse of
 * {@link lonLatToCrs}.
 *
 * @param crs - Source coordinate system.
 * @param x - x in the units of `crs`.
 * @param y - y in the units of `crs`.
 * @returns `[lon, lat]` in degrees.
 */
export function crsToLonLat(crs: TileCrs, x: number, y: number): [number, number] {
    switch (crs) {
        case 'EPSG:4326':
            return [x, y];
        case 'EPSG:3857':
            return [x / EARTH_RADIUS / DEG, mercatorYToLat(y)];
        case 'EPSG:3395':
            return [x / EARTH_RADIUS / DEG, worldMercatorYToLat(y)];
    }
}
