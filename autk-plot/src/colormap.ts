import * as d3_color from 'd3-color';
import * as d3_scale from 'd3-scale-chromatic';

import { ColorHEX, ColorRGB, ColorTEX } from './types';
import { ColorMapInterpolator, NormalizationMode } from './constants';

export class ColorMap {
    protected static _interpolator: (t: number) => string;

    public static getColor(value: number, color: ColorMapInterpolator): ColorRGB {
        if (d3_scale[color] != undefined) {
            ColorMap._interpolator = d3_scale[color] as (t: number) => string;

            const numberPattern = /\d+/g;
            const rgbStr = ColorMap._interpolator(value).match(numberPattern);
            if (rgbStr === null) {
                return { r: 0, g: 0, b: 0, alpha: 1 };
            }
            const rgb = rgbStr.map((el) => +el);
            return { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 };
        } else if (isNaN(d3_color.rgb(color).r) == false) {
            const val = d3_color.rgb(color);
            return { r: val.r, g: val.g, b: val.b, alpha: 1 };
        } else {
            throw Error('Color scale or color does not exist.');
        }
    }

    public static getColorMap(color: ColorMapInterpolator, res = 256): ColorTEX {
        const tex: number[] = [];

        for (let id = 0; id < res; id++) {
            const val = id / (res - 1);
            const col = ColorMap.getColor(val, color);
            tex.push(col.r, col.g, col.b, 1);
        }

        return tex;
    }

    /**
     * Compute the value at a given percentile from an array of numbers.
     * @param values The array of numbers
     * @param p The percentile in [0, 1]
     * @returns The value at the given percentile
     */
    private static computePercentile(values: number[], p: number): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    }

    /**
     * Compute the normalization range [min, max] for a set of values.
     * In MIN_MAX mode returns the actual min and max.
     * In PERCENTILE mode returns the values at the given percentile bounds.
     * @param values The array of numbers to normalize
     * @param mode The normalization mode
     * @param lowerPercentile The lower percentile bound (default 0.02)
     * @param upperPercentile The upper percentile bound (default 0.98)
     * @returns A tuple [min, max] representing the normalization range
     */
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
        return [Math.min(...values), Math.max(...values)];
    }

    public static rgbToHex(color: ColorRGB): ColorHEX {
        const hex = d3_color.rgb(color.r, color.g, color.b, 1).formatHex();
        return <ColorHEX>hex;
    }

    public static hexToRgb(color: ColorHEX): ColorRGB {
        const rgb = d3_color.rgb(color);
        return { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1.0 };
    }
}
