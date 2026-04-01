import * as d3_color from 'd3-color';
import * as d3_scale from 'd3-scale';
import * as d3_scheme from 'd3-scale-chromatic';

import { ColorHEX, ColorMapInterpolator, ColorRGB, ColorTEX, NormalizationMode } from 'autk-types';

export class ColorMap {
    protected static _interpolator: (t: number) => string;

    public static getColor(value: number, color: ColorMapInterpolator): ColorRGB {
        ColorMap._interpolator = ColorMap.buildInterpolator(color);

        const numberPattern = /\d+/g;
        const interp = ColorMap._interpolator(value);
        const rgbStr = d3_color.rgb(interp).formatRgb().match(numberPattern);

        if (rgbStr === null) {
            return { r: 0, g: 0, b: 0, alpha: 1 };
        }
        const rgb = rgbStr.map((el) => +el);
        return { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 };
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

    public static getColorArray(color: ColorMapInterpolator, res = 256): ColorRGB[] {
        const tex: ColorRGB[] = [];
        for (let id = 0; id < res; id++) {
            const val = id / (res - 1);
            const col = ColorMap.getColor(val, color);
            tex.push(col);
        }
        return tex;
    }

    public static rgbToHex(color: ColorRGB): ColorHEX {
        const hex = d3_color.rgb(color.r, color.g, color.b, 1).formatHex();
        return <ColorHEX>hex;
    }

    public static hexToRgb(color: ColorHEX): ColorRGB {
        const rgb = d3_color.rgb(color);
        return { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1.0 };
    }

    private static computePercentile(values: number[], p: number): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
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
        return [Math.min(...values), Math.max(...values)];
    }

    private static buildInterpolator(color: ColorMapInterpolator): (t: number) => string {
        if (color === ColorMapInterpolator.SEQUENTIAL_REDS) {
            const scale = d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQUENTIAL_REDS]);
            return (t: number) => scale.domain([0, 1])(t);
        } else if (color === ColorMapInterpolator.SEQUENTIAL_BLUES) {
            const scale = d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQUENTIAL_BLUES]);
            return (t: number) => scale.domain([0, 1])(t);
        } else if (color === ColorMapInterpolator.DIVERGING_RED_BLUE) {
            const scale = d3_scale.scaleDiverging(d3_scheme[ColorMapInterpolator.DIVERGING_RED_BLUE]);
            return (t: number) => scale.domain([1.0, 0.5, 0.0])(t);
        } else if (color === ColorMapInterpolator.OBSERVABLE10) {
            const scale = d3_scale.scaleOrdinal(d3_scheme[ColorMapInterpolator.OBSERVABLE10]);
            return (t: number) => scale.domain(['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'])(t.toFixed(1));
        } else {
            const scale = d3_scale.scaleSequential(d3_scheme[ColorMapInterpolator.SEQUENTIAL_BLUES]);
            return (t: number) => scale.domain([0, 1])(t);
        }
    }
}
