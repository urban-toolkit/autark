/**
 * @module ColorMap
 * A comprehensive color management utility that leverages d3-scale and d3-scale-chromatic.
 * It handles resolving color domains from data, generating color textures for WebGPU,
 * creating legend labels, and converting between color formats.
 */
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

import type { TypedArray } from './types-buffer';

// Internal shape aliases kept private to this module
/** Two-point numeric domain used by sequential color interpolators. */
type SequentialDomain = [number, number];
/** Three-point numeric domain used by diverging color interpolators. */
type DivergingDomain = [number, number, number];
/** Ordered set of category labels used by categorical color schemes. */
type CategoricalDomain = string[];

/** Default number of texels used to sample continuous colormaps. */
export const DEFAULT_COLORMAP_RESOLUTION = 256;

/** Interpolators backed by discrete categorical color schemes. */
const CATEGORICAL_INTERPOLATORS = new Set<ColorMapInterpolator>([
    ColorMapInterpolator.CAT_ACCENT,
    ColorMapInterpolator.CAT_DARK2,
    ColorMapInterpolator.CAT_CATEGORY10,
    ColorMapInterpolator.CAT_OBSERVABLE10,
    ColorMapInterpolator.CAT_PAIRED,
    ColorMapInterpolator.CAT_PASTEL1,
    ColorMapInterpolator.CAT_PASTEL2,
    ColorMapInterpolator.CAT_SET1,
    ColorMapInterpolator.CAT_SET2,
    ColorMapInterpolator.CAT_SET3,
    ColorMapInterpolator.CAT_TABLEAU10,
]);

/** Interpolators backed by diverging continuous color scales. */
const DIVERGING_INTERPOLATORS = new Set<ColorMapInterpolator>([
    ColorMapInterpolator.DIV_BR_BG,
    ColorMapInterpolator.DIV_PR_GN,
    ColorMapInterpolator.DIV_PI_YG,
    ColorMapInterpolator.DIV_PU_OR,
    ColorMapInterpolator.DIV_RED_BLUE,
    ColorMapInterpolator.DIV_RED_GREY,
    ColorMapInterpolator.DIV_RED_YELLOW_BLUE,
    ColorMapInterpolator.DIV_RED_YELLOW_GREEN,
    ColorMapInterpolator.DIV_SPECTRAL,
]);

/**
 * Color utility for sampling interpolators, resolving domains, and formatting
 * values for legends and GPU color textures.
 */
