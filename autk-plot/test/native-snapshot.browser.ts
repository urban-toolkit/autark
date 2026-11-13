/**
 * Snapshots of built-in plots, recorded before a plot is rewritten.
 *
 * Built-in plots are moving to the registration API that user plots use
 * (`registerPlot`). Their segregated view then comes from the inferred design
 * instead of code written for each plot, so `partial-design-catalog.test.ts`
 * no longer compares two independent drawings for them. These snapshots keep
 * that comparison: they were recorded from the hand-written plots
 * (`baselines/natives.json`) and every rewritten plot must reproduce them.
 *
 * What is compared, after each step: the effective box and fill of every mark
 * and partial mark, axis ticks and labels, the title, the selection, the
 * emitted selections with their shares, and the provenance path. DOM structure
 * (element order, `transform` versus geometry attributes) may change.
 *
 * Record again only on purpose: `AUTK_RECORD=1 node autk-plot/test/run-browser.mjs native-snapshot`
 * (the runner writes what the page records).
 *
 * One recorded value was corrected by hand, not re-recorded: the hand-written
 * scatter plot ignored `attributes.color` on its first draw (every point gray
 * until the first selection, even an empty one). The initial fills of the
 * "color attribute" case are the ones that plot drew after clearing its
 * selection, which a plot drawn by the shared infrastructure draws at once.
 *
 * Cases recorded later (wave 1: heat matrix, hexbin, waffle, pie, donut; wave 2:
 * box plot, calendar, treemap, stacked bars, violin, sunburst; wave 3: line,
 * area, radar, density, ECDF, Pareto; wave 4: Sankey, chord, parallel
 * coordinates, table) also record the outline of partial marks, wave 3 the
 * lines and areas of the subset, and wave 4 how marks and parts look. Changes
 * accepted on purpose are applied to the recording at comparison time, in
 * `accepted()`, not edited in the file. Recording adds only cases that are
 * missing, so a recording is never replaced by the rewritten plot it checks.
 */

