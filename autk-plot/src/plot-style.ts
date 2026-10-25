import * as d3 from 'd3';

import type { ColorHEX } from '@urban-toolkit/autk-core';

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
    /** Highlight color used by plots with the segregated provenance view (aqua green). */
    protected static _provenance: ColorHEX = '#63d8c0';
    /** Darker shade of the provenance color, used for outlines of provenance marks. */
    protected static _provenanceStroke: ColorHEX = '#2fae95';
    /** Text color drawn over the provenance highlight color. */
    protected static _provenanceText: ColorHEX = '#073b2c';

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
     * Gets the highlight color of plots with the segregated provenance view.
     *
     * It replaces `highlight` for both partial and whole-mark highlights, so
     * autk-plot-new is visually distinct from the original autk-plot, which
     * keeps `highlight`.
     *
     * @returns Hex color used for selected marks and mark parts.
     */
    public static get provenance(): ColorHEX {
        return PlotStyle._provenance;
    }

    /**
     * Gets the darker shade of the provenance color used for outlines.
     * @returns Hex color for outlines of provenance marks.
     */
    public static get provenanceStroke(): ColorHEX {
        return PlotStyle._provenanceStroke;
    }

    /**
     * Gets the text color drawn over the provenance highlight color.
     * @returns Hex color with readable contrast on `provenance`.
     */
    public static get provenanceText(): ColorHEX {
        return PlotStyle._provenanceText;
    }

    /**
     * Updates the highlight color of plots with the segregated provenance view.
     *
     * @param color Hex color string to apply as the provenance highlight color.
     * @throws Never throws.
     * @example
     * PlotStyle.setProvenanceColor('#63d8c0');
     */
    public static setProvenanceColor(color: ColorHEX): void {
        PlotStyle._provenance = color;
        // The outline and the text over the color follow it.
        const parsed = d3.color(color);
        if (!parsed) return;
        PlotStyle._provenanceStroke = parsed.darker(0.7).formatHex() as ColorHEX;
        const { r, g, b } = parsed.rgb();
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        PlotStyle._provenanceText = (luminance > 0.5 ? parsed.darker(3).formatHex() : '#ffffff') as ColorHEX;
    }

    /**
     * Updates the global highlight color used by selection styling.
     *
     * Selected marks and their parts are drawn in the provenance color, so it
     * is updated too: an application that sets its highlight color keeps it.
     *
     * @param color Hex color string to apply as the highlight color.
     * @throws Never throws.
     * @example
     * PlotStyle.setHighlightColor('#ff6600');
     */
    public static setHighlightColor(color: ColorHEX): void {
        PlotStyle._highlight = color;
        PlotStyle.setProvenanceColor(color);
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

    /**
     * Widens a data-driven numeric color domain so a white-to-black sequential
     * scheme stays between light and medium tones.
     *
     * Used by aggregated plots colored by value (hexbin, calendar) with the
     * grey scheme: the smallest value is not white, so it shows on a white
     * background, and the largest is not black, so the provenance color drawn
     * over it keeps contrast.
     *
     * @param domain Observed `[min, max]` of the values.
     * @returns Domain whose `min` falls at about 16% and `max` at about 70% of the scheme.
     */
    public static softSequentialDomain([min, max]: [number, number]): [number, number] {
        const span = max - min || Math.abs(max) || 1;
        return [min - span * 0.3, max + span * 0.55];
    }

    /**
     * Grey shade of the `index`-th of `count` categories, from light to medium.
     *
     * Plots that must tell categories apart (stacked bars, radar polygons)
     * use greys, so the provenance color drawn over them keeps contrast.
     *
     * @param index Category position.
     * @param count Number of categories.
     * @returns CSS color string.
     */
    public static shade(index: number, count: number): string {
        const t = count <= 1 ? 0.35 : 0.2 + (0.45 * index) / (count - 1);
        return d3.interpolateGreys(t);
    }
}
