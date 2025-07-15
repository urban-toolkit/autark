import * as d3_color from 'd3-color';
import * as d3_scale from 'd3-scale-chromatic';

import { ColorHEX, ColorMapInterpolator, ColorRGB, ColorTEX } from './constants';

/**
 * ColorMap class provides methods to handle color mapping and interpolation.
 * 
 * It allows retrieval of colors based on values and color map interpolators,
 * as well as conversion between RGB and HEX color formats.
 */
export class ColorMap {
    protected static _interpolator: (t: number) => string;

    /**
     * Get color for a specific value and color map interpolator
     * @param {number} value The value to get the color for
     * @param {ColorMapInterpolator} color The color map interpolator to use
     * @returns {ColorRGB} The RGB color
     */
    public static getColor(value: number, color: ColorMapInterpolator): ColorRGB {
        if (d3_scale[color] != undefined) {
            ColorMap._interpolator = d3_scale[color];

            const numberPattern = /\d+/g;
            const rgbStr = ColorMap._interpolator(value).match(numberPattern);
            if (rgbStr === null) {
                return { r: 0, g: 0, b: 0, opacity: 1 };
            }
            const rgb = rgbStr.map((el) => +el);
            return { r: rgb[0], g: rgb[1], b: rgb[2], opacity: 1 };
        } else if (isNaN(d3_color.rgb(color).r) == false) {
            const val = d3_color.rgb(color);
            return { r: val.r, g: val.g, b: val.b, opacity: 1 };
        } else {
            throw Error('Color scale or color does not exist.');
        }
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
}
