import { describe, expect, it } from 'vitest';
import { initialTileView } from '../src/tile-view';
import { EARTH_RADIUS } from '../src/tile-projection';

const center = { latitude: 40, longitude: -74 };
const fovy = Math.PI / 4;

describe('initial geographic tile views', () => {
    it('uses Web Mercator horizontal pixel scale and halves the distance for each zoom level', () => {
        const view = initialTileView(center, 12, 'EPSG:3395', 600, fovy, 256);
        const expected = 2 * Math.PI * EARTH_RADIUS / (256 * 2 ** 12) * 600 / (2 * Math.tan(fovy / 2));
        expect(view.distance).toBeCloseTo(expected, 8);
        expect(initialTileView(center, 13, 'EPSG:3395', 600, fovy, 256).distance).toBeCloseTo(view.distance / 2, 8);
        expect(initialTileView(center, 12.5, 'EPSG:3395', 600, fovy, 256).distance).toBeCloseTo(view.distance / Math.sqrt(2), 8);
        expect(view.point[0]).toBeCloseTo(-8237642.318702244, 5);
        expect(view.near).toBe(1);
    });

    it('supports geographic-degree views and extreme zoom without clipping the ground', () => {
        for (const zoom of [0, 12, 30]) {
            const view = initialTileView(center, zoom, 'EPSG:4326', 600, fovy, 256);
            expect(view.point).toEqual([-74, 40]);
            expect(view.near).toBeGreaterThan(0);
            expect(view.near).toBeLessThan(view.distance);
            expect(view.far).toBeGreaterThan(view.distance);
        }
    });

    it.each([-1, 31, NaN, Infinity])('rejects invalid zoom %s', zoom => {
        expect(() => initialTileView(center, zoom, 'EPSG:3395', 600, fovy, 256)).toThrow(/zoom/);
    });
});
