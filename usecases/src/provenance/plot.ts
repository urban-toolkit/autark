/**
 * The 24 linked plots of the case study: their configurations and construction.
 *
 * Every plot reads the same regions. Aggregating plots get the reducer chosen
 * in the page when it applies to them; the area chart uses a moving average
 * registered outside the package core (`moving-average.ts`).
 */

import * as next from '@urban-toolkit/autk-plot';
import type { FilterCondition, PlotTransformConfig, TransformReducer, UnifiedPlotConfig } from '@urban-toolkit/autk-plot';

import { PLOT_HEIGHT } from './config';
import type { Collection } from './data';

/** One linked plot: its container, the event it emits, and its config. */
export type LinkedPlot = {
    name: string;
    div: string;
    event: next.PlotEvent;
    config: Omit<UnifiedPlotConfig, 'collection' | 'events'>;
};

/** Page settings that change how the plots are built. */
export type PlotSettings = {
    /** Reducer of aggregating transforms. */
    reducer: TransformReducer;
    /** Condition every plot keeps regions by, or `null` for all regions. */
    filter: FilterCondition | null;
};

/** The 24 plots, in the order of the page grid. */
export const PLOTS: LinkedPlot[] = [
    {
        name: 'scatterplot',
        div: '#scatter',
        event: next.PlotEvent.BRUSH,
        config: { type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, labels: { title: 'Regions' }, height: PLOT_HEIGHT },
    },
    {
        name: 'linechart',
        div: '#line',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'linechart',
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            labels: { axis: ['day', 'complaints'], title: 'Noise complaints per day' },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'day' } },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 70 },
        },
    },
    {
        name: 'histogram',
        div: '#histogram',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'barchart',
            attributes: { axis: ['shape_area', '@transform'] },
            labels: { axis: ['shape_area', 'regions'], title: 'Area histogram' },
            transform: { preset: 'binning-1d', options: { bins: 10 } },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 80 },
        },
    },
    {
        name: 'heatmatrix',
        div: '#heatmatrix',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'heatmatrix',
            attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            labels: { axis: ['shape_area', 'landuse'], title: 'Area × land use' },
            transform: { preset: 'binning-2d', options: { binsX: 5 } },
            height: PLOT_HEIGHT,
            margins: { left: 100, right: 20, top: 40, bottom: 70 },
        },
    },
    {
        name: 'parallel coordinates',
        div: '#pcoords',
        event: next.PlotEvent.BRUSH_Y,
        config: {
            type: 'parallel-coordinates',
            attributes: { axis: ['shape_area', 'shape_leng', 'landuse'] },
            labels: { title: 'Attributes' },
            height: PLOT_HEIGHT,
        },
    },
    {
        name: 'table',
        div: '#table',
        event: next.PlotEvent.CLICK,
        config: { type: 'table', attributes: { axis: ['ntaname', 'landuse', 'shape_area'] }, labels: { title: 'Regions by name' } },
    },
    {
        name: 'boxplot',
        div: '#boxplot',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'boxplot',
            attributes: { axis: ['landuse', 'shape_area'] },
            labels: { axis: ['land use', 'shape_area'], title: 'Area by land use' },
            transform: { preset: 'box-stats' },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 50 },
        },
    },
    {
        name: 'sankey',
        div: '#sankey',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'sankey',
            attributes: { axis: ['ntatype', 'landuse', 'cdta2020'] },
            labels: { title: 'NTA type → land use → district' },
            transform: { preset: 'flows' },
            height: PLOT_HEIGHT + 20,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    // ---- Regions, partitions and events (R1, R2, R4), and the moving average this page registers (R3 · R10)
    {
        name: 'pie',
        div: '#pie',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'pie',
            attributes: { axis: ['landuse', '@transform'] },
            labels: { title: 'Regions by land use' },
            transform: { preset: 'binning-1d' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    {
        name: 'donut',
        div: '#donut',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'donut',
            attributes: { axis: ['cdta2020', '@transform'] },
            labels: { title: 'Regions by district: top 6 + Others' },
            transform: { preset: 'binning-1d' },
            // Top-k: the 6 largest districts, the rest gathered into one slice (N:1).
            topK: { k: 6, others: 'Others' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    {
        name: 'moving average',
        div: '#area',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'areachart',
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            labels: { axis: ['day', 'complaints'], title: '7-day moving average of complaints' },
            // A transform registered by the case study itself, outside the package (moving-average.ts).
            transform: { preset: 'registered', name: 'moving-average', options: { timestamp: 'date', halfWindow: 3 } },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 70 },
        },
    },
    {
        name: 'calendar',
        div: '#calendar',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'calendar',
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            labels: { title: 'Noise complaints per day' },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'day' } },
            height: PLOT_HEIGHT,
            margins: { left: 30, right: 10, top: 50, bottom: 10 },
        },
    },
    {
        name: 'bubbles',
        div: '#bubble',
        event: next.PlotEvent.BRUSH,
        config: {
            type: 'bubble',
            attributes: { axis: ['shape_area', 'shape_leng', 'sjoin.count.noise'] },
            labels: { axis: ['shape_area', 'shape_leng', 'complaints'], title: 'Regions (size: complaints)' },
            height: PLOT_HEIGHT,
        },
    },
    {
        name: 'hexbin',
        div: '#hexbin',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'hexbin',
            attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['shape_area', 'shape_leng'], title: 'Regions binned in hexagons' },
            transform: { preset: 'binning-hex', options: { radius: 22 } },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 50 },
        },
    },
    {
        name: 'waffle',
        div: '#waffle',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'waffle',
            attributes: { axis: ['landuse', '@transform'] },
            labels: { title: 'One region per square' },
            transform: { preset: 'binning-1d' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 20, top: 40, bottom: 10 },
        },
    },
    // ---- Hierarchies, measures, accumulation and pairs (R5 to R8)
    {
        name: 'stacked bars',
        div: '#stacked',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'stackedbar',
            attributes: { axis: ['cdta2020', 'landuse'] },
            labels: { axis: ['district', 'regions'], title: 'Land use by district' },
            transform: { preset: 'hierarchy' },
            height: PLOT_HEIGHT,
            margins: { left: 50, right: 20, top: 56, bottom: 50 },
        },
    },
    {
        name: 'treemap',
        div: '#treemap',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'treemap',
            attributes: { axis: ['landuse', 'cdta2020'] },
            labels: { title: 'Land use → district' },
            transform: { preset: 'hierarchy' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    {
        name: 'sunburst',
        div: '#sunburst',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'sunburst',
            attributes: { axis: ['landuse', 'cdta2020'] },
            labels: { title: 'Land use → district' },
            transform: { preset: 'hierarchy' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    {
        name: 'radar',
        div: '#radar',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'radar',
            attributes: { axis: ['landuse', 'shape_area', 'shape_leng', 'sjoin.count.noise'] },
            labels: { axis: ['land use', 'shape_area', 'shape_leng', 'complaints'], title: 'Mean profile of each land use' },
            transform: { preset: 'fold' },
            height: PLOT_HEIGHT,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    {
        name: 'ECDF',
        div: '#ecdf',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'ecdf',
            attributes: { axis: ['shape_area'] },
            labels: { axis: ['shape_area', 'regions'], title: 'Cumulative distribution of areas' },
            transform: { preset: 'cumulative' },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 50 },
        },
    },
    {
        name: 'Pareto',
        div: '#pareto',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'pareto',
            attributes: { axis: ['cdta2020'] },
            labels: { axis: ['district', 'regions'], title: 'Regions by district (Pareto)' },
            transform: { preset: 'cumulative' },
            height: PLOT_HEIGHT,
            margins: { left: 50, right: 50, top: 40, bottom: 50 },
        },
    },
    {
        name: 'chord',
        div: '#chord',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'chord',
            attributes: { axis: ['landuse', 'cdta2020'] },
            labels: { title: 'Land use × district' },
            transform: { preset: 'flows' },
            height: PLOT_HEIGHT + 20,
            margins: { left: 10, right: 10, top: 40, bottom: 10 },
        },
    },
    // ---- Fractional coverage, with real weights (R10)
    {
        name: 'density',
        div: '#density',
        event: next.PlotEvent.BRUSH_X,
        config: {
            type: 'density',
            attributes: { axis: ['shape_area'] },
            labels: { axis: ['shape_area', 'density'], title: 'Density of areas' },
            transform: { preset: 'density' },
            height: PLOT_HEIGHT,
            margins: { left: 30, right: 20, top: 40, bottom: 50 },
        },
    },
    {
        name: 'violin',
        div: '#violin',
        event: next.PlotEvent.CLICK,
        config: {
            type: 'violin',
            attributes: { axis: ['landuse', 'shape_area'] },
            labels: { axis: ['land use', 'shape_area'], title: 'Area by land use' },
            transform: { preset: 'density' },
            height: PLOT_HEIGHT,
            margins: { left: 60, right: 20, top: 40, bottom: 50 },
        },
    },
];

