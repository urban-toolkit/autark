import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';

// Invoke the real layer-creation boundary without initializing DOM/WebGPU state.
function mapWithoutGpu() {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0], computeZindex: () => 1 };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    return map;
}

describe('a polygon layer that cannot be built', () => {
    afterEach(() => vi.restoreAllMocks());

    it('says which layer, how many features it had, and what to check', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const map = mapWithoutGpu();
        const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

        map.createPolygonsLayer('parks', empty, 'polygons');

        expect(map.createLayer).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
        const message = String(error.mock.calls[0][0]);
        expect(message).toContain('Layer "parks"');
        expect(message).toContain('0 feature(s)');
        expect(message).toContain('clipped to nothing by the workspace extent');
    });

    it('names the layer for features that are not polygonal', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const map = mapWithoutGpu();
        const points: FeatureCollection = {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
        };

        map.createPolygonsLayer('stops', points, 'polygons');

        expect(String(error.mock.calls[0][0])).toContain('Layer "stops"');
        expect(String(error.mock.calls[0][0])).toContain('1 feature(s)');
    });
});
