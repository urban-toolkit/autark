import type { LoadTilesParams } from './api';
import { EARTH_RADIUS, WEB_MERCATOR_MAX_LAT, lonLatToCrs, type TileCrs } from './tile-projection';
import { MAX_TILE_ZOOM } from './tile-index';

/** Convert a named geographic center and Web Mercator zoom into a projected perspective view. */
export function initialTileView(
    center: NonNullable<LoadTilesParams['center']>, zoom: number, crs: TileCrs,
    cssHeight: number, fovy: number, tileSize: number,
) {
    if (!center || !Number.isFinite(center.longitude) || !Number.isFinite(center.latitude)
        || Math.abs(center.longitude) > 180 || Math.abs(center.latitude) > WEB_MERCATOR_MAX_LAT) {
        throw new Error('Tile center requires finite longitude in [-180, 180] and latitude within the Web Mercator limits.');
    }
    if (!Number.isFinite(zoom) || zoom < 0 || zoom > MAX_TILE_ZOOM) {
        throw new Error(`Tile zoom must be between 0 and ${MAX_TILE_ZOOM}.`);
    }
    if (!(cssHeight > 0) || !Number.isFinite(cssHeight)) throw new Error('Tile view requires a nonempty viewport.');
    const point = lonLatToCrs(crs, center.longitude, center.latitude);
    const worldWidth = crs === 'EPSG:4326' ? 360 : 2 * Math.PI * EARTH_RADIUS;
    const unitsPerPixel = worldWidth / (tileSize * 2 ** zoom);
    const distance = unitsPerPixel * cssHeight / (2 * Math.tan(fovy / 2));
    return { point, distance, near: Math.min(1, distance / 1000), far: Math.max(500000, distance * 2) };
}
