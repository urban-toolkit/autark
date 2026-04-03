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
} from './types';

// Internal shape aliases kept private to this module
type SequentialDomain = [number, number];
type DivergingDomain = [number, number, number];
type CategoricalDomain = string[];

/** Default number of texels used to sample continuous colormaps. */
export const DEFAULT_COLORMAP_RESOLUTION = 256;

export class ColorMap {
    private static _domainCache = new Map<string, ResolvedDomain>();

    public static getColor(value: number, color: ColorMapInterpolator, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorRGB {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        return ColorMap.interpolatorToRgb(interpolator, value);
    }

    public static getColorMap(
        color: ColorMapInterpolator,
        res: number = DEFAULT_COLORMAP_RESOLUTION,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): ColorTEX {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const tex: number[] = [];
        for (let id = 0; id < res; id++) {
            const col = ColorMap.interpolatorToRgb(interpolator, id / (res - 1));
            tex.push(col.r, col.g, col.b, 1);
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
            result.push(ColorMap.interpolatorToRgb(interpolator, id / (res - 1)));
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

    public static computeMinMaxRange(values: number[]): [number, number] {
        return [
            values.reduce((a, b) => Math.min(a, b), Infinity),
            values.reduce((a, b) => Math.max(a, b), -Infinity),
        ];
    }

    /**
     * Normalizes raw numeric values to `[0, 1]` using the provided domain.
     *
     * For a `SequentialDomain` `[min, max]` the output is clamped linearly.
     * For a `DivergingDomain` `[min, center, max]` the output is linearly
     * mapped across the full `[min, max]` span (center is used for labels only).
     *
     * @param values Raw data values.
     * @param domain Sequential or diverging domain.
     * @returns Values remapped to `[0, 1]`.
     */
    public static normalizeValues(
        values: number[],
        domain: SequentialDomain | DivergingDomain,
    ): number[] {
        const min = domain[0];
        const max = domain[domain.length - 1] as number;
        const range = max - min;
        return values.map(v => range > 0 ? Math.max(0, Math.min(1, (v - min) / range)) : 0);
    }

    private static isDiverging(interpolator: ColorMapInterpolator): boolean {
        return interpolator === ColorMapInterpolator.DIVERGING_RED_BLUE;
    }

    private static isCategorical(interpolator: ColorMapInterpolator): boolean {
        return interpolator === ColorMapInterpolator.OBSERVABLE10;
    }

    /**
     * Resolves a numeric domain from data and color-map configuration.
     */
    public static resolveNumericDomainFromConfig(
        values: number[],
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
            const [lowerPercentile, upperPercentile] = config.domainSpec.params ?? [0.02, 0.98];
            const low = ColorMap.computePercentile(values, lowerPercentile);
            const high = ColorMap.computePercentile(values, upperPercentile);
            if (ColorMap.isDiverging(interpolator)) {
                const center = ColorMap.computePercentile(values, 0.5);
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

    /**
     * Resolves a categorical domain, using the provided one when valid or computing
     * unique categories from values otherwise.
     */
    public static resolveCategoricalDomain(
        values: string[],
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): CategoricalDomain {
        if (
            Array.isArray(domain)
            && domain.length > 0
            && domain.every(v => typeof v === 'string')
        ) {
            return domain as CategoricalDomain;
        }
        return Array.from(new Set(values));
    }

    /** Resolves a categorical domain from a color-map configuration. */
    public static resolveCategoricalDomainFromConfig(
        values: string[],
        config: ColorMapConfig,
    ): CategoricalDomain {
        if (config.domainSpec.type === ColorMapDomainStrategy.USER) {
            return config.domainSpec.params.map(v => String(v));
        }
        return ColorMap.resolveCategoricalDomain(values.map(v => String(v)));
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
        values: number[] | string[],
        config: ColorMapConfig,
    ): ResolvedDomain {
        const cacheKey = `${config.interpolator}|${JSON.stringify(config.domainSpec)}|${ColorMap.computeDataFingerprint(values)}`;
        const cached = ColorMap._domainCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let computed: ResolvedDomain;
        if (ColorMap.isCategorical(config.interpolator)) {
            computed = ColorMap.resolveCategoricalDomainFromConfig(values.map(v => String(v)), config);
        } else {
            computed = ColorMap.resolveNumericDomainFromConfig(values.map(v => Number(v)), config, config.interpolator);
        }

        ColorMap._domainCache.set(cacheKey, computed);
        return computed;
    }

    private static computeDataFingerprint(values: Array<number | string>): string {
        if (values.length === 0) {
            return 'empty';
        }

        if (typeof values[0] === 'number') {
            const nums = values as number[];
            const min = nums.reduce((a, b) => Math.min(a, b), Infinity);
            const max = nums.reduce((a, b) => Math.max(a, b), -Infinity);
            const sum = nums.reduce((a, b) => a + b, 0);
            return `n:${nums.length}:${min}:${max}:${sum}`;
        }

        const strs = values.map(v => String(v));
        return `s:${strs.length}:${strs.join('|')}`;
    }

    private static interpolatorToRgb(interpolator: (t: number) => string, value: number): ColorRGB {
        const { r, g, b } = d3_color.rgb(interpolator(value));
        return { r, g, b, alpha: 1 };
    }

    private static buildInterpolator(
        color: ColorMapInterpolator,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): (t: number) => string {
        switch (color) {
            case ColorMapInterpolator.SEQUENTIAL_REDS:
                return d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQUENTIAL_REDS])
                    .domain((domain as SequentialDomain) ?? [0, 1]);
            case ColorMapInterpolator.SEQUENTIAL_BLUES:
                return d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQUENTIAL_BLUES])
                    .domain((domain as SequentialDomain) ?? [0, 1]);
            case ColorMapInterpolator.DIVERGING_RED_BLUE:
                return d3_scale.scaleDiverging(d3_scheme[ColorMapInterpolator.DIVERGING_RED_BLUE])
                    .domain((domain as DivergingDomain) ?? [0, 0.5, 1]);
            case ColorMapInterpolator.OBSERVABLE10: {
                const scheme = d3_scheme[ColorMapInterpolator.OBSERVABLE10] as string[];
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

    private static computePercentile(values: number[], p: number): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }
}
