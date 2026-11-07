import { describe, expect, it } from 'vitest';

import { ColorMap, ColorMapInterpolator } from '../src';
import type { ColorHEX } from '../src';

const PALETTE: ColorHEX[] = ['#ff0000', '#00ff00', '#0000ff'];
const hexOf = (color: { r: number; g: number; b: number }) => ColorMap.rgbToHex({ ...color, alpha: 1 });

describe('categorical colors given explicitly', () => {
    const domain = ['a', 'b', 'c'];

    it('samples the given colors, in domain order, instead of the scheme', () => {
        const colors = ColorMap.getColorArray(ColorMapInterpolator.CAT_TABLEAU10, 3, domain, PALETTE).map(hexOf);
        expect(colors).toEqual(PALETTE);
    });

    it('lays the colors out in a GPU texture', () => {
        const texture = ColorMap.getColorMap(ColorMapInterpolator.CAT_TABLEAU10, 256, domain, PALETTE);
        expect(texture.slice(0, 4)).toEqual([255, 0, 0, 1]);
        expect(texture.slice(255 * 4, 255 * 4 + 4)).toEqual([0, 0, 255, 1]);
    });

    it('gives a category past the last color the last color', () => {
        const colorOf = ColorMap.getColorFunction(ColorMapInterpolator.CAT_TABLEAU10, ['a', 'b', 'c', 'd', 'e'], PALETTE);
        expect(hexOf(colorOf(1))).toBe('#0000ff');
    });

    it('reports the number of given colors as the scheme size', () => {
        expect(ColorMap.getCategoricalSchemeSize(ColorMapInterpolator.CAT_TABLEAU10, PALETTE)).toBe(3);
        expect(ColorMap.getCategoricalSchemeSize(ColorMapInterpolator.CAT_TABLEAU10)).toBe(10);
    });

    it('keeps the named scheme when no colors are given or the interpolator is not categorical', () => {
        const named = ColorMap.getColorArray(ColorMapInterpolator.CAT_TABLEAU10, 3, domain).map(hexOf);
        expect(named).not.toEqual(PALETTE);
        expect(ColorMap.getColor(0.5, ColorMapInterpolator.SEQ_VIRIDIS, undefined, PALETTE))
            .toEqual(ColorMap.getColor(0.5, ColorMapInterpolator.SEQ_VIRIDIS));
    });
});
