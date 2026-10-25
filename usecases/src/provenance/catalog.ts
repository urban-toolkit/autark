/**
 * What the workspace shows about each chart and transform: names, relation
 * types, and one-line descriptions. Which charts use which transform is read
 * from the plot configurations, so the two never drift apart.
 */

import { PLOTS } from './plot';
import type { LinkedPlot } from './plot';

/** Presentation of one chart card, by the id of its container. */
export type ChartCard = {
    title: string;
    /** Cardinality from regions to marks. */
    relation: '1:1' | 'N:1' | 'N:N';
    icon: string;
};

export const CHARTS: Record<string, ChartCard> = {
    scatter: { title: 'Scatterplot', relation: '1:1', icon: 'scatter' },
    line: { title: 'Line chart', relation: 'N:N', icon: 'line' },
    histogram: { title: 'Histogram', relation: 'N:1', icon: 'histogram' },
    heatmatrix: { title: 'Heat matrix', relation: 'N:1', icon: 'heatmatrix' },
    pcoords: { title: 'Parallel coordinates', relation: '1:1', icon: 'pcoords' },
    table: { title: 'Table', relation: '1:1', icon: 'table' },
    boxplot: { title: 'Box plot', relation: 'N:1', icon: 'boxplot' },
    sankey: { title: 'Sankey', relation: 'N:N', icon: 'sankey' },
    pie: { title: 'Pie', relation: 'N:1', icon: 'pie' },
    donut: { title: 'Donut with top-k', relation: 'N:1', icon: 'donut' },
    area: { title: 'Area with a registered transform', relation: 'N:N', icon: 'area' },
    calendar: { title: 'Calendar', relation: 'N:N', icon: 'calendar' },
    bubble: { title: 'Bubble chart', relation: '1:1', icon: 'bubble' },
    hexbin: { title: 'Hexbin', relation: 'N:1', icon: 'hexbin' },
    waffle: { title: 'Waffle', relation: 'N:1', icon: 'waffle' },
    stacked: { title: 'Stacked bars', relation: 'N:1', icon: 'stacked' },
    treemap: { title: 'Treemap', relation: 'N:1', icon: 'treemap' },
    sunburst: { title: 'Sunburst', relation: 'N:1', icon: 'sunburst' },
    radar: { title: 'Radar', relation: 'N:N', icon: 'radar' },
    ecdf: { title: 'ECDF', relation: 'N:N', icon: 'ecdf' },
    pareto: { title: 'Pareto', relation: 'N:N', icon: 'pareto' },
    chord: { title: 'Chord', relation: 'N:N', icon: 'chord' },
    density: { title: 'Density (real weights)', relation: 'N:N', icon: 'density' },
    violin: { title: 'Violin (real weights)', relation: 'N:N', icon: 'violin' },
};

/** One transform of the package (or registered by this case study). */
export type TransformEntry = {
    /** Preset name, or the registered name. */
    name: string;
    /** Relation types it composes (see the provenance model). */
    relations: string;
    description: string;
};

export const TRANSFORMS: TransformEntry[] = [
    { name: 'sort', relations: 'R1 identity', description: 'Orders the rows: each region stays one mark.' },
    { name: 'binning-1d', relations: 'R2 partition', description: 'Groups regions by a value range or a category and reduces each group.' },
    { name: 'binning-2d', relations: 'R2 partition', description: 'Groups regions into the cells of a grid of two attributes.' },
    { name: 'binning-hex', relations: 'R2 partition', description: 'Groups points into hexagonal cells.' },
    { name: 'binning-events', relations: 'R3 unnest · R2 partition', description: 'Unnests the events of each region and counts them per time bucket.' },
    { name: 'reduce-series', relations: 'R3 unnest · R2 partition', description: 'Unnests the series of each region and reduces each bucket.' },
    { name: 'hierarchy', relations: 'R5 chained partition', description: 'Nests categories: each level partitions the one below.' },
    { name: 'fold', relations: 'R6 unnest by attribute', description: 'One unit per measure, for profiles of several measures.' },
    { name: 'cumulative', relations: 'R2 · R7 accumulation', description: 'Each bin counts in every point from it on: ECDF and Pareto.' },
    { name: 'flows', relations: 'R3 · R2 · R8 pairs', description: 'Links the categories a region crosses between columns.' },
    { name: 'box-stats', relations: 'R9 partition with roles', description: 'Quartiles per group; each member keeps its role (median, outlier).' },
    { name: 'density', relations: 'R10 fractional coverage', description: 'Kernel density: each region spreads a real weight over the curve.' },
    { name: 'moving-average', relations: 'R3 · R10, registered', description: 'A 7-day moving average registered outside the core with registerTransform.' },
];

/** Name of the transform a plot uses, as listed in `TRANSFORMS`. */
function transformOf(plot: LinkedPlot): string | null {
    const transform = plot.config.transform;
    if (!transform) return null;
    return transform.preset === 'registered' ? transform.name : transform.preset;
}

/** Container ids of the charts that use each transform. */
export function chartsByTransform(): Map<string, string[]> {
    const users = new Map<string, string[]>(TRANSFORMS.map(entry => [entry.name, []]));
    for (const plot of PLOTS) {
        const name = transformOf(plot);
        if (name) users.get(name)?.push(plot.div.slice(1));
    }
    return users;
}
