import { describe, expect, it } from 'vitest';
import { resolveElevationValidation } from '@urban-toolkit/autk-core';
import { DemSampler } from '../src/dem-sample';
import type { DemTile } from '../src/dem-decode';
import type { TileIndex } from '../src/tile-index';

const quality = resolveElevationValidation()!;
const size = 16, zoom = 20, origin = 500000 * size;
function tiles(surface: (z: number, i: number, j: number) => number, available: (tile: TileIndex) => boolean = () => true) {
    const cache = new Map<string, DemTile>();
    return (tile: TileIndex) => {
        if (!available(tile)) return undefined;
        const key = `${tile.z}/${tile.x}/${tile.y}`;
        let value = cache.get(key);
        if (!value) {
            const heights = new Float32Array(size * size);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = surface(tile.z, tile.x * size + x, tile.y * size + y);
            value = { size, heights, min: Math.min(...heights), max: Math.max(...heights) }; cache.set(key, value);
        }
        return value;
    };
}

describe('cross-tile, multiresolution elevation validation', () => {
    for (const sign of [-1, 1]) for (const [name, start] of [['interior', 6], ['tile edge', 15], ['tile corner', 16]] as const) {
        it(`repairs ${sign < 0 ? 'pits' : 'spikes'} at a ${name}`, () => {
            const i = origin + start, j = origin + start;
            const lookup = tiles((z, x, y) => z === zoom && x === i && y === j ? sign * 3000 : -430);
            expect(new DemSampler(lookup, size).sample(zoom, i + 0.5, j + 0.5, zoom - 1)).toBe(sign * 3000);
            const sampler = new DemSampler(lookup, size, quality);
            expect(sampler.sample(zoom, i + 0.5, j + 0.5, zoom - 1)).toBe(-430);
            expect(sampler.validationStats).toMatchObject({ corrected: 1, rejected: 1 });
        });
    }
    it('repairs small clusters on both sides of a tile boundary', () => {
        const lookup = tiles((z, x, y) => z === zoom && x >= origin + 15 && x <= origin + 17 && y >= origin + 15 && y <= origin + 17 ? -3000 : 20);
        const sampler = new DemSampler(lookup, size, quality);
        for (let y = 15; y <= 17; y++) for (let x = 15; x <= 17; x++) expect(sampler.sample(zoom, origin + x + 0.5, origin + y + 0.5, zoom - 1)).toBe(20);
        expect(sampler.validationStats!.corrected).toBe(9);
    });
    it('uses the same neighbor rules across the longitude wrap', () => {
        const lookup = tiles((z, x, y) => z === zoom && x === 0 && y === origin + 7 ? -3000 : -50);
        expect(new DemSampler(lookup, size, quality).sample(zoom, 0.5, origin + 7.5, zoom - 1)).toBe(-50);
    });
    it('handles the clamped northern world edge without inventing a positive height', () => {
        const lookup = tiles((z, x, y) => z === zoom && x === origin + 7 && y === 0 ? -3000 : -50);
        expect(new DemSampler(lookup, size, quality).sample(zoom, origin + 7.5, 0.5, zoom - 1)).toBe(-50);
    });
    it('does not replace supported narrow mountain peaks with a local median', () => {
        const i = origin + 7, j = origin + 7;
        const lookup = tiles((z, x, y) => z < zoom ? 900 : x === i && y === j ? 1000 : 0);
        expect(new DemSampler(lookup, size, quality).sample(zoom, i + 0.5, j + 0.5, zoom - 1)).toBe(1000);
    });
    it('validates a corrupt coarse reference before using a cleaner ancestor', () => {
        const lookup = tiles((z, x, y) => {
            if (z === zoom && x === origin + 7 && y === origin + 7) return -3000;
            if (z === zoom - 1 && x >= origin / 2 + 2 && x <= origin / 2 + 4 && y >= origin / 2 + 2 && y <= origin / 2 + 4) return -2000;
            return 5;
        });
        expect(new DemSampler(lookup, size, quality).sample(zoom, origin + 7.5, origin + 7.5, zoom - 2)).toBe(5);
    });
    it('handles missing neighbors without changing the result when their tiles arrive', () => {
        const surface = (z: number, x: number, y: number) => z === zoom && x === origin + 15 && y === origin + 15 ? 3000 : -20;
        const before = tiles(surface, tile => tile.z < zoom || tile.x === 500000 && tile.y === 500000);
        const after = tiles(surface);
        expect(new DemSampler(before, size, quality).sample(zoom, origin + 15.5, origin + 15.5, zoom - 1)).toBe(-20);
        expect(new DemSampler(after, size, quality).sample(zoom, origin + 15.5, origin + 15.5, zoom - 1)).toBe(-20);
    });
});