import * as d3 from 'd3';
import { beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { PlotEventData, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents, withSyntheticSeries } from './fixtures';
import type { Collection } from './fixtures';
import { effectiveBox, effectiveSector, installSvgBBox } from './svg-geometry';
import recordedText from './baselines/natives.json?raw';

/** Record mode, set by the runner under `AUTK_RECORD=1`. */
const RECORD = (window as { __AUTK_RECORD?: boolean }).__AUTK_RECORD === true;

const regions = () => loadGalleryCollection('mnt_neighs_proj.geojson');
const landuse = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const events = () => withSyntheticEvents(landuse());
const series = () => withSyntheticSeries(landuse());
const half = (collection: Collection) => collection.features.map((_f, i) => i).filter(i => i % 2 === 0);
const halfShares = (collection: Collection) => collection.features.map((_f, feature) => ({ feature, selectedUnits: 1, totalUnits: 3 }));

type Step =
    | { kind: 'click-mark'; index: number }
    | { kind: 'click-clear' }
    | { kind: 'select'; ids: number[] | 'half'; shares?: 'third' }
    | { kind: 'brush'; selection: [number, number] | [[number, number], [number, number]] }
    /** Click on an element that is not a mark (a table header, an axis name). */
    | { kind: 'click-element'; selector: string; index: number };

type Case = {
    name: string;
    collection: () => Collection;
    config: Omit<UnifiedPlotConfig, 'collection'>;
    steps: Step[];
    /** Also record the outline (stroke and width) of partial marks; cases recorded later than the first ones. */
    strokes?: true;
    /** Also record the lines and areas of the selected subset (cases recorded from wave 3 on). */
    series?: true;
    /** Also record how marks and parts look: outline, opacities, background, text color (cases recorded from wave 4 on). */
    looks?: true;
};

const histogram = { attributes: { axis: ['shape_area', '@transform'] }, transform: { preset: 'binning-1d' as const, options: { bins: 10 } } };

export const NATIVE_CASES: Case[] = [
    {
        name: 'barchart: histogram-brush (gallery)',
        collection: regions,
        config: {
            type: 'barchart', ...histogram,
            labels: { axis: ['area range', 'neighborhoods count'], title: 'Histogram example' },
            margins: { left: 60, right: 20, top: 50, bottom: 80 }, width: 790,
            events: [next.PlotEvent.BRUSH_X], provenance: { path: 'open' },
        },
        steps: [
            { kind: 'select', ids: [0, 7] },
            { kind: 'brush', selection: [0, 250] },
            { kind: 'select', ids: [] },
        ],
    },
    {
        name: 'barchart: histogram click',
        collection: regions,
        config: { type: 'barchart', ...histogram, events: [next.PlotEvent.CLICK] },
        steps: [
            { kind: 'click-mark', index: 4 },
            { kind: 'click-mark', index: 1 },
            { kind: 'click-mark', index: 4 },
            { kind: 'click-clear' },
            { kind: 'select', ids: 'half' },
        ],
    },
    {
        name: 'barchart: land use (gallery)',
        collection: landuse,
        config: {
            type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' },
            labels: { axis: ['land use type', 'neighborhoods count'], title: 'Land Use Histogram Example' },
            events: [next.PlotEvent.BRUSH_X],
        },
        steps: [{ kind: 'brush', selection: [100, 400] }, { kind: 'select', ids: [1, 2, 3, 20] }],
    },
    {
        name: 'barchart: one bar per feature (gallery barchart-click), inverse shares',
        collection: regions,
        config: {
            type: 'barchart', attributes: { axis: ['ntaname', 'shape_area'] },
            labels: { axis: ['ntaname', 'shape_area'], title: 'Barchart example' }, events: [next.PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-mark', index: 0 },
            { kind: 'select', ids: [3, 5] },
            { kind: 'click-clear' },
            { kind: 'select', ids: 'half', shares: 'third' },
        ],
    },
    {
        name: 'barchart: sum reducer',
        collection: regions,
        config: { type: 'barchart', attributes: { axis: ['shape_area', '@transform'] }, transform: { preset: 'binning-1d', options: { bins: 6, reducer: 'sum', value: 'shape_leng' } } },
        steps: [{ kind: 'select', ids: 'half' }],
    },
    {
        name: 'barchart: avg reducer (inner bar of the subset statistic)',
        collection: landuse,
        config: { type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } } },
        steps: [{ kind: 'select', ids: [0, 1, 2] }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'barchart: max reducer',
        collection: landuse,
        config: { type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'max', value: 'shape_area' } } },
        steps: [{ kind: 'select', ids: [4, 9] }],
    },
    {
        name: 'barchart: top-k with others, filter, path',
        collection: landuse,
        config: {
            type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' },
            topK: { k: 3, others: true }, filter: { attribute: 'shape_area', op: '>', value: 10_000_000 },
            provenance: { path: 'open' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 0 }],
    },
    {
        name: 'scatterplot: brush (gallery)',
        collection: regions,
        config: {
            type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['shape_area', 'shape_leng'], title: 'Scatterplot example' }, events: [next.PlotEvent.BRUSH],
        },
        steps: [{ kind: 'brush', selection: [[0, 100], [400, 370]] }, { kind: 'select', ids: [] }],
    },
    {
        name: 'scatterplot: click (gallery)',
        collection: regions,
        config: {
            type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['Area', 'Length'], title: 'Plot example' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'click-mark', index: 0 }, { kind: 'click-mark', index: 10 }, { kind: 'click-clear' }],
    },
    {
        name: 'scatterplot: inverse shares, color attribute, filter, path',
        collection: landuse,
        config: {
            type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'], color: 'landuse' },
            filter: { attribute: 'landuse', op: '!=', value: 'Mixed' }, provenance: { path: 'open' },
            tickFormats: ['.2s', '.1s'],
        },
        steps: [{ kind: 'select', ids: 'half', shares: 'third' }, { kind: 'select', ids: [0, 1, 2] }, { kind: 'select', ids: [] }],
    },
    {
        name: 'bubble: click, brush, inverse shares',
        collection: landuse,
        config: {
            type: 'bubble', attributes: { axis: ['shape_area', 'shape_leng', 'shape_area'] },
            labels: { axis: ['Area', 'Length'], title: 'Bubbles' }, events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH],
        },
        steps: [
            { kind: 'click-mark', index: 5 },
            { kind: 'brush', selection: [[50, 50], [500, 300]] },
            { kind: 'click-clear' },
            { kind: 'select', ids: 'half', shares: 'third' },
        ],
    },
    // ---- Wave 1: heat matrix, hexbin, waffle, pie, donut (outlines of partial marks recorded too)
    {
        name: 'heatmatrix: click (gallery)',
        collection: landuse,
        strokes: true,
        config: {
            type: 'heatmatrix', attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            labels: { axis: ['Shape Area', 'Land Use'], title: 'Neighborhoods by Area and Land Use' },
            transform: { preset: 'binning-2d', options: { binsX: 5 } },
            margins: { left: 100, right: 20, top: 50, bottom: 80 }, width: 790, events: [next.PlotEvent.CLICK],
        },
        steps: [
            { kind: 'select', ids: [12, 21] },
            { kind: 'click-mark', index: 3 },
            { kind: 'click-mark', index: 3 },
            { kind: 'click-clear' },
            { kind: 'select', ids: 'half' },
        ],
    },
    {
        name: 'heatmatrix: avg reducer (inner cell colored by the subset statistic)',
        collection: landuse,
        strokes: true,
        config: {
            type: 'heatmatrix', attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            transform: { preset: 'binning-2d', options: { binsX: 4, reducer: 'avg', value: 'shape_leng' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2] }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'heatmatrix: max reducer, brush',
        collection: landuse,
        strokes: true,
        config: {
            type: 'heatmatrix', attributes: { axis: ['landuse', 'shape_area'], color: '@transform' },
            transform: { preset: 'binning-2d', options: { binsY: 3, reducer: 'max', value: 'shape_area' } },
            events: [next.PlotEvent.BRUSH],
        },
        steps: [{ kind: 'brush', selection: [[0, 0], [300, 200]] }, { kind: 'select', ids: [4, 9] }],
    },
    {
        name: 'hexbin: click, brush, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'hexbin', attributes: { axis: ['shape_area', 'shape_leng'] },
            labels: { axis: ['Area', 'Length'], title: 'Hexbin' },
            transform: { preset: 'binning-hex', options: { radius: 24 } },
            events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH],
        },
        steps: [
            { kind: 'click-mark', index: 2 },
            { kind: 'brush', selection: [[0, 0], [250, 250]] },
            { kind: 'click-clear' },
            { kind: 'select', ids: 'half' },
        ],
    },
    {
        name: 'hexbin: avg reducer (inner hexagon colored by the subset statistic)',
        collection: landuse,
        strokes: true,
        config: {
            type: 'hexbin', attributes: { axis: ['shape_area', 'shape_leng'] },
            transform: { preset: 'binning-hex', options: { radius: 30, reducer: 'avg', value: 'shape_leng' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5] }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'waffle: click, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'waffle', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' },
            labels: { title: 'Regions by land use' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'click-mark', index: 7 }, { kind: 'select', ids: 'half' }, { kind: 'click-clear' }],
    },
    {
        name: 'pie: click, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'pie', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' },
            labels: { title: 'Regions by land use' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 0 }, { kind: 'click-clear' }],
    },
    {
        name: 'pie: sum reducer',
        collection: landuse,
        strokes: true,
        config: {
            type: 'pie', attributes: { axis: ['landuse', '@transform'] },
            transform: { preset: 'binning-1d', options: { reducer: 'sum', value: 'shape_area' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3] }],
    },
    {
        name: 'donut: top-k with others, path',
        collection: landuse,
        strokes: true,
        config: {
            type: 'donut', attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' },
            topK: { k: 4, others: true }, provenance: { path: 'open' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 1 }],
    },
    // ---- Wave 2: box plot, calendar, treemap, stacked bars, violin, sunburst
    {
        name: 'boxplot: selected features as dots, click',
        collection: landuse,
        strokes: true,
        config: {
            type: 'boxplot', attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'box-stats' },
            labels: { axis: ['land use', 'area'], title: 'Area by land use' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5] }, { kind: 'click-mark', index: 1 }, { kind: 'click-clear' }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'calendar: click, brush, half',
        collection: events,
        strokes: true,
        config: {
            type: 'calendar', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date' } },
            labels: { title: 'Events per day' }, events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 3 },
            { kind: 'brush', selection: [[0, 0], [200, 120]] },
            { kind: 'click-clear' },
        ],
    },
    {
        name: 'calendar: avg reducer (inner day colored by the subset statistic)',
        collection: events,
        strokes: true,
        config: {
            type: 'calendar', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date', reducer: 'avg' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5] }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'treemap: click, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'treemap', attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' },
            labels: { title: 'Regions by land use and district' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 2 }, { kind: 'click-clear' }],
    },
    {
        name: 'treemap: sum reducer',
        collection: landuse,
        strokes: true,
        config: {
            type: 'treemap', attributes: { axis: ['landuse', 'cdta2020'] },
            transform: { preset: 'hierarchy', options: { reducer: 'sum', value: 'shape_area' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5, 6, 7] }],
    },
    {
        name: 'stackedbar: click, brush, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'stackedbar', attributes: { axis: ['cdta2020', 'landuse'] }, transform: { preset: 'hierarchy' },
            labels: { axis: ['district', 'regions'], title: 'Land use by district' },
            events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH_X],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 4 },
            { kind: 'brush', selection: [0, 200] },
            { kind: 'select', ids: [] },
        ],
    },
    {
        name: 'stackedbar: sum reducer',
        collection: landuse,
        strokes: true,
        config: {
            type: 'stackedbar', attributes: { axis: ['landuse', 'cdta2020'] },
            transform: { preset: 'hierarchy', options: { reducer: 'sum', value: 'shape_area' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5, 6, 7] }],
    },
    {
        name: 'violin: click, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'violin', attributes: { axis: ['landuse', 'shape_leng'] }, transform: { preset: 'density' },
            labels: { axis: ['land use', 'length'], title: 'Length by land use' }, events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 20 },
            { kind: 'brush', selection: [[0, 100], [300, 250]] },
            { kind: 'click-clear' },
        ],
    },
    {
        name: 'sunburst: click, half',
        collection: landuse,
        strokes: true,
        config: {
            type: 'sunburst', attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' },
            labels: { title: 'Regions by land use and district' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 0 }, { kind: 'click-mark', index: 9 }, { kind: 'click-clear' }],
    },
    // ---- Wave 3: plots with series (line, area, radar, density, ECDF, Pareto); subset lines and areas recorded too
    {
        name: 'linechart: events count, click, brush, half',
        collection: events,
        strokes: true,
        series: true,
        config: {
            type: 'linechart', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month' } },
            events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH_X],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 3 },
            { kind: 'brush', selection: [100, 300] },
            { kind: 'click-clear' },
            { kind: 'select', ids: [0, 1, 2] },
        ],
    },
    {
        name: 'linechart: avg reducer (subset line with gaps)',
        collection: events,
        strokes: true,
        series: true,
        config: {
            type: 'linechart', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month', reducer: 'avg' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2] }, { kind: 'select', ids: 'half' }],
    },
    {
        name: 'linechart: reduce-series sum',
        collection: series,
        strokes: true,
        series: true,
        config: {
            type: 'linechart', attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series', options: { timestamp: 'timestamp', value: 'value', reducer: 'sum' } },
            labels: { axis: ['year', 'value'], title: 'Series' },
        },
        steps: [{ kind: 'select', ids: 'half' }],
    },
    {
        name: 'areachart: events count, click, half',
        collection: events,
        strokes: true,
        series: true,
        config: {
            type: 'areachart', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month' } },
            labels: { axis: ['month', 'events'], title: 'Events per month' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 2 }, { kind: 'click-clear' }],
    },
    {
        name: 'areachart: avg reducer (subset line only)',
        collection: events,
        strokes: true,
        series: true,
        config: {
            type: 'areachart', attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month', reducer: 'avg' } },
        },
        steps: [{ kind: 'select', ids: 'half' }],
    },
    {
        name: 'radar: click, half',
        collection: landuse,
        strokes: true,
        series: true,
        config: {
            type: 'radar', attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] }, transform: { preset: 'fold' },
            labels: { title: 'Profile of each land use' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 1 }, { kind: 'click-clear' }, { kind: 'select', ids: [0, 1] }],
    },
    {
        name: 'density: brush, half',
        collection: landuse,
        strokes: true,
        series: true,
        config: {
            type: 'density', attributes: { axis: ['shape_leng'] }, transform: { preset: 'density' },
            labels: { axis: ['length', 'density'], title: 'Distribution of lengths' }, events: [next.PlotEvent.BRUSH_X],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'brush', selection: [100, 250] }, { kind: 'select', ids: [] }],
    },
    {
        name: 'density: one curve per group',
        collection: landuse,
        strokes: true,
        series: true,
        config: { type: 'density', attributes: { axis: ['landuse', 'shape_leng'] }, transform: { preset: 'density' } },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'select', ids: [0, 1, 2, 3] }],
    },
    {
        name: 'ecdf: click, half',
        collection: landuse,
        strokes: true,
        series: true,
        config: {
            type: 'ecdf', attributes: { axis: ['shape_leng'] }, transform: { preset: 'cumulative' },
            labels: { axis: ['length', 'share of regions'], title: 'Distribution of lengths' }, events: [next.PlotEvent.CLICK],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 10 }, { kind: 'click-clear' }],
    },
    {
        name: 'pareto: click, brush, half',
        collection: landuse,
        strokes: true,
        series: true,
        config: {
            type: 'pareto', attributes: { axis: ['cdta2020'] }, transform: { preset: 'cumulative' },
            labels: { axis: ['district', 'regions'], title: 'Regions by district' },
            events: [next.PlotEvent.CLICK, next.PlotEvent.BRUSH_X],
        },
        steps: [{ kind: 'select', ids: 'half' }, { kind: 'click-mark', index: 2 }, { kind: 'brush', selection: [0, 150] }, { kind: 'click-clear' }],
    },
    // ---- Wave 4: Sankey, chord, parallel coordinates, table; how marks and parts look recorded too
    {
        name: 'sankey: node and link clicks, half',
        collection: landuse,
        strokes: true,
        looks: true,
        config: {
            type: 'sankey', attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' },
            labels: { title: 'Land use → district' }, events: [next.PlotEvent.CLICK],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 2 },
            { kind: 'click-mark', index: 30 },
            { kind: 'click-clear' },
            { kind: 'select', ids: [0, 1, 2, 3] },
        ],
    },
    {
        name: 'sankey: sum reducer, three columns',
        collection: landuse,
        strokes: true,
        looks: true,
        config: {
            type: 'sankey', attributes: { axis: ['ntatype', 'landuse', 'cdta2020'] },
            transform: { preset: 'flows', options: { reducer: 'sum', value: 'shape_area' } },
        },
        steps: [{ kind: 'select', ids: [0, 1, 2, 3, 4, 5, 6, 7] }],
    },
    {
        name: 'chord: arc and ribbon clicks, half',
        collection: landuse,
        strokes: true,
        looks: true,
        config: {
            type: 'chord', attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' },
            labels: { title: 'Land use × district' }, events: [next.PlotEvent.CLICK],
        },
        steps: [
            { kind: 'select', ids: 'half' },
            { kind: 'click-mark', index: 0 },
            { kind: 'click-mark', index: 25 },
            { kind: 'click-clear' },
        ],
    },
    {
        name: 'parallel-coordinates: axis brush, color by an axis, inverse shares',
        collection: landuse,
        strokes: true,
        looks: true,
        config: {
            type: 'parallel-coordinates', attributes: { axis: ['shape_area', 'shape_leng', 'landuse'] },
            labels: { axis: ['Area', 'Length', 'Land use'], title: 'Parallel Coordinates' },
            events: [next.PlotEvent.BRUSH_Y],
        },
        steps: [
            { kind: 'brush', selection: [60, 220] },
            { kind: 'click-element', selector: '.axis-label', index: 2 },
            { kind: 'select', ids: 'half', shares: 'third' },
            { kind: 'click-element', selector: '.axis-label', index: 2 },
            { kind: 'select', ids: [] },
        ],
    },
    {
        name: 'table: sort by a column, click, inverse shares',
        collection: landuse,
        strokes: true,
        looks: true,
        config: {
            type: 'table', attributes: { axis: ['ntaname', 'landuse', 'shape_area'] },
            labels: { axis: ['Name', 'Land use', 'Area'] }, events: [next.PlotEvent.CLICK],
        },
        steps: [
            { kind: 'click-element', selector: 'th', index: 2 },
            { kind: 'click-mark', index: 5 },
            { kind: 'click-element', selector: 'th', index: 2 },
            { kind: 'select', ids: [] },
            { kind: 'select', ids: 'half', shares: 'third' },
            { kind: 'select', ids: [1, 4] },
        ],
    },
];

