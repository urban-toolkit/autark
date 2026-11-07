/**
 * What the workspace shows about each chart and transform: names, relation
 * types, and one-line descriptions. Which charts use which transform is read
 * from the plot configurations (and their plot defaults), so the two never
 * drift apart.
 */

import { PLOTS, transformOfChart } from './plot';

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

/**
 * What the workspace says about a transform beyond its definition: the
 * relation types it composes (the provenance model, as in the report) and
 * one line on how regions become rows. Its label and row shape are read from
 * the registry, where the 12 built-in transforms and the one this page
 * registers are defined the same way.
 */
export type TransformEntry = {
    /** Registered name: `{ preset: name }` for a built-in, `{ preset: 'registered', name }` for the page's. */
    name: string;
    /** Who registered it: the package, or this page with `registerTransform`. */
    origin: 'built-in' | 'page';
    /** Relation types it composes (see the provenance model). */
    relations: string;
    description: string;
};

export const TRANSFORMS: TransformEntry[] = [
    { name: 'sort', origin: 'built-in', relations: 'R1 identity', description: 'Orders the rows: each region stays one mark.' },
    { name: 'binning-1d', origin: 'built-in', relations: 'R2 partition', description: 'Groups regions by a value range or a category and reduces each group.' },
    { name: 'binning-2d', origin: 'built-in', relations: 'R2 partition', description: 'Groups regions into the cells of a grid of two attributes.' },
    { name: 'binning-hex', origin: 'built-in', relations: 'R2 partition', description: 'Groups points into hexagonal cells.' },
    { name: 'binning-events', origin: 'built-in', relations: 'R4 (R3 unnest · R2 partition)', description: 'Unnests the events of each region and counts them per time bucket.' },
    { name: 'reduce-series', origin: 'built-in', relations: 'R4 (R3 unnest · R2 partition)', description: 'Unnests the series of each region and reduces each bucket.' },
    { name: 'hierarchy', origin: 'built-in', relations: 'R5 chained partition', description: 'Nests categories: each level partitions the one below.' },
    { name: 'fold', origin: 'built-in', relations: 'R6 unnest by attribute · R2', description: 'One unit per measure, reduced per category: profiles of several measures.' },
    { name: 'cumulative', origin: 'built-in', relations: 'R2 · R7 accumulation', description: 'Each bin counts in every point from it on: ECDF and Pareto.' },
    { name: 'flows', origin: 'built-in', relations: 'R3 · R2 · R8 pairs', description: 'Links the categories a region crosses between columns.' },
    { name: 'box-stats', origin: 'built-in', relations: 'R9 partition with roles', description: 'Quartiles per group; each member keeps its role (median, outlier).' },
    { name: 'density', origin: 'built-in', relations: 'R10 fractional coverage', description: 'Kernel density: each region spreads a real weight over the curve.' },
    { name: 'moving-average', origin: 'page', relations: 'R3 · R10 fractional coverage', description: 'Each complaint spreads over the 7 days around it (moving-average.ts).' },
];

/** Container ids of the charts of the page that run each transform, their own or their plot's default. */
export function chartsByTransform(): Map<string, string[]> {
    const users = new Map<string, string[]>(TRANSFORMS.map(entry => [entry.name, []]));
    for (const plot of PLOTS) {
        const transform = transformOfChart(plot);
        if (!transform) continue;
        const name = transform.preset === 'registered' ? (transform as { name: string }).name : transform.preset;
        users.get(name)?.push(plot.div.slice(1));
    }
    return users;
}
