import { describe, expect, it } from 'vitest';

import { ColorMap, ColorMapDomainStrategy, ColorMapInterpolator } from '../src';
import type { ColorHEX } from '../src';

const PALETTE: ColorHEX[] = ['#ff0000', '#00ff00', '#0000ff'];
const categorical = { type: 'categorical', colors: PALETTE } as const;
const hexOf = (color: { r: number; g: number; b: number }) => ColorMap.rgbToHex({ ...color, alpha: 1 });

describe('categorical colors given explicitly', () => {
    const domain = ['a', 'b', 'c'];

    it('samples the given colors, in domain order, instead of the scheme', () => {
        const colors = ColorMap.getColorArray(categorical, 3, domain).map(hexOf);
        expect(colors).toEqual(PALETTE);
    });

    it('lays the colors out in a GPU texture', () => {
        const texture = ColorMap.getColorMap(categorical, 256, domain);
        expect(texture.slice(0, 4)).toEqual([255, 0, 0, 1]);
        expect(texture.slice(255 * 4, 255 * 4 + 4)).toEqual([0, 0, 255, 1]);
    });

    it('gives a category past the last color the last color', () => {
        const colorOf = ColorMap.getColorFunction(categorical, ['a', 'b', 'c', 'd', 'e']);
        expect(hexOf(colorOf(1))).toBe('#0000ff');
    });

    it('reports the number of given colors as the scheme size', () => {
        expect(ColorMap.getCategoricalSchemeSize(categorical)).toBe(3);
        expect(ColorMap.getCategoricalSchemeSize(ColorMapInterpolator.CAT_TABLEAU10)).toBe(10);
    });

    it('keeps the named scheme when no colors are given', () => {
        expect(ColorMap.getColorArray(ColorMapInterpolator.CAT_TABLEAU10, 3, domain).map(hexOf)).not.toEqual(PALETTE);
    });

    it('accepts a custom categorical palette without a named interpolator', () => {
        const palette = { type: 'categorical', colors: PALETTE } as const;
        expect(ColorMap.resolveDomainFromData([20, 10, 20], { ...palette, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } }))
            .toEqual(['20', '10']);
        expect(ColorMap.getColorArray(palette, 3, domain).map(hexOf)).toEqual(PALETTE);
    });

    it('interpolates sequential stops across a fixed domain', () => {
        const palette = { type: 'sequential', colors: PALETTE } as const;
        const colorOf = ColorMap.getColorFunction(palette, [0, 100]);
        expect([-10, 25, 50, 100, 110].map(value => hexOf(colorOf(value))))
            .toEqual(['#ff0000', '#808000', '#00ff00', '#0000ff', '#0000ff']);
    });

    it('samples the same asymmetric diverging ramp for values and display', () => {
        const palette = { type: 'diverging', colors: PALETTE } as const;
        const domain: [-10, 0, 40] = [-10, 0, 40];
        const colorOf = ColorMap.getColorFunction(palette, domain);
        expect([-10, 0, 40].map(value => hexOf(colorOf(value)))).toEqual(PALETTE);
        const displayDomain = ColorMap.getSamplingDomain(palette, domain);
        expect(ColorMap.getColorArray(palette, 6, displayDomain)[1]).toEqual(colorOf(0));
        expect(ColorMap.getColorMap(palette, 6, displayDomain).slice(4, 8)).toEqual([0, 255, 0, 1]);
    });
});
