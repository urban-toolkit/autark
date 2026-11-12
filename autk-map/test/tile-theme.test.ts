import { describe, expect, it } from 'vitest';
import { themeTilePixels } from '../src/tile-theme';

describe('raster tile themes', () => {
    it('leaves original imagery byte-for-byte unchanged', () => {
        const pixels = new Uint8ClampedArray([72, 133, 210, 128, 255, 0, 33, 0]);
        const original = pixels.slice();
        themeTilePixels(pixels, 'original');
        expect(pixels).toEqual(original);
    });

    it.each(['light', 'dark'] as const)('%s preserves transparency and suppresses saturated colors', theme => {
        const pixels = new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 0, 0, 0, 255, 255]);
        themeTilePixels(pixels, theme);
        expect([pixels[3], pixels[7], pixels[11]]).toEqual([128, 0, 255]);
        for (let i = 0; i < pixels.length; i += 4) {
            const channels = [...pixels.slice(i, i + 3)];
            expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(35);
        }
    });

    it('retains text contrast and reverses brightness for dark mode', () => {
        const samples = [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255];
        const light = new Uint8ClampedArray(samples), dark = new Uint8ClampedArray(samples);
        themeTilePixels(light, 'light'); themeTilePixels(dark, 'dark');
        expect(light[0]).toBeLessThan(light[4]!); expect(light[4]).toBeLessThan(light[8]!);
        expect(dark[0]).toBeGreaterThan(dark[4]!); expect(dark[4]).toBeGreaterThan(dark[8]!);
        expect(dark[8]).toBeLessThan(50); expect(light[8]).toBeGreaterThan(240);
    });
});
