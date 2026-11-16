/** Shared horizontal CRS transformations backed by Proj4js. */
/// <reference lib="es2022.error" />
import proj4 from 'proj4';
import type { Converter } from 'proj4';
import type { Position } from 'geojson';

const registeredDefinitions = new Map<string, string>();
const geographicTransforms = new Map<string, (position: Position) => Position>();
export const EARTH_RADIUS = 6378137;
export const WEB_MERCATOR_MAX_LAT = 85.0511287798066;
export const WEB_MERCATOR_EXTENT = Math.PI * EARTH_RADIUS;
const ECCENTRICITY = 0.0818191908426215;
const DEG = Math.PI / 180;

// Proj4js supplies WGS84 and Web Mercator; World Mercator is the shared DB/map default.
proj4.defs('EPSG:3395', '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');

/** Registers a named input CRS using a PROJ string or WKT definition. */
export function registerCrs(name: string, definition: string): void {
    if (!name?.trim() || !definition?.trim()) throw new Error('CRS name and definition must be nonempty strings.');
    if (registeredDefinitions.get(name) === definition) return;
    if (proj4.defs(name)) throw new Error(`Cannot redefine registered CRS ${name}.`);
    try {
        // Validate the definition before publishing it to the shared registry.
        new proj4.Proj(definition);
        proj4.defs(name, definition);
        registeredDefinitions.set(name, definition);
    } catch (error) {
        throw new Error(`Invalid CRS definition for ${name}: ${String(error)}`, { cause: error });
    }
}

/** Checks a name, PROJ string, or WKT definition against Proj4js, without a CRS whitelist. */
export function isSupportedCrs(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    try { new proj4.Proj(value); return true; } catch { return false; }
}

/** Meters per projected map unit; null denotes geographic/angular or geocentric coordinates. */
export function crsMetresPerUnit(crs: string): number | null {
    const parsed = new proj4.Proj(crs);
    const projection = parsed as typeof parsed & { projName?: string; to_meter?: number };
    if (projection.projName === 'longlat' || projection.projName === 'geocent') return null;
    return projection.to_meter ?? 1;
}

/**
 * Builds a reusable horizontal transformation for a collection or batch of positions.
 * Input CRSs may be registered names, PROJ strings, or WKT. Coordinates always use x/y
 * (longitude/latitude for geographic CRSs). Z and other trailing values are preserved;
 * this API does not perform vertical-datum transformations or raster resampling.
 */
export function createCoordinateTransform(sourceCrs: string, targetCrs: string): (position: Position) => Position {
    let converter: Converter;
    try {
        if (!sourceCrs?.trim() || !targetCrs?.trim()) throw new Error('CRS names must be nonempty strings.');
        const source = new proj4.Proj(sourceCrs), target = new proj4.Proj(targetCrs);
        if ((source as typeof source & { projName?: string }).projName === 'geocent'
            || (target as typeof target & { projName?: string }).projName === 'geocent') throw new Error('Geocentric CRSs require a 3D transformation, not horizontal reprojection.');
        converter = proj4(source, target);
    } catch (error) {
        throw new Error(`Unsupported CRS transformation from ${sourceCrs} to ${targetCrs}: ${String(error)}`, { cause: error });
    }
    return position => {
        if (position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
            throw new Error('CRS transformation requires finite x/y coordinates.');
        }
        const [x, y] = converter.forward([position[0], position[1]]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('CRS transformation produced non-finite coordinates.');
        return [x, y, ...position.slice(2)];
    };
}

/** Converts a single position; use createCoordinateTransform for batches. */
export function reprojectPosition(position: Position, sourceCrs: string, targetCrs: string): Position {
    return createCoordinateTransform(sourceCrs, targetCrs)(position);
}

/** Limits tile latitude to the Web Mercator square. Collection reprojection does not use this clamp. */
export function clampLatitude(latitude: number): number {
    return Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, latitude));
}

