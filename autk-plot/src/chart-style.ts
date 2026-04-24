import type { ColorHEX } from './types-core';

/**
 * Global style helpers shared by all chart implementations.
 *
 * `ChartStyle` centralizes the base and highlighted colors applied to marks
 * during selection updates.
 *
 * Values are static and process-wide for the package runtime. Updating them
 * affects all charts that read style values after the update.
 */
export class ChartStyle {
    /** Default fill/stroke color used for non-selected marks. */
    protected static _default: ColorHEX = '#bfbfbf';
    /** Highlight color used for selected marks. */
    protected static _highlight: ColorHEX = '#5dade2';

    /**
     * Gets the default mark color.
     * @returns Hex color used for non-selected marks.
     */
    public static get default(): ColorHEX {
        return ChartStyle._default;
    }

    /**
     * Gets the highlight mark color.
     * @returns Hex color used for selected marks.
     */
    public static get highlight(): ColorHEX {
        return ChartStyle._highlight;
    }

    /**
     * Updates the global highlight color used by selection styling.
     * @param color Hex color string to apply as the highlight color.
     */
    public static setHighlightColor(color: ColorHEX): void {
        ChartStyle._highlight = color;
    }

    /**
     * Updates the global default color used for non-selected marks.
     * @param color Hex color string to apply as the default mark color.
     */
    public static setDefaultColor(color: ColorHEX): void {
        ChartStyle._default = color;
    }
}
