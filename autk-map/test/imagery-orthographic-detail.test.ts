import { describe, expect, it } from 'vitest';
import { Camera } from '@urban-toolkit/autk-core';
import { selectAdaptiveTiles } from '../src/tile-selection';
import type { TileSelection } from '../src/tile-selection';
import { crsToLonLat, lonLatToCrs } from '../src/tile-projection';
import { lonLatToTileCoord, tileLonLatBounds } from '../src/tile-index';
import { resolveTileSource } from '../src/tile-source';

const SOURCE = resolveTileSource({ urlTemplate: 'https://t/{z}/{x}/{y}', attribution: 'a', maxZoom: 19 });
const CRS = 'EPSG:3857';
const ORIGIN = lonLatToCrs(CRS, -43.2, -22.9);

/** A camera 2000 units above the origin, on a 1600 by 1000 canvas, tilted one radian from straight down, made orthographic. */
function tiltedOrthographic(): Camera {
    const camera = new Camera({ eye: [0, 0, 2000], lookAt: [0, 0, 0], up: [0, 1, 0] });
    camera.pitch(-1);
    camera.resize(1600, 1000);
    camera.setProjection('orthographic');
    camera.update();
    return camera;
}

/** The ground the view draws: the box around its corners, and the points under a grid of screen positions. */
function groundOf(camera: Camera) {
    const at = (x: number, y: number) => camera.getGroundPoint(x, y, camera.getFar());
    const corners = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const steps = [0.05, 0.25, 0.5, 0.75, 0.95];
    return {
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        points: steps.flatMap((x) => steps.map((y) => at(x, y))),
    };
}

/** One zoom for every tile, every tile over the view's box, and every point of the view in exactly one tile. */
function expectOneZoomOver(selection: TileSelection, { box: [minX, minY, maxX, maxY], points }: ReturnType<typeof groundOf>) {
    expect(new Set(selection.tiles.map((tile) => tile.z))).toEqual(new Set([selection.z]));
    for (const tile of selection.tiles) {
        const { west, south, east, north } = tileLonLatBounds(tile);
        const [x0, y0] = lonLatToCrs(CRS, west, south);
        const [x1, y1] = lonLatToCrs(CRS, east, north);
        expect(x0 - ORIGIN[0] < maxX && x1 - ORIGIN[0] > minX && y0 - ORIGIN[1] < maxY && y1 - ORIGIN[1] > minY).toBe(true);
    }
    for (const [x, y] of points) {
        const [lon, lat] = crsToLonLat(CRS, x + ORIGIN[0], y + ORIGIN[1]);
        expect(selection.tiles.filter((tile) => {
            const coord = lonLatToTileCoord(lon, lat, tile.z);
            return Math.floor(coord.x) === tile.x && Math.floor(coord.y) === tile.y;
        })).toHaveLength(1);
    }
}

describe('imagery detail in a tilted orthographic view', () => {
    it('gives a flat map one zoom over all of its ground, as the view draws all of it at one scale', () => {
        const camera = tiltedOrthographic();
        expectOneZoomOver(selectAdaptiveTiles({ camera, origin: ORIGIN, crs: CRS }, SOURCE)!, groundOf(camera));
    });

    it('gives the terrain overlay one zoom over all of the ground the view draws on it', () => {
        const camera = tiltedOrthographic();
        const ground = groundOf(camera);
        const [minX, minY, maxX, maxY] = ground.box;
        const overlay = new Camera();
        overlay.setOrthographicBounds(minX, maxX, minY, maxY);
        overlay.resize(2048, 2048);
        const selection = selectAdaptiveTiles({ camera: overlay, origin: ORIGIN, crs: CRS }, SOURCE, {}, [],
            { camera, viewport: [3200, 2000], heightAt: () => 0 })!;
        expectOneZoomOver(selection, ground);
    });
});
