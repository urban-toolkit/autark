import type { ColorHEX, ColorRGB } from './core-types';
import { ColorMap } from './core-types';

/**
 * Static style helpers shared by all charts.
 *
 * Centralizes default and highlight colors used by D3-based mark styling.
 */
export class ChartStyle {
    // default color for unknown layers
    protected static _default: ColorHEX = '#bfbfbf';
    // default highlight color
    protected static _highlight: ColorHEX = '#5dade2';

    /**
     * Default mark color used when there is no selection highlight.
     */
    static get default(): ColorHEX {
        return ChartStyle._default;
    }

    /**
     * Highlight color used for selected marks.
     */
    static get highlight(): ColorHEX {
        return ChartStyle._highlight;
    }

    /**
     * Updates the global highlight color.
     * @param color Highlight color as hexadecimal string.
     */
    public static setHighlightColor(color: ColorHEX): void {
        ChartStyle._highlight = color;
    }

    /**
     * Returns highlight color in RGB format.
     * @returns Highlight color converted to RGB channels.
     */
    public static getHighlightColor(): ColorRGB {
        return ColorMap.hexToRgb(ChartStyle._highlight);
    }

    /**
     * Updates the global default mark color.
     * @param color Default mark color as hexadecimal string.
     */
    public static setDefaultColor(color: ColorHEX): void {
        ChartStyle._default = color;
    }

    /**
     * Returns default mark color in RGB format.
     * @returns Default color converted to RGB channels.
     */
    public static getDefaultColor(): ColorRGB {
        return ColorMap.hexToRgb(ChartStyle._default);
    }
}