// Preserve the scalar tile-sampling hot path and its unwrapped world coordinates.
// Arbitrary collection conversions above use Proj4js instead.

/** Spherical Mercator northing, in meters, clamped to the tile pyramid's latitude range. */
export function latToMercatorY(latitude: number): number {
    const phi = clampLatitude(latitude) * DEG;
    return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

/** Latitude in degrees from spherical Mercator northing. */
export function mercatorYToLat(y: number): number {
    return (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / DEG;
}

function latToWorldMercatorY(latitude: number): number {
    const phi = clampLatitude(latitude) * DEG;
    const sin = Math.sin(phi);
    const ellipsoid = Math.pow((1 - ECCENTRICITY * sin) / (1 + ECCENTRICITY * sin), ECCENTRICITY / 2);
    return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2) * ellipsoid);
}

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

/** Converts [longitude, latitude] to any CRS understood by Proj4js. */
export function lonLatToCrs(crs: string, longitude: number, latitude: number): [number, number] {
    if (crs === 'EPSG:4326') return [longitude, latitude];
    // Optimizations, not restrictions: keep the existing Mercator tile hot paths unchanged.
    if (crs === 'EPSG:3395' || crs === 'EPSG:3857') return [EARTH_RADIUS * longitude * DEG,
        crs === 'EPSG:3395' ? latToWorldMercatorY(latitude) : latToMercatorY(latitude)];
    const key = `forward:${crs}`;
    let transform = geographicTransforms.get(key);
    if (!transform) { transform = createCoordinateTransform('EPSG:4326', crs); geographicTransforms.set(key, transform); }
    const [x, y] = transform([longitude, latitude]);
    return [x, y];
}

/** Converts any Proj4js CRS position to [longitude, latitude]. */
export function crsToLonLat(crs: string, x: number, y: number): [number, number] {
    if (crs === 'EPSG:4326') return [x, y];
    if (crs === 'EPSG:3395' || crs === 'EPSG:3857') return [x / EARTH_RADIUS / DEG,
        crs === 'EPSG:3395' ? worldMercatorYToLat(y) : mercatorYToLat(y)];
    const key = `inverse:${crs}`;
    let transform = geographicTransforms.get(key);
    if (!transform) { transform = createCoordinateTransform(crs, 'EPSG:4326'); geographicTransforms.set(key, transform); }
    const [longitude, latitude] = transform([x, y]);
    return [longitude, latitude];
}

/** Local map-axis scales relative to Web Mercator, including rotated/nonseparable projections. */
export function crsScaleAt(crs: string, origin: readonly [number, number]): { x: number; y: number } {
    const delta = 1e-3;
    const [lon, lat] = crsToLonLat(crs, origin[0], origin[1]);
    const base = lonLatToCrs(crs, lon, lat);
    const east = lonLatToCrs(crs, lon + delta, lat);
    const north = lonLatToCrs(crs, lon, lat + delta);
    const x = Math.hypot(east[0] - base[0], east[1] - base[1]) / (EARTH_RADIUS * delta * DEG);
    const y = Math.hypot(north[0] - base[0], north[1] - base[1]) / (latToMercatorY(lat + delta) - latToMercatorY(lat));
    if (!(x > 0) || !(y > 0) || !Number.isFinite(x + y)) throw new Error('CRS has no finite local map scale at this location.');
    return { x, y };
}

/** Samples a rectangle's footprint for nonlinear CRS conversions; results are approximate, not densified geometry. */
export function reprojectBounds(bounds: readonly [number, number, number, number], sourceCrs: string, targetCrs: string): [number, number, number, number] {
    const transform = createCoordinateTransform(sourceCrs, targetCrs);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let row = 0; row <= 8; row++) for (let column = 0; column <= 8; column++) {
        const [x, y] = transform([bounds[0] + (bounds[2] - bounds[0]) * column / 8,
            bounds[1] + (bounds[3] - bounds[1]) * row / 8]);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return [minX, minY, maxX, maxY];
}
