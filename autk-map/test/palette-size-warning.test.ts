import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';

/** The color-map fields for a named scheme, or for a custom categorical palette. */
function paletteOf(scale: ColorMapInterpolator | string[]) {
    return Array.isArray(scale) ? { type: 'categorical' as const, colors: scale } : { interpolator: scale };
}

// Run the real updateThematic without initializing DOM/WebGPU state.
// `scale` is a named scheme, or the swatches of a custom categorical palette.
function colorWith(categories: number, scale: ColorMapInterpolator | string[] = ColorMapInterpolator.CAT_TABLEAU10) {
    const names = Array.from({ length: categories }, (_, i) => `class ${i}`);
    const map = Object.create(AutkMap.prototype) as any;
    const layer = {
        layerInfo: { typeLayer: 'polygons' },
        components: names.map((_, index) => ({ featureIndex: index })),
        layerRenderInfo: { colormap: { config: { ...paletteOf(scale), domainSpec: { type: ColorMapDomainStrategy.USER, params: names } } } },
        loadThematic: vi.fn(() => true),
        updateLayerRenderInfo: vi.fn(),
        makeLayerDataDirty: vi.fn(),
    };
    map._layerManager = { searchByLayerId: () => layer };
    map._ui = { refreshLegend: vi.fn() };
    map.updateThematic('classes', {
        property: 'properties.kind',
        collection: { type: 'FeatureCollection', features: names.map((kind) => ({ type: 'Feature', geometry: null, properties: { kind } })) },
    });
    return layer;
}

describe('a categorical scale with more categories than colors', () => {
    afterEach(() => vi.restoreAllMocks());

    it('warns, naming the layer, the counts and the scheme', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const layer = colorWith(12);
        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain("Layer 'classes'");
        expect(message).toContain('12 categories');
        expect(message).toContain('10 colors');
        expect(layer.loadThematic).toHaveBeenCalledTimes(1); // the layer is still drawn
    });

    it('is silent when the scheme has enough colors', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        colorWith(10);
        colorWith(3);
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not apply to a continuous scheme', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        colorWith(30, ColorMapInterpolator.SEQ_VIRIDIS);
        expect(warn).not.toHaveBeenCalled();
    });

    it('counts the colors of a custom palette, naming it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const palette = (n: number) => Array.from({ length: n }, (_, i) => `#${(i * 17 + 16).toString(16).padStart(2, '0')}0000`);
        colorWith(14, palette(14)); // more than the default scheme's 10, but covered
        expect(warn).not.toHaveBeenCalled();
        colorWith(14, palette(12)); // two short
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('the custom palette has 12 colors');
    });
});