const round = (value: number) => Math.round(value * 1000) / 1000;
const rgb = (color: string | null) => (color ? d3.color(color)?.formatRgb() ?? color : null);
/**
 * Geometry of a mark, rounded: what is drawn, wherever it is written. A box
 * `[x, y, width, height]` for rects, circles, and polygons; for an arc, the
 * sector `[inner, outer, start, sweep]` as seen through a circular clip.
 */
function boxOf(element: Element): number[] | null {
    const box = effectiveBox(element);
    if (box) return [box.x, box.y, box.width, box.height].map(round);
    const sector = effectiveSector(element);
    return sector ? [sector.inner, sector.outer, sector.start, sector.sweep].map(round) : null;
}

const fillOf = (element: Element) => rgb((element as SVGElement).style?.fill || element.getAttribute('fill'));
const strokeOf = (element: Element) => {
    const style = (element as SVGElement).style;
    const color = rgb(style?.stroke || element.getAttribute('stroke'));
    return color ? `${color} ${style?.strokeWidth || element.getAttribute('stroke-width') || '1'}` : null;
};

/** How an element looks besides its geometry and fill: outline, opacities, background, and text color. */
function lookOf(element: Element): string {
    const style = (element as HTMLElement).style;
    return [
        strokeOf(element),
        style.opacity || element.getAttribute('opacity') || '',
        style.fillOpacity || element.getAttribute('fill-opacity') || '',
        rgb(style.backgroundColor || null),
        style.backgroundImage || '',
        rgb(style.color || null),
    ].join(' | ');
}

