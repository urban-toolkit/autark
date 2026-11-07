/**
 * The 24 linked plots of the case study: their configurations and construction.
 *
 * Every plot reads the same regions. Aggregating plots get the reducer chosen
 * in the page when it applies to them; the area chart uses a moving average
 * registered outside the package core (`moving-average.ts`).
 */

import * as next from '@urban-toolkit/autk-plot';
import type { FilterCondition, TransformReducer, UnifiedPlotConfig } from '@urban-toolkit/autk-plot';

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
            labels: { axis: ['day (March 2025)', 'complaints'], title: 'Noise complaints per day' },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'monthday' } },
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
        config: { type: 'table', attributes: { axis: ['ntaname', 'landuse', 'shape_area'] } },
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
    // ---- Catalog wave 1: built only from relations the model already had
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
            labels: { axis: ['day (March 2025)', 'complaints'], title: '7-day moving average of complaints' },
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
    // ---- Catalog wave 2: new relations (hierarchy, fold, accumulation, pairs)
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
            labels: { title: 'Mean profile of each land use' },
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
    // ---- Catalog wave 3: fractional coverage (real weights)
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
 * Applies the chosen reducer to aggregating transforms.
 *
 * Bins reduce `shape_leng`. Noise complaints carry no value, so the line
 * chart always counts them.
 */
export function withReducer(config: LinkedPlot['config'], reducer: TransformReducer): LinkedPlot['config'] {
    const transform = config.transform;
    if (!transform || transform.preset === 'sort' || reducer === 'count') return config;
    // Slices must add up to the whole, so pies and donuts only take additive reducers.
    if ((config.type === 'pie' || config.type === 'donut') && reducer !== 'sum') return config;
    // Each waffle square is one region, so the waffle always counts.
    if (config.type === 'waffle') return config;
    // Hierarchies and accumulations must add up, so only the sum applies.
    if ((transform.preset === 'hierarchy' || transform.preset === 'cumulative') && reducer === 'sum') {
        return { ...config, transform: { ...transform, options: { ...transform.options, reducer, value: 'shape_leng' } } };
    }
    if (transform.preset === 'binning-1d' || transform.preset === 'binning-2d' || transform.preset === 'binning-hex') {
        return { ...config, transform: { ...transform, options: { ...transform.options, reducer, value: 'shape_leng' } } };
    }
    // Sankey widths must add up, so only additive reducers apply.
    if (transform.preset === 'flows' && reducer === 'sum') {
        return { ...config, transform: { ...transform, options: { reducer, value: 'shape_leng' } } };
    }
    return config;
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
