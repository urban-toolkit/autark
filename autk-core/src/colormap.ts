import * as d3_color from 'd3-color';
import * as d3_format from 'd3-format';
import * as d3_scale from 'd3-scale';
import * as d3_scheme from 'd3-scale-chromatic';

import {
    ColorMapDomainStrategy,
    ColorMapConfig,
    ColorHEX,
    ColorMapInterpolator,
    ResolvedDomain,
    ColorRGB,
    ColorTEX,
} from './types-colormap';

import type { TypedArray } from './types-utils';

// Internal shape aliases kept private to this module
type SequentialDomain = [number, number];
type DivergingDomain = [number, number, number];
type CategoricalDomain = string[];

/** Default number of texels used to sample continuous colormaps. */
export const DEFAULT_COLORMAP_RESOLUTION = 256;

export class ColorMap {
    public static getColor(value: number, color: ColorMapInterpolator, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorRGB {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const { r, g, b } = d3_color.rgb(interpolator(value));
        return { r, g, b, alpha: 1 };
    }

    public static getColorMap(
        color: ColorMapInterpolator,
        res: number = DEFAULT_COLORMAP_RESOLUTION,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): ColorTEX {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const tex: number[] = [];
        for (let id = 0; id < res; id++) {
            const { r, g, b } = d3_color.rgb(interpolator(id / (res - 1)));
            tex.push(r, g, b, 1);
        }
        return tex;
    }

    public static getColorArray(
        color: ColorMapInterpolator,
        res: number = DEFAULT_COLORMAP_RESOLUTION,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): ColorRGB[] {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const result: ColorRGB[] = [];
        for (let id = 0; id < res; id++) {
            const { r, g, b } = d3_color.rgb(interpolator(id / (res - 1)));
            result.push({ r, g, b, alpha: 1 });
        }
        return result;
    }

    public static rgbToHex(color: ColorRGB): ColorHEX {
        const hex = d3_color.rgb(color.r, color.g, color.b, 1).formatHex();
        return <ColorHEX>hex;
    }

    public static hexToRgb(color: ColorHEX): ColorRGB {
        const rgb = d3_color.rgb(color);
        return { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1.0 };
    }

    public static computeMinMaxRange(values: number[] | TypedArray): [number, number] {
        if (values.length === 0) return [0, 0];
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v < min) min = v;
            if (v > max) max = v;
        }
        return [min, max];
    }

    private static isDiverging(interpolator: ColorMapInterpolator): boolean {
        return interpolator === ColorMapInterpolator.DIV_RED_BLUE
            || interpolator === ColorMapInterpolator.DIV_SPECTRAL;
    }

    /**
     * Resolves a numeric domain from data and color-map configuration.
     */
    private static resolveNumericDomainFromConfig(
        values: number[] | TypedArray,
        config: ColorMapConfig,
        interpolator: ColorMapInterpolator,
    ): SequentialDomain | DivergingDomain {
        const mode = config.domainSpec.type;

        if (mode === ColorMapDomainStrategy.USER) {
            const params = config.domainSpec.params;
            if (!params.length || params.some(v => typeof v !== 'number')) {
                throw new Error('ColorMap USER domain for numeric interpolators must be number[].');
            }
            const numeric = params as number[];
            if (ColorMap.isDiverging(interpolator)) {
                if (numeric.length === 3) return [numeric[0], numeric[1], numeric[2]];
                if (numeric.length === 2) {
                    const center = (numeric[0] + numeric[1]) / 2;
                    return [numeric[0], center, numeric[1]];
                }
                throw new Error('Diverging USER domain must have 2 or 3 numeric values.');
            }
            if (numeric.length < 2) {
                throw new Error('Sequential USER domain must have at least 2 numeric values.');
            }
            return [numeric[0], numeric[numeric.length - 1]];
        }

        if (mode === ColorMapDomainStrategy.PERCENTILE) {
            const [lowerPercentile, upperPercentile] = config.domainSpec.params ?? [2, 98];
            const low = ColorMap.computePercentile(values, lowerPercentile / 100);
            const high = ColorMap.computePercentile(values, upperPercentile / 100);
            if (ColorMap.isDiverging(interpolator)) {
                const center = ColorMap.computePercentile(values, 50 / 100);
                return [low, center, high];
            }
            return [low, high];
        }

        const [min, max] = ColorMap.computeMinMaxRange(values);
        if (ColorMap.isDiverging(interpolator)) {
            const center = (min + max) / 2;
            return [min, center, max];
        }
        return [min, max];
    }

    /** Resolves a categorical domain from a color-map configuration. */
    private static resolveCategoricalDomainFromConfig(
        values: string[],
        config: ColorMapConfig,
    ): CategoricalDomain {
        if (config.domainSpec.type === ColorMapDomainStrategy.USER) {
            return config.domainSpec.params.map(v => String(v));
        }
        return Array.from(new Set(values.map(v => String(v))));
    }

    /**
     * Derives human-readable legend labels from a domain.
     *
     * - `SequentialDomain` → `["min", "max"]`
     * - `DivergingDomain`  → `["min", "center", "max"]`
     * - `CategoricalDomain` → the category strings as-is
     *
     * @param domain Any supported color-scale domain.
     * @returns Ordered label strings suitable for a legend.
     */
    public static computeLabels(
        domain: ResolvedDomain,
    ): string[] {
        if (typeof domain[0] === 'string') return domain as string[];

        const numeric = domain as number[];
        const maxAbs = numeric.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0);
        const formatter = maxAbs >= 1_000_000
            ? d3_format.format('.3s')
            : maxAbs >= 1
                ? d3_format.format(',.2f')
                : d3_format.format('.3~g');

        return numeric.map(v => formatter(v));
    }

    public static resolveDomainFromData(
        values: number[] | string[] | TypedArray,
        config: ColorMapConfig,
    ): ResolvedDomain {
        const isCategorical = config.interpolator.startsWith('scheme')
            || (config.domainSpec.type === ColorMapDomainStrategy.USER && config.domainSpec.params.some(v => typeof v === 'string'))
            || (!ArrayBuffer.isView(values) && (values as Array<number|string>).some(v => typeof v === 'string' && isNaN(Number(v))));

        if (isCategorical) {
            return ColorMap.resolveCategoricalDomainFromConfig(values as string[], config);
        } else {
            return ColorMap.resolveNumericDomainFromConfig(values as number[] | TypedArray, config, config.interpolator);
        }
    }

    private static buildInterpolator(
        color: ColorMapInterpolator,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): (t: number) => string {
        switch (color) {
            case ColorMapInterpolator.SEQ_REDS:
                return d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQ_REDS])
                    .domain((domain as SequentialDomain) ?? [0, 1]);
            case ColorMapInterpolator.SEQ_BLUES:
                return d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQ_BLUES])
                    .domain((domain as SequentialDomain) ?? [0, 1]);
            case ColorMapInterpolator.DIV_RED_BLUE:
                return d3_scale.scaleDiverging(d3_scheme[ColorMapInterpolator.DIV_RED_BLUE])
                    .domain((domain as DivergingDomain) ?? [0, 0.5, 1]);
            case ColorMapInterpolator.DIV_SPECTRAL:
                return d3_scale.scaleDiverging(d3_scheme[ColorMapInterpolator.DIV_SPECTRAL])
                    .domain((domain as DivergingDomain) ?? [0, 0.5, 1]);
            case ColorMapInterpolator.CAT_OBSERVABLE10: {
                const scheme = d3_scheme[ColorMapInterpolator.CAT_OBSERVABLE10] as string[];
                const n = domain?.length ?? scheme.length;
                return (t: number) => {
                    const idx = Math.min(Math.round(t * (n - 1)), scheme.length - 1);
                    return scheme[idx];
                };
            }
            case ColorMapInterpolator.CAT_PAIRED: {
                const scheme = d3_scheme[ColorMapInterpolator.CAT_PAIRED] as string[];
                const n = domain?.length ?? scheme.length;
                return (t: number) => {
                    const idx = Math.min(Math.round(t * (n - 1)), scheme.length - 1);
                    return scheme[idx];
                };
            }
            default:
                throw new Error(`Unknown ColorMapInterpolator: ${color}`);
        }
    }

    private static computePercentile(values: number[] | TypedArray, p: number): number {
        if (values.length === 0) return 0;
        const sorted = (ArrayBuffer.isView(values) ? new Float32Array(values) : [...values]).sort((a, b) => a - b);
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }
}