/** A line or area of the selected subset: its commands, coordinates, and style. */
function seriesOf(element: Element) {
    const d = element.getAttribute('d') ?? '';
    const style = (element as SVGElement).style;
    const opacity = style.fillOpacity || element.getAttribute('fill-opacity');
    const fill = rgb(style.fill || element.getAttribute('fill'));
    return {
        commands: (d.match(/[MLHVCSQTAZ]/gi) ?? []).join(''),
        numbers: (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(n => round(Number(n))),
        fill: fill && fill !== 'none' ? `${fill} ${opacity || '1'}` : null,
        stroke: strokeOf(element),
    };
}

type Snapshot = {
    step: string;
    marks: { tag: string; id: string | null; box: number[] | null; fill: string | null; look?: string; units?: string | null }[];
    partials: { tag: string; id: string | null; units: string | null; box: number[] | null; fill: string | null; stroke?: string | null; look?: string }[];
    axes: { id: string; ticks: string[]; label: string | null }[];
    title: string | null;
    selection: number[];
    emitted: { event: string; selection: number[]; shares: number[][] | null }[];
    path: string | null;
    /** Lines and areas of the selected subset: path commands, rounded coordinates, and style. */
    series?: { commands: string; numbers: number[]; fill: string | null; stroke: string | null }[];
};

function brush(plot: next.AutkPlot, div: HTMLElement, selection: Step & { kind: 'brush' }): void {
    const behaviors = (plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> })._brushBehaviors;
    const group = div.querySelector<SVGGElement>('.autkBrush')!;
    const behavior = behaviors.get(group.getAttribute('autkBrushId') || '0')!;
    d3.select<SVGGElement, unknown>(group).call(behavior.move, selection.selection as d3.BrushSelection);
}

