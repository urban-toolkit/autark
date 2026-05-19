import type { ColorHEX } from './types-core';

/**
 * Global style helpers shared by all plot implementations.
 *
 * `PlotStyle` centralizes the base and highlighted colors applied to marks
 * during selection updates.
 *
 * Values are static and process-wide for the package runtime. Updating them
 * affects all plots that read style values after the update.
 */
export class PlotStyle {
    /** Default fill/stroke color used for non-selected marks. */
    protected static _default: ColorHEX = '#bfbfbf';
    /** Highlight color used for selected marks. */
    protected static _highlight: ColorHEX = '#5dade2';

    /**
     * Gets the default mark color.
     * @returns Hex color used for non-selected marks.
     */
    public static get default(): ColorHEX {
        return PlotStyle._default;
    }

    /**
     * Gets the highlight mark color.
     * @returns Hex color used for selected marks.
     */
    public static get highlight(): ColorHEX {
        return PlotStyle._highlight;
    }

    /**
     * Updates the global highlight color used by selection styling.
     *
     * @param color Hex color string to apply as the highlight color.
     * @throws Never throws.
     * @example
     * PlotStyle.setHighlightColor('#ff6600');
     */
    public static setHighlightColor(color: ColorHEX): void {
        PlotStyle._highlight = color;
    }

    /**
     * Updates the global default color used for non-selected marks.
     *
     * @param color Hex color string to apply as the default mark color.
     * @throws Never throws.
     * @example
     * PlotStyle.setDefaultColor('#cccccc');
     */
    public static setDefaultColor(color: ColorHEX): void {
        PlotStyle._default = color;
    }
}