/**
 * Transform a chart of the page runs: its own, or the one its plot gives by
 * default (the table sorts its rows).
 */
export function transformOfChart(chart: LinkedPlot): next.PlotTransformConfig | undefined {
    if (chart.config.transform) return chart.config.transform;
    const { defaults } = next.registeredPlot(chart.config.type);
    const given = typeof defaults === 'function' ? defaults({ ...chart.config } as unknown as Parameters<typeof defaults>[0]) : defaults;
    return given?.transform;
}

/** Transforms that group regions, whose reducer and value the page sets. */
const REDUCED_PRESETS = ['binning-1d', 'binning-2d', 'binning-hex', 'hierarchy', 'cumulative', 'flows'];

/**
 * Applies the chosen reducer to the transforms that group regions: count them, or reduce their
 * perimeter (`shape_leng`). Noise complaints carry no value, so their charts always count.
 * A plot that cannot draw the reducer (its definition's `reducers`: slices and flows must add up,
 * a waffle square is one region) keeps counting, and so does an accumulation, which only adds.
 */
export function withReducer(config: LinkedPlot['config'], reducer: TransformReducer): LinkedPlot['config'] {
    const transform = config.transform;
    if (!transform || reducer === 'count' || !REDUCED_PRESETS.includes(transform.preset)) return config;
    if (transform.preset === 'cumulative' && reducer !== 'sum') return config;
    const name = config.type === 'registered' ? (config as { plot: string }).plot : config.type;
    const reducers = next.registeredPlot(name).reducers;
    if (reducers && !reducers.includes(reducer)) return config;
    // The value axis names what is reduced.
    const labels = config.labels?.axis
        ? { ...config.labels, axis: config.labels.axis.map(label => (label === 'regions' ? `${reducer} of shape_leng` : label)) }
        : config.labels;
    return { ...config, labels, transform: { ...transform, options: { ...transform.options, reducer, value: 'shape_leng' } } as PlotTransformConfig };
}


/**
 * Builds one linked plot in its container, fitted to the container width.
 *
 * @param div Host element; its previous content is replaced.
 * @param config Plot config, without data and events.
 * @param event Event the plot emits.
 * @param collection Regions with their complaints.
 * @param settings Page settings.
 * @throws If the plot refuses the config.
 */
export function createPlot(div: HTMLElement, config: LinkedPlot['config'], event: next.PlotEvent, collection: Collection, settings: PlotSettings): next.AutkPlot {
    div.replaceChildren();
    // The width follows the card and redraws when it changes, keeping the selection.
    return new next.AutkPlot(div, {
        width: 'auto',
        height: PLOT_HEIGHT,
        // The use case shows the provenance path under every chart.
        provenance: { path: true },
        ...config,
        collection,
        events: [event],
        ...(settings.filter ? { filter: settings.filter } : {}),
    } as UnifiedPlotConfig);
}