function replay(testCase: Case): Snapshot[] {
    const div = document.createElement('div');
    document.body.append(div);
    const collection = testCase.collection();
    const plot = new next.AutkPlot(div, { ...testCase.config, collection } as UnifiedPlotConfig);

    let emitted: Snapshot['emitted'] = [];
    for (const event of Object.values(next.PlotEvent)) {
        plot.events.on(event, (data: PlotEventData) => emitted.push({
            event,
            selection: [...data.selection].sort((a, b) => a - b),
            shares: data.shares
                ? [...data.shares].sort((a, b) => a.feature - b.feature).map(s => [s.feature, round(s.selectedUnits), round(s.totalUnits)])
                : null,
        }));
    }

    const snapshot = (step: string): Snapshot => {
        // Several partial marks may share a mark id (the squares of a waffle group).
        const byId = (a: { id: string | null; box: number[] | null }, b: { id: string | null; box: number[] | null }) =>
            String(a.id).localeCompare(String(b.id)) || String(a.box).localeCompare(String(b.box));
        const result: Snapshot = {
            step,
            marks: Array.from(div.querySelectorAll('.autkMark')).map(m => ({
                tag: m.tagName.toLowerCase(), id: m.getAttribute('data-autk-provenance'), box: boxOf(m), fill: fillOf(m),
                ...(testCase.looks ? { look: lookOf(m), units: m.getAttribute('data-autk-units') } : {}),
            })),
            partials: Array.from(div.querySelectorAll('.autkPartial:not(.autkPartialSeries)')).map(p => ({
                tag: p.tagName.toLowerCase(), id: p.getAttribute('data-autk-provenance'), units: p.getAttribute('data-autk-units'), box: boxOf(p), fill: fillOf(p),
                ...(testCase.strokes ? { stroke: strokeOf(p) } : {}),
                ...(testCase.looks ? { look: lookOf(p) } : {}),
            })).sort(byId),
            axes: Array.from(div.querySelectorAll('#axisX, #axisY')).map(axis => ({
                id: axis.id,
                ticks: Array.from(axis.querySelectorAll('.tick text')).map(t => t.textContent ?? ''),
                label: axis.querySelector('.axis-label')?.textContent ?? null,
            })),
            title: div.querySelector('#plotTitle')?.textContent ?? null,
            selection: [...plot.selection].sort((a, b) => a - b),
            emitted,
            path: div.querySelector('.autk-provenance')?.textContent ?? null,
            ...(testCase.series ? { series: Array.from(div.querySelectorAll('.autkPartialLine, .autkPartialArea, .autkPartialSeries')).map(seriesOf).sort((a, b) => a.commands.localeCompare(b.commands) || a.numbers.length - b.numbers.length) } : {}),
        };
        emitted = [];
        return result;
    };

    const snapshots = [snapshot('initial')];
    for (const step of testCase.steps) {
        if (step.kind === 'click-mark') div.querySelectorAll('.autkMark')[step.index]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        else if (step.kind === 'click-clear') div.querySelector('.autkClear')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        else if (step.kind === 'brush') brush(plot, div, step);
        else if (step.kind === 'click-element') div.querySelectorAll(step.selector)[step.index]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        else plot.setSelection(step.ids === 'half' ? half(collection) : step.ids, step.shares ? halfShares(collection) : undefined);
        snapshots.push(snapshot(JSON.stringify(step)));
    }
    div.remove();
    return snapshots;
}

