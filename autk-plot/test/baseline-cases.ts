/**
 * Cases of the baseline equivalence with the original autk-plot (4.1.1).
 *
 * The outputs of the original package for these cases were recorded once in
 * `baselines/` (see baselines/README.md); `baseline-transforms.test.ts` and
 * `baseline-render.browser.ts` compare this package against them. The cases
 * cover the original catalog: the gallery transform presets and plot examples.
 */

import * as d3 from 'd3';

import { PlotEvent } from '../src';
import type { AutkDatum, AutkPlot, PlotTransformConfig, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents, withSyntheticSeries } from './fixtures';
import type { Collection } from './fixtures';

/** Builds source rows exactly as `PlotBaseData.buildSourceRows()` does. */
export function sourceRows(collection: Collection): AutkDatum[] {
    return collection.features.map((feature, idx) => ({
        ...(feature.properties ?? {}),
        autkIds: [idx],
    }));
}

export type TransformCase = {
    name: string;
    collection: () => Collection;
    config: PlotTransformConfig;
    columns: string[];
};

export const TRANSFORM_CASES: TransformCase[] = [
    {
        name: 'binning-1d quantitative (histogram-brush)',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: { preset: 'binning-1d', options: { bins: 10 } },
        columns: ['shape_area'],
    },
    {
        name: 'binning-1d categorical (histogram-brush-landuse)',
        collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'),
        config: { preset: 'binning-1d' },
        columns: ['landuse'],
    },
    {
        name: 'binning-1d with sum reducer',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: { preset: 'binning-1d', options: { bins: 6, reducer: 'sum', value: 'shape_leng' } },
        columns: ['shape_area'],
    },
    {
        name: 'binning-2d (heatmatrix-click)',
        collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'),
        config: { preset: 'binning-2d', options: { binsX: 5 } },
        columns: ['shape_area', 'landuse'],
    },
    {
        name: 'sort (table-click)',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: { preset: 'sort', options: { direction: 'asc' } },
        columns: ['ntaname', 'shape_area', 'shape_leng'],
    },
    {
        name: 'reduce-series (timeseries-click)',
        collection: () => withSyntheticSeries(loadGalleryCollection('mnt_neighs_proj.geojson')),
        config: { preset: 'reduce-series', options: { timestamp: 'timestamp', value: 'value', reducer: 'avg' } },
        columns: ['series'],
    },
    {
        name: 'binning-events (temporal-events-click)',
        collection: () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
        config: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } },
        columns: ['sjoin.collect.noise'],
    },
    {
        name: 'binning-events monthly avg',
        collection: () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
        config: { preset: 'binning-events', options: { timestamp: 'date', value: 'value', resolution: 'month', reducer: 'avg' } },
        columns: ['sjoin.collect.noise'],
    },
];

/** Rows and value reader of the `reduceBuckets` baseline. */
export function reduceBucketsCase() {
    return {
        rows: sourceRows(loadGalleryCollection('mnt_neighs_proj_landuse.geojson')),
        bucketOf: (row: Record<string, unknown>) => String(row.landuse ?? ''),
        valueOf: (row: Record<string, unknown>) => Number(row.shape_area),
        reducer: 'max' as const,
    };
}

/** One interaction step applied identically to both plots. */
export type Step =
    | { kind: 'click-mark'; index: number }
    | { kind: 'click-clear' }
    | { kind: 'set-selection'; ids: number[] }
    | { kind: 'brush'; selection: [number, number] | [[number, number], [number, number]] };

export type RenderCase = {
    name: string;
    collection: () => Collection;
    config: Omit<UnifiedPlotConfig, 'collection'>;
    steps: Step[];
};

/** Observable plot state recorded after each step. */
export type Snapshot = {
    step: string;
    /** Number of marks, which both packages draw from the same rows. */
    marks: number;
    selection: number[];
    /** Event names and the selection each one carries. */
    emitted: { event: string; selection: number[] }[];
};