export class ColorMap {
    /**
     * Samples a color interpolator at a normalized value.
     *
     * @param value - Normalized sample position within the interpolator domain.
     * @param color - Interpolator identifier to sample.
     * @param domain - Optional explicit domain used when building the interpolator.
     * @returns Sampled color in RGBA object form.
     */
    public static getColor(value: number, color: ColorMapInterpolator, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorRGB {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const { r, g, b } = d3_color.rgb(interpolator(value));
        return { r, g, b, alpha: 1 };
    }

    /**
     * Builds a flat RGBA texture array sampled from a color interpolator.
     *
     * @param color - Interpolator identifier to sample.
     * @param res - Number of texels to generate.
     * @param domain - Optional explicit domain used when building the interpolator.
     * @returns Flat RGBA texture values suitable for GPU upload.
     */
    public static getColorMap(
        color: ColorMapInterpolator,
        res: number = DEFAULT_COLORMAP_RESOLUTION,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): ColorTEX {
        if (res <= 0) { return []; }
        if (res === 1) {
            const { r, g, b } = d3_color.rgb(ColorMap.buildInterpolator(color, domain)(0.5));
            return [r, g, b, 1];
        }

        const interpolator = ColorMap.buildInterpolator(color, domain);
        const tex: number[] = [];
        for (let id = 0; id < res; id++) {
            const { r, g, b } = d3_color.rgb(interpolator(id / (res - 1)));
            tex.push(r, g, b, 1);
        }
        return tex;
    }

    /**
     * Builds an array of sampled RGBA color objects from a color interpolator.
     *
     * @param color - Interpolator identifier to sample.
     * @param res - Number of samples to generate.
     * @param domain - Optional explicit domain used when building the interpolator.
     * @returns Array of sampled RGBA color objects.
     */
    public static getColorArray(
        color: ColorMapInterpolator,
        res: number = DEFAULT_COLORMAP_RESOLUTION,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): ColorRGB[] {
        if (res <= 0) { return []; }
        if (res === 1) {
            const { r, g, b } = d3_color.rgb(ColorMap.buildInterpolator(color, domain)(0.5));
            return [{ r, g, b, alpha: 1 }];
        }

        const interpolator = ColorMap.buildInterpolator(color, domain);
        const result: ColorRGB[] = [];
        for (let id = 0; id < res; id++) {
            const { r, g, b } = d3_color.rgb(interpolator(id / (res - 1)));
            result.push({ r, g, b, alpha: 1 });
        }
        return result;
    }

    /**
     * Converts an RGBA color object into a hex color string.
     *
     * @param color - RGB color to convert.
     * @returns Hexadecimal color string.
     */
    public static rgbToHex(color: ColorRGB): ColorHEX {
        const hex = d3_color.rgb(color.r, color.g, color.b, 1).formatHex();
        return <ColorHEX>hex;
    }

    /**
     * Converts a hex color string into an RGBA color object.
     *
     * @param color - Hexadecimal color string to convert.
     * @returns RGBA color object with alpha fixed to `1`.
     */
    public static hexToRgb(color: ColorHEX): ColorRGB {
        const rgb = d3_color.rgb(color);
        return { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1.0 };
    }

    /**
     * Computes the numeric minimum and maximum of a value array.
     *
     * @param values - Numeric values to inspect.
     * @returns Two-element tuple `[min, max]`, or `[0, 0]` for empty input.
     */
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

    /**
     * Returns true when an interpolator uses a discrete categorical scheme.
     *
     * @param interpolator - Interpolator identifier to classify.
     * @returns `true` for categorical schemes, otherwise `false`.
     */
    public static isCategorical(interpolator: ColorMapInterpolator): boolean {
        return CATEGORICAL_INTERPOLATORS.has(interpolator);
    }
    
    /**
     * Returns true when an interpolator uses a diverging continuous scale.
     *
     * @param interpolator - Interpolator identifier to classify.
     * @returns `true` for diverging interpolators, otherwise `false`.
     */
    private static isDiverging(interpolator: ColorMapInterpolator): boolean {
        return DIVERGING_INTERPOLATORS.has(interpolator);
    }

    /**
     * Returns the number of colors exposed by a categorical color scheme.
     *
     * @param interpolator - Interpolator identifier to inspect.
     * @returns Scheme size for categorical interpolators, or `null` otherwise.
     */
    public static getCategoricalSchemeSize(interpolator: ColorMapInterpolator): number | null {
        if (!ColorMap.isCategorical(interpolator)) return null;
        return (d3_scheme[interpolator] as string[]).length;
    }


    /**
     * Resolves a numeric domain from data and color-map configuration.
     *
     * @param values - Numeric input values used to derive the domain.
     * @param config - Color-map configuration controlling the domain strategy.
     * @param interpolator - Interpolator used to decide sequential vs diverging behavior.
     * @returns Resolved sequential or diverging numeric domain.
     */
    private static resolveNumericDomainFromConfig(
        values: number[] | TypedArray,
        config: ColorMapConfig,
        interpolator: ColorMapInterpolator,
    ): SequentialDomain | DivergingDomain {
        const mode = config.domainSpec.type;

        if (mode === ColorMapDomainStrategy.USER) {
            const params = config.domainSpec.params;
            if (!params.length || params.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
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

        const finiteValues = (ArrayBuffer.isView(values) ? Array.from(values) : values)
            .filter((value) => Number.isFinite(value));

        if (finiteValues.length === 0) {
            return ColorMap.isDiverging(interpolator) ? [0, 0, 0] : [0, 0];
        }

        if (mode === ColorMapDomainStrategy.PERCENTILE) {
            const [lowerPercentile, upperPercentile] = config.domainSpec.params ?? [2, 98];
            const low = ColorMap.computePercentile(finiteValues, lowerPercentile / 100);
            const high = ColorMap.computePercentile(finiteValues, upperPercentile / 100);
            if (ColorMap.isDiverging(interpolator)) {
                const center = ColorMap.computePercentile(finiteValues, 50 / 100);
                return [low, center, high];
            }
            return [low, high];
        }

        const [min, max] = ColorMap.computeMinMaxRange(finiteValues);
        if (ColorMap.isDiverging(interpolator)) {
            const center = (min + max) / 2;
            return [min, center, max];
        }
        return [min, max];
    }

    /**
     * Resolves a categorical domain from a color-map configuration.
     *
     * @param values - Input category values.
     * @param config - Color-map configuration controlling the domain strategy.
     * @returns Ordered categorical domain labels.
     */
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
        const isCategorical = ColorMap.isCategorical(config.interpolator)
            || (config.domainSpec.type === ColorMapDomainStrategy.USER && config.domainSpec.params.some(v => typeof v === 'string'))
            || (!ArrayBuffer.isView(values) && (values as Array<number|string>).some(v => typeof v === 'string' && isNaN(Number(v))));

        if (isCategorical) {
            return ColorMap.resolveCategoricalDomainFromConfig(values as string[], config);
        } else {
            return ColorMap.resolveNumericDomainFromConfig(values as number[] | TypedArray, config, config.interpolator);
        }
    }

    /**
     * Builds a d3-compatible interpolator function for the requested color scheme.
     *
     * @param color - Interpolator identifier to build.
     * @param domain - Optional explicit domain used to parameterize the scale.
     * @returns Function that maps normalized scalar values to CSS color strings.
     */
    private static buildInterpolator(
        color: ColorMapInterpolator,
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): (t: number) => string {
        if (ColorMap.isCategorical(color)) {
            const scheme = d3_scheme[color] as string[];
            const n = domain?.length ?? scheme.length;
            return (t: number) => {
                const idx = Math.min(Math.round(t * (n - 1)), scheme.length - 1);
                return scheme[idx];
            };
        }

        if (ColorMap.isDiverging(color)) {
            return d3_scale.scaleDiverging(d3_scheme[color] as (t: number) => string)
                .domain((domain as DivergingDomain) ?? [0, 0.5, 1]);
        }

        return d3_scale.scaleSequential(d3_scheme[color] as (t: number) => string)
            .domain((domain as SequentialDomain) ?? [0, 1]);
    }

    /**
     * Computes a percentile value from a numeric array.
     *
     * @param values - Numeric values to sample.
     * @param p - Percentile in normalized `[0, 1]` form.
     * @returns Interpolated percentile value.
     */
    private static computePercentile(values: number[] | TypedArray, p: number): number {
        if (values.length === 0) return 0;
        const sorted = (ArrayBuffer.isView(values) ? new Float32Array(values) : [...values]).sort((a, b) => a - b);
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }
}