describe('built-in plots reproduce their recorded snapshots', () => {
    beforeAll(() => installSvgBBox());

    const recorded = JSON.parse(recordedText) as Record<string, Snapshot[]>;

    if (RECORD) {
        // Only cases not recorded yet: a recording is made once, before its plot is rewritten.
        test('record the missing cases', () => {
            const missing = NATIVE_CASES.filter(c => !(c.name in recorded));
            for (const testCase of missing) recorded[testCase.name] = replay(testCase);
            // Only Node writes files: the runner saves what the page leaves here.
            (window as { __autkRecordings?: Record<string, string> }).__autkRecordings = { 'baselines/natives.json': JSON.stringify(recorded, null, 1) + '\n' };
        });
        return;
    }

    for (const testCase of NATIVE_CASES) {
        test(testCase.name, () => {
            expect(recorded[testCase.name], 'no recorded snapshot for this case').toBeDefined();
            const snapshots = replay(testCase);
            const expected = accepted(testCase.name, structuredClone(recorded[testCase.name]), snapshots);
            expect(near(snapshots, expected)).toEqual(expected);
        });
    }
});

/**
 * The actual snapshots, with every number within 0.02 of the expected one
 * replaced by it: a part drawn by scaling its mark and one drawn from new
 * coordinates (a hexagon path written with two decimals) agree to rounding.
 */