export const RENDER_CASES: RenderCase[] = [
    {
        name: 'histogram-brush',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'barchart',
            attributes: { axis: ['shape_area', '@transform'] },
            labels: { axis: ['area range', 'neighborhoods count'], title: 'Histogram example' },
            transform: { preset: 'binning-1d', options: { bins: 10 } },
            margins: { left: 60, right: 20, top: 50, bottom: 80 },
            width: 790,
            events: [PlotEvent.BRUSH_X],
        },
        steps: [
            { kind: 'set-selection', ids: [0, 7] },
            { kind: 'brush', selection: [0, 250] },
            { kind: 'set-selection', ids: [] },
        ],
    },
    {
        name: 'histogram-rebuild (click)',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'barchart',
            attributes: { axis: ['shape_area', '@transform'] },
            transform: { preset: 'binning-1d', options: { bins: 10 } },
            events: [PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 4 },
            { kind: 'click-mark', index: 1 },
            { kind: 'click-mark', index: 4 },
            { kind: 'click-clear' },
        ],
    },
    {
        name: 'histogram-brush-landuse',
        collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'),
        config: {
            type: 'barchart',
            attributes: { axis: ['landuse', '@transform'] },
            labels: { axis: ['land use type', 'neighborhoods count'], title: 'Land Use Histogram Example' },
            transform: { preset: 'binning-1d' },
            events: [PlotEvent.BRUSH_X],
        },
        steps: [{ kind: 'brush', selection: [100, 400] }],
    },
    {
        name: 'barchart-click',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'barchart',
            attributes: { axis: ['ntaname', 'shape_area'] },
            labels: { axis: ['ntaname', 'shape_area'], title: 'Barchart example' },
            events: [PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 0 },
            { kind: 'set-selection', ids: [3, 5] },
            { kind: 'click-clear' },
        ],
    },
    {
        name: 'heatmatrix-click',
        collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'),
        config: {
            type: 'heatmatrix',
            attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            labels: { axis: ['Shape Area', 'Land Use'], title: 'Neighborhoods by Area and Land Use' },
            transform: { preset: 'binning-2d', options: { binsX: 5 } },
            events: [PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 2 },
            { kind: 'set-selection', ids: [0] },
        ],
    },
    {
        name: 'scatterplot-brush',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'scatterplot',
            attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['shape_area', 'shape_leng'], title: 'Scatterplot example' },
            events: [PlotEvent.BRUSH],
        },
        steps: [{ kind: 'brush', selection: [[0, 100], [400, 370]] }],
    },
    {
        name: 'scatterplot-click',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'scatterplot',
            attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['Area', 'Length'], title: 'Plot example' },
            events: [PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 0 },
            { kind: 'click-mark', index: 10 },
        ],
    },
    {
        name: 'parallel-coordinates',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'parallel-coordinates',
            attributes: { axis: ['shape_area', 'shape_leng', 'cdta2020'] },
            labels: { axis: ['shape_area', 'shape_leng', 'cdta2020'], title: 'Parallel coordinates example' },
            events: [PlotEvent.BRUSH_Y],
        },
        steps: [{ kind: 'brush', selection: [0, 200] }],
    },
    {
        name: 'table-click',
        collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'),
        config: {
            type: 'table',
            attributes: { axis: ['ntaname', 'shape_area', 'shape_leng'] },
            transform: { preset: 'sort', options: { direction: 'asc' } },
            events: [PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 3 },
            { kind: 'set-selection', ids: [1, 2] },
        ],
    },
    {
        name: 'temporal-events (linechart)',
        collection: () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
        config: {
            type: 'linechart',
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            labels: { axis: ['buckets', 'count'], title: 'Monthly noise events per road' },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month', reducer: 'count' } },
            margins: { left: 60, right: 20, top: 50, bottom: 140 },
            width: 790,
            events: [PlotEvent.BRUSH_X],
        },
        steps: [{ kind: 'brush', selection: [100, 500] }],
    },
];

/** Dispatches a DOM click on a rendered node, as d3 handlers expect. */
function click(node: Element | null): void {
    if (!node) throw new Error('Interaction target not found.');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Moves the first brush of the plot programmatically through its d3 behavior. */
function brush(plot: PlotInstance, div: HTMLElement, selection: Step & { kind: 'brush' }): void {
    const behaviors = (plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> })._brushBehaviors;
    const group = div.querySelector<SVGGElement>('.autkBrush');
    if (!group) throw new Error('Brush group not found.');

    const key = group.getAttribute('autkBrushId') || '0';
    const behavior = behaviors.get(key);
    if (!behavior) throw new Error(`Brush behavior "${key}" not found.`);

    d3.select<SVGGElement, unknown>(group).call(behavior.move, selection.selection as d3.BrushSelection);
}

/**
 * A module exposing `AutkPlot`: this package, or the original one when the
 * baselines are recorded. Both have the same public API.
 */
export type PlotModule = { AutkPlot: new (div: HTMLElement, config: UnifiedPlotConfig) => unknown };
type PlotInstance = AutkPlot;

/** Builds a plot with the given module and records its state after each step. */
export function replay(module: PlotModule, testCase: RenderCase): Snapshot[] {
    const div = document.createElement('div');
    document.body.append(div);

    const config = { ...testCase.config, collection: testCase.collection() } as UnifiedPlotConfig;
    const plot = new module.AutkPlot(div, config) as unknown as PlotInstance;

    let emitted: Snapshot['emitted'] = [];
    for (const event of Object.values(PlotEvent)) {
        plot.events.on(event, (data) => emitted.push({ event, selection: [...data.selection].sort((a, b) => a - b) }));
    }

    const snapshot = (step: string): Snapshot => {
        const result = { step, marks: div.querySelectorAll('.autkMark').length, selection: [...plot.selection].sort((a, b) => a - b), emitted };
        emitted = [];
        return result;
    };

    const snapshots = [snapshot('initial')];
    for (const step of testCase.steps) {
        if (step.kind === 'click-mark') click(div.querySelectorAll('.autkMark')[step.index] ?? null);
        else if (step.kind === 'click-clear') click(div.querySelector('.autkClear'));
        else if (step.kind === 'set-selection') plot.setSelection(step.ids);
        else brush(plot, div, step);

        snapshots.push(snapshot(JSON.stringify(step)));
    }

    div.remove();
    return snapshots;
}
