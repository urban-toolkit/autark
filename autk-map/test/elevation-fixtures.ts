import fixture from './fixtures/elevation-regions.json';
import { composeWindow, crsScaleAt, planWindow } from '../src/height-window';
import { lonLatToCrs } from '../src/tile-projection';
import type { DemTile } from '../src/dem-decode';
import type { TileIndex } from '../src/tile-index';
import type { HeightSource } from '../src/height-source';
import { resolveElevationValidation } from '@urban-toolkit/autk-core';

export const elevationRegions = fixture.sites;
export type ElevationRegion = typeof elevationRegions[number];

export function regionLookup(region: ElevationRegion) {
    const cache = new Map<string, DemTile>();
    for (const patch of region.patches) {
        const heights = new Float32Array(256 * 256).fill(NaN);
        for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) heights[(patch.top + y) * 256 + patch.left + x] = patch.values[y * patch.width + x]!;
        cache.set(`${patch.z}/${patch.x}/${patch.y}`, { size: 256, heights, min: Math.min(...patch.values), max: Math.max(...patch.values) });
    }
    return (tile: TileIndex) => cache.get(`${tile.z}/${tile.x}/${tile.y}`);
}

/** Both paths use actual reprojection, window composition, and shared height lookup. */
export function regionHeightSource(region: ElevationRegion, validate: boolean): HeightSource {
    const origin = lonLatToCrs('EPSG:3857', region.longitude, region.latitude) as [number, number];
    const lookup = regionLookup(region);
    const windows = [14, 13].map(zoom => composeWindow(planWindow({
        crs: 'EPSG:3857', origin, scale: crsScaleAt('EPSG:3857', origin), zoom,
        tileSize: 256, size: 64, centre: [0, 0], padding: validate ? 6 : 1,
    }), lookup, { minZoom: 13, validation: validate ? resolveElevationValidation() : undefined }));
    return { levels: windows.map(window => window.level), bounds: [-1e4, -1e4, 1e4, 1e4],
        minHeight: Math.min(...windows.map(window => window.min)), maxHeight: Math.max(...windows.map(window => window.max)),
        version: 1, levelVersions: [1, 1] };
}