function near(actual: unknown, expected: unknown): unknown {
    if (typeof actual === 'number' && typeof expected === 'number') return Math.abs(actual - expected) <= 0.02 ? expected : actual;
    if (Array.isArray(actual) && Array.isArray(expected)) return actual.map((value, i) => near(value, expected[i]));
    if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
        return Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, near(value, (expected as Record<string, unknown>)[key])]));
    }
    return actual;
}

/**
 * Recorded snapshots with the differences accepted on purpose applied.
 *
 * Outlines of partial marks: the hand-written plots each chose their own (the
 * heat matrix outlined every part in the highlight color at 2 px, the hexbin
 * and the calendar kept a white outline even on a part colored by its
 * statistic, the pie thinned the slice outline from 1.5 to 1). Parts drawn by
 * the shared infrastructure keep the outline of their mark; one outline is
 * added, the one the hand-written dots already had (the highlight, darker,
 * 1 px), where the fill does not set the part apart: a part colored by its
 * subset statistic (avg, min, max), and a dot. Geometry and fills are unchanged.
 *
 * Series (wave 3): a moved point is a copy of its mark, so it keeps the mark's
 * radius (the hand-written dots were 0.5 to 1 px smaller); the line or area of
 * the subset is drawn with the style of the series it redraws, in the
 * highlight color (each hand-written plot chose its own width and opacity).
 * With avg, the value axis of the line and area charts now covers every value
 * a subset average can take; the hand-written charts clamped the subset to the
 * edges of the plot instead, drawing values that are not the averages. Those
 * cases keep every vertical coordinate and the value ticks of the plot as
 * drawn now (checked against the averages in `catalog-wave1.test.ts`); the
 * rest (x, selections, units, fills) is still compared.
 *
 * Wave 4: the part of a Sankey or chord mark keeps the outline of its mark
 * (the hand-written arc parts had none) and looks like a highlighted mark, so
 * it is opaque (they used 0.9); a traced line part is opaque like a
 * highlighted line (`opacity: 1` written out). The table draws its title like
 * every plot (the hand-written table drew none), leaves the text color of
 * unhighlighted rows to the page (it forced black), and no longer sets a CSS
 * `fill` on rows, which draws nothing on an HTML element.
 */
