import * as d3_color from 'd3-color';
import * as d3_scale from 'd3-scale';
import * as d3_scheme from 'd3-scale-chromatic';

import { ColorHEX, ColorMapInterpolator, ColorRGB, ColorTEX } from './constants';

/**
 * ColorMap class provides methods to handle color mapping and interpolation.
 * It allows retrieval of colors based on values and color map interpolators,
 * as well as conversion between RGB and HEX color formats.
 * @example
 * const color = ColorMap.getColor(0.5, ColorMapInterpolator.SEQUENTIAL_REDS);
 * const colorMap = ColorMap.getColorMap(ColorMapInterpolator.SEQUENTIAL_REDS, 256);
 */
export class ColorMap {
    /**
     * The color map interpolator function.
     * This is set when a color map is requested.
     */
    protected static _interpolator: (t: number) => string;

    /**
     * ColorMap class provides methods to handle color mapping and interpolation.
     * 
     * It allows retrieval of colors based on values and color map interpolators,
     * as well as conversion between RGB and HEX color formats.
     * @param {number | string} value The value to get the color for
     * @param {ColorMapInterpolator} color The color map interpolator to use
     * @returns {ColorRGB} The RGB color
     */
    public static getColor(value: number, color: ColorMapInterpolator): ColorRGB {
        ColorMap._interpolator = ColorMap.buildInterpolator(color);

        const numberPattern = /\d+/g;
        const interp = ColorMap._interpolator(value);
        const rgbStr = d3_color.rgb(interp).formatRgb().match(numberPattern);

        if (rgbStr === null) {
            return { r: 0, g: 0, b: 0, opacity: 1 };
        }
        const rgb = rgbStr.map((el) => +el);
        return { r: rgb[0], g: rgb[1], b: rgb[2], opacity: 1 };
    }

    /**
     * Get color map for a specific color map interpolator
     * @param {ColorMapInterpolator} color The color map interpolator to use
     * @param {number} res The resolution of the color map
     * @returns {ColorTEX} The texture representation of the color map
     */
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
     * Convert RGB color to HEX format
     * @param {ColorRGB} color The RGB color to convert
     * @returns {ColorHEX} The HEX representation of the color
     */
    public static rgbToHex(color: ColorRGB): ColorHEX {
        const hex = d3_color.rgb(color.r, color.g, color.b, 1).formatHex();
        return <ColorHEX>hex;
    }

    /**
     * Convert HEX color to RGB format
     * @param {ColorHEX} color The HEX color to convert
     * @returns {ColorRGB} The RGB representation of the color
     */
    public static hexToRgb(color: ColorHEX): ColorRGB {
        const rgb = d3_color.rgb(color);
        return { r: rgb.r, g: rgb.g, b: rgb.b, opacity: 1.0 };
    }

    private static buildInterpolator(color: ColorMapInterpolator): (t: number) => string {
        if (color === ColorMapInterpolator.SEQUENTIAL_REDS) {
            const scale = d3_scale.scaleLinear(ColorMapInterpolator.SEQUENTIAL_REDS);
            return (t: number) => scale.domain([
                0, 1
            ])(t);
        }
        else if (color === ColorMapInterpolator.SEQUENTIAL_BLUES) {
            const scale = d3_scale.scaleLinear(ColorMapInterpolator.SEQUENTIAL_BLUES)
            return (t: number) => scale.domain([
                0, 1
            ])(t);
        }
        else if (color === ColorMapInterpolator.OBSERVABLE10) {
            const scale = d3_scale.scaleOrdinal(d3_scheme[ColorMapInterpolator.OBSERVABLE10]);
            return (t: number) => scale.domain([
                '0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'
            ])(t.toFixed(1));
        }
        else {
            const scale = d3_scale.scaleLinear(ColorMapInterpolator.SEQUENTIAL_BLUES)
            return (t: number) => scale.domain([
                0, 1
            ])(t);
        }
    }
}
