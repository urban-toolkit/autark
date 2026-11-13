/**
 * @module LegendLabels
 * Where a map legend's labels sit under its color ramp.
 */

/** One label of a legend: its text, where it sits along the ramp, and how it is anchored there. */
export interface LegendLabelPlacement {
    label: string;
    pos: number;
    anchor: 'start' | 'middle' | 'end';
}

/**
 * Places a legend's labels under its color ramp.
 *
 * A categorical legend centers each label under its swatch. A continuous
 * legend spreads its labels evenly from the ramp's start to its end: the first
 * label starts at the start and the last ends at the end, so neither runs past
 * the legend's edge, and the labels between are centered on their places.
 *
 * @param labels The labels, in order.
 * @param innerWidth The ramp's width.
 * @param swatchWidth The width of one swatch, for a categorical legend.
 * @param isCategorical Whether the legend is categorical.
 * @returns Each label with its place along the ramp and its anchor.
 */
export function legendLabelPlacements(
    labels: string[],
    innerWidth: number,
    swatchWidth: number,
    isCategorical: boolean,
): LegendLabelPlacement[] {
    const last = labels.length - 1;
    return labels.map((label, i) => {
        if (isCategorical) return { label, pos: i * swatchWidth + swatchWidth / 2, anchor: 'middle' };
        if (last === 0) return { label, pos: 0, anchor: 'start' };
        const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
        return { label, pos: i * (innerWidth / last), anchor };
    });
}