function accepted(name: string, snapshots: Snapshot[], actual: Snapshot[]): Snapshot[] {
    // In these cases every part shows a statistic (avg, min, max).
    const STATISTIC_OUTLINE = `${rgb(next.PlotStyle.provenanceStroke)} 1`;
    const outline = (rewrite: (stroke: string | null | undefined) => string | null | undefined) =>
        snapshots.forEach(snapshot => snapshot.partials.forEach(partial => { partial.stroke = rewrite(partial.stroke); }));
    if (name.startsWith('heatmatrix:') && !name.includes('reducer')) outline(() => null);
    if ((name.startsWith('heatmatrix:') || name.startsWith('hexbin:') || name.startsWith('calendar:')) && name.includes('reducer')) outline(() => STATISTIC_OUTLINE);
    if (name.startsWith('pie:') || name.startsWith('donut:')) outline(stroke => stroke?.replace(/ 1$/, ' 1.5'));

    const plot = name.slice(0, name.indexOf(':'));
    const looks = (look: string | undefined, field: number, value: string) => {
        const parts = (look ?? '').split(' | ');
        parts[field] = value;
        return parts.join(' | ');
    };
    if (plot === 'sankey' || plot === 'chord') {
        snapshots.forEach(snapshot => snapshot.partials.forEach(partial => {
            const mark = snapshot.marks.find(m => m.id === partial.id);
            partial.stroke = mark?.look?.split(' | ')[0] || null;
            partial.look = looks(looks(partial.look, 0, partial.stroke ?? ''), 2, '1');
        }));
    }
    if (plot === 'parallel-coordinates') snapshots.forEach(snapshot => snapshot.partials.forEach(partial => { partial.look = looks(partial.look, 1, '1'); }));
    if (plot === 'table') {
        snapshots.forEach(snapshot => {
            snapshot.title = 'Autk Plot';
            snapshot.marks.forEach(mark => {
                mark.fill = null;
                if (mark.look?.endsWith(' | rgb(0, 0, 0)')) mark.look = looks(mark.look, 5, '');
            });
        });
    }
    if (!SERIES_STYLE[plot]) return snapshots;
    snapshots.forEach((snapshot, i) => {
        // Moved points keep the radius of their mark, about the same center.
        for (const partial of snapshot.partials) {
            const mark = snapshot.marks.find(m => m.id === partial.id && m.tag === 'circle');
            if (partial.tag !== 'circle' || !mark?.box || !partial.box) continue;
            const [cx, cy, r] = [partial.box[0] + partial.box[2] / 2, partial.box[1] + partial.box[3] / 2, mark.box[2] / 2];
            partial.box = [cx - r, cy - r, 2 * r, 2 * r].map(round);
        }
        snapshot.series?.forEach((series, k) => Object.assign(series, SERIES_STYLE[plot](k, snapshot.series!.length)));
        if (!name.includes('avg')) return;
        // Avg: vertical coordinates and value ticks as drawn now.
        const now = actual[i];
        snapshot.marks.forEach((mark, k) => { if (mark.box && now?.marks[k]?.box) mark.box[1] = now.marks[k].box![1]; });
        snapshot.partials.forEach((partial, k) => { if (partial.box && now?.partials[k]?.box) partial.box[1] = now.partials[k].box![1]; });
        snapshot.series?.forEach((series, k) => {
            const drawn = now?.series?.[k];
            if (drawn) series.numbers = series.numbers.map((n, j) => (j % 2 === 1 ? drawn.numbers[j] ?? n : n));
        });
        const ticks = now?.axes.find(axis => axis.id === 'axisY')?.ticks;
        const axis = snapshot.axes.find(a => a.id === 'axisY');
        if (axis && ticks) axis.ticks = ticks;
    });
    return snapshots;
}

/** Style of the subset series of each plot: the series' own style in the highlight color. */
const SERIES_STYLE: Record<string, (index: number, count: number) => { fill: string | null; stroke: string | null }> = (() => {
    const highlight = 'rgb(99, 216, 192)';
    const line = () => ({ fill: null, stroke: `${highlight} 1.5` });
    return {
        linechart: line,
        // Sorted by commands: the area (M…L…Z) has more commands than the line, so it comes second.
        areachart: (index, count) => (count === 2 && index === 1 ? { fill: `${highlight} 0.35`, stroke: null } : line()),
        radar: () => ({ fill: `${highlight} 0.15`, stroke: `${highlight} 1.5` }),
        density: () => ({ fill: `${highlight} 0.45`, stroke: `${highlight} 1.5` }),
        ecdf: line,
        pareto: line,
    };
})();
