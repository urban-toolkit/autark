import * as d3_color from 'd3-color';
import * as d3_scale from 'd3-scale';
import * as d3_scheme from 'd3-scale-chromatic';

import {
    ColorHEX,
    ColorMapInterpolator,
    ColorRGB,
    ColorTEX,
    NormalizationMode
} from './types';

/** Domain for sequential color scales: `[min, max]`. */
export type SequentialDomain = [number, number];

/** Domain for diverging color scales: `[min, center, max]`. */
export type DivergingDomain = [number, number, number];

/** Domain for categorical color scales: ordered list of category keys. */
export type CategoricalDomain = string[];

export class ColorMap {
    public static getColor(value: number, color: ColorMapInterpolator, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorRGB {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        return ColorMap.interpolatorToRgb(interpolator, value);
    }

    public static getColorMap(color: ColorMapInterpolator, res = 256, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorTEX {
        const interpolator = ColorMap.buildInterpolator(color, domain);
        const tex: number[] = [];
        for (let id = 0; id < res; id++) {
            const col = ColorMap.interpolatorToRgb(interpolator, id / (res - 1));
            tex.push(col.r, col.g, col.b, 1);
        }
        return tex;
    }

    public static getColorArray(color: ColorMapInterpolator, res = 256, domain?: SequentialDomain | DivergingDomain | CategoricalDomain): ColorRGB[] {
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

    public static computeNormalizationRange(
        values: number[],
        mode: NormalizationMode = NormalizationMode.MIN_MAX,
        lowerPercentile?: number,
        upperPercentile?: number,
    ): [number, number] {
        if (mode === NormalizationMode.PERCENTILE) {
            return [
                ColorMap.computePercentile(values, lowerPercentile ?? 0.02),
                ColorMap.computePercentile(values, upperPercentile ?? 0.98),
            ];
        }
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

    /**
     * Resolves a numeric domain, using the provided one when valid or computing
     * `[min, max]` from values otherwise.
     */
    public static resolveNumericDomain(
        values: number[],
        domain?: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): SequentialDomain | DivergingDomain {
        if (
            Array.isArray(domain)
            && domain.length > 0
            && domain.every(v => typeof v === 'number')
        ) {
            return domain as SequentialDomain | DivergingDomain;
        }
        return ColorMap.computeNormalizationRange(values);
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
        domain: SequentialDomain | DivergingDomain | CategoricalDomain,
    ): string[] {
        if (typeof domain[0] === 'string') return domain as string[];
        return (domain as number[]).map(v => String(v));
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
                const categories = (domain as CategoricalDomain) ?? ['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'];
                const scale = d3_scale.scaleOrdinal(d3_scheme[ColorMapInterpolator.OBSERVABLE10]).domain(categories);
                return (t: number) => scale(t.toFixed(1));
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
