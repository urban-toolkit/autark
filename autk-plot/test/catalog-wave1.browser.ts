/**
 * Catalog wave 1: plots built only from relations the model already had.
 *
 * - pie / donut   — partition (N:1), `binning-1d` with an additive reducer
 * - areachart     — unnest then partition (N:N), like the line chart
 * - bubble        — identity (1:1), point area from a third attribute
 * - hexbin        — partition (N:1) into hexagons, `binning-hex`
 * - calendar      — unnest then partition (N:N), events per day
 */

import { describe, expect, test } from 'vitest';

import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import * as next from '../src';
import type { BinningHexRow, FeatureShare, PlotEventData, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const withEvents = () => withSyntheticEvents(regions());
const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
const featureIndices = (ids: string[]) => sortNumbers(ids.map(id => Number(id.slice('feature:'.length))));

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const marks = () => Array.from(div.querySelectorAll<SVGElement>('.autkMark'));
    const partials = () => Array.from(div.querySelectorAll<SVGElement>('.autkPartial'));
    const rows = () => plot.instance['_data'] as unknown as Array<{ autkIds: number[] } & Record<string, unknown>>;
    return { div, plot, marks, partials, rows };
}

/** Every rendered row leads back, through the relations, to exactly its `autkIds`. */
function expectInverseMatchesAutkIds(plot: next.AutkPlot, rows: Array<{ autkIds: number[] }>) {
    for (const row of rows) {
        const rowId = plot.instance['rowIdOf'](row) as string;
        const path = plot.provenance.inverse([`mark:${rowId}`]);
        expect(featureIndices(path[path.length - 1].ids)).toEqual(sortNumbers(row.autkIds));
    }
}

/** Selects every feature of the first row but one, so the row is split. */
function splitFirstRow(plot: next.AutkPlot, rows: Array<{ autkIds: number[] }>) {
    const row = rows.find(r => r.autkIds.length >= 2)!;
    const chosen = row.autkIds.slice(0, row.autkIds.length - 1);
    plot.setSelection(chosen);
    return { row, chosen };
}

/** Plot-specific fields of the concrete plot, read by the tests. */
const internals = (plot: next.AutkPlot) => plot.instance as unknown as {
    outerRadius: number;
    innerRatio: number;
    mapX: { (category: string): number | undefined; bandwidth(): number };
    radiusOf: (d: unknown) => number;
    cell: number;
};

const units = (el: Element) => el.getAttribute('data-autk-units')!.split('/').map(Number);

describe('pie and donut (partition, N:1)', () => {
    const pie = (type: 'pie' | 'donut' = 'pie', reducer: 'count' | 'avg' = 'count'): UnifiedPlotConfig => ({
        type,
        collection: regions(),
        attributes: { axis: ['landuse', '@transform'] },
        transform: { preset: 'binning-1d', options: reducer === 'count' ? {} : { reducer, value: 'shape_area' } },
        events: [next.PlotEvent.CLICK],
    });

    test('one slice per land use, sized by count, chained D0 → bins → aggregates → marks', () => {
        const { plot, marks, rows } = mount(pie());
        const landuses = new Set(regions().features.map(f => f.properties!.landuse));
        expect(marks()).toHaveLength(landuses.size);
        expect(rows().reduce((sum, r) => sum + Number(r.value), 0)).toBe(regions().features.length);
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:1', '1:1', '1:1', 'N:1']);
        expectInverseMatchesAutkIds(plot, rows());
    });

    test('segregated view: the inner slice covers the selected fraction of the slice area', () => {
        const { plot, partials, rows } = mount(pie());
        const { row, chosen } = splitFirstRow(plot, rows());
        const partial = partials().find(p => p.getAttribute('data-autk-provenance') === `mark:${plot.instance['rowIdOf'](row)}`)!;
        expect(units(partial)).toEqual([chosen.length, row.autkIds.length]);

        // Same angles, outer radius √f · R, so the area is f of the slice.
        const R = internals(plot).outerRadius;
        const radii = Array.from(partial.getAttribute('d')!.matchAll(/A([\d.]+),/g)).map(m => Number(m[1]));
        expect(radii[0]).toBeCloseTo(R * Math.sqrt(chosen.length / row.autkIds.length), 3);
    });

    test('donut: the inner slice grows from the hole, r² = r₀² + f(R² − r₀²)', () => {
        const { plot, partials, rows } = mount(pie('donut'));
        const { row, chosen } = splitFirstRow(plot, rows());
        const partial = partials().find(p => p.getAttribute('data-autk-provenance') === `mark:${plot.instance['rowIdOf'](row)}`)!;
        const R = internals(plot).outerRadius;
        const r0 = R * (internals(plot).innerRatio);
        const f = chosen.length / row.autkIds.length;
        const radii = Array.from(partial.getAttribute('d')!.matchAll(/A([\d.]+),/g)).map(m => Number(m[1]));
        expect(radii).toContainEqual(expect.closeTo(Math.sqrt(r0 * r0 + f * (R * R - r0 * r0)), 3));
        expect(radii).toContainEqual(expect.closeTo(r0, 3));
    });

    test('non-additive reducers are rejected: slices must add up to the whole', () => {
        expect(() => mount(pie('pie', 'avg'))).toThrow(/additive reducer/);
    });

    test('a click on a slice selects its features and emits their shares', () => {
        const { div, plot, rows } = mount(pie());
        const emitted: PlotEventData[] = [];
        plot.events.on(next.PlotEvent.CLICK, data => emitted.push(data));
        div.querySelector('.autkMark')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortNumbers(emitted[0].selection)).toEqual(sortNumbers(rows()[0].autkIds));
        expect(emitted[0].shares!.every(s => s.selectedUnits === s.totalUnits)).toBe(true);
    });
});

describe('area chart (unnest then partition, N:N)', () => {
    const area = (reducer: 'count' | 'avg' = 'count'): UnifiedPlotConfig => ({
        type: 'areachart',
        collection: withEvents(),
        attributes: { axis: ['sjoin.collect.noise', '@transform'] },
        transform: {
            preset: 'binning-events',
            options: reducer === 'count' ? { timestamp: 'date' } : { timestamp: 'date', reducer, value: 'value' },
        },
        events: [next.PlotEvent.CLICK],
    });

    test('fills the region under the line, with the line chart relations', () => {
        const { div, plot, rows } = mount(area());
        expect(div.querySelector('.autk-area')!.getAttribute('d')).toMatch(/^M/);
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['1:N', 'N:1', '1:1', 'N:N']);
        expectInverseMatchesAutkIds(plot, rows());
    });

    test('segregated view: the selected subset gets its own area for additive reducers', () => {
        const { div, plot, rows } = mount(area());
        splitFirstRow(plot, rows());
        expect(div.querySelector('.autkPartialArea')).not.toBeNull();
        expect(div.querySelector('.autkPartialLine')).not.toBeNull();
    });

    test('avg is not a part of the total, so only the subset line is drawn', () => {
        const { div, plot, rows } = mount(area('avg'));
        splitFirstRow(plot, rows());
        expect(div.querySelector('.autkPartialArea')).toBeNull();
        expect(div.querySelector('.autkPartialLine')).not.toBeNull();
    });
});

describe('pie slice into a one-to-one view (inverse direction)', () => {
    test('shares from a pie slice fill each scatterplot point by its share', () => {
        const pie = mount({
            type: 'pie',
            collection: regions(),
            attributes: { axis: ['landuse', '@transform'] },
            transform: { preset: 'binning-1d' },
            events: [next.PlotEvent.CLICK],
        });
        const { plot, partials } = mount({ type: 'scatterplot', collection: regions(), attributes: { axis: ['shape_area', 'shape_leng'] } });
        pie.plot.events.on(next.PlotEvent.CLICK, ({ selection, shares }) => plot.setSelection(selection, shares));
        pie.div.querySelector('.autkMark')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // A slice holds each of its regions whole, so every point is filled.
        expect(partials()).toHaveLength(pie.rows()[0].autkIds.length);
        for (const p of partials()) expect(Number(p.getAttribute('r'))).toBeCloseTo(5);
    });
});

describe('bubble chart (identity, 1:1)', () => {
    const bubble = (axis = ['shape_area', 'shape_leng', 'shape_area']): UnifiedPlotConfig => ({
        type: 'bubble',
        collection: regions(),
        attributes: { axis },
        events: [next.PlotEvent.CLICK],
    });

    test('bubble area is proportional to the size attribute, larger bubbles first', () => {
        const { marks } = mount(bubble());
        const areas = marks().map(m => Number(m.getAttribute('r')) ** 2);
        expect(areas).toEqual([...areas].sort((a, b) => b - a));

        const sizes = regions().features.map(f => f.properties!.shape_area as number);
        const [rMin, rMax] = [2, 16];
        const expected = sizes.map(s => (rMin + (rMax - rMin) * Math.sqrt(s / Math.max(...sizes))) ** 2);
        expect(sortNumbers(areas)).toEqual(sortNumbers(expected).map(v => expect.closeTo(v, 3)));
    });

    test('inverse direction: the inner disc covers the share of the bubble area', () => {
        const { plot, partials } = mount(bubble());
        const share: FeatureShare = { feature: 3, selectedUnits: 1, totalUnits: 4 };
        plot.setSelection([3], [share]);
        const bubbleRadius = Number(internals(plot).radiusOf(plot.instance['_data'][3]));
        expect(Number(partials()[0].getAttribute('r'))).toBeCloseTo(bubbleRadius * Math.sqrt(1 / 4));
    });

    test('a size attribute is required', () => {
        expect(() => mount(bubble(['shape_area', 'shape_leng']))).toThrow(/size/);
    });
});

describe('hexbin (partition into hexagons, N:1)', () => {
    const hexbin = (): UnifiedPlotConfig => ({
        type: 'hexbin',
        collection: regions(),
        attributes: { axis: ['shape_area', 'shape_leng'] },
        transform: { preset: 'binning-hex', options: { radius: 30 } },
        width: 480,
        height: 300,
        margins: { left: 40, right: 20, top: 30, bottom: 30 },
        events: [next.PlotEvent.CLICK],
    });

    test('every feature falls in exactly one hexagon, within its radius', () => {
        const { plot, rows } = mount(hexbin());
        const hexes = rows() as unknown as BinningHexRow[];
        const features = regions().features;
        expect(hexes.reduce((sum, h) => sum + h.count, 0)).toBe(features.length);
        expect(sortNumbers(hexes.flatMap(h => h.autkIds))).toEqual(features.map((_f, i) => i));

        // Points mapped to the drawing area, inset by one radius, lie inside their hexagon's circumcircle.
        const [w, h] = [480 - 60, 300 - 60];
        const xs = features.map(f => f.properties!.shape_area as number);
        const ys = features.map(f => f.properties!.shape_leng as number);
        for (const hex of hexes) {
            for (const id of hex.autkIds) {
                const px = 30 + (xs[id] - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)) * (w - 60);
                const py = 30 + (1 - (ys[id] - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys))) * (h - 60);
                expect(Math.hypot(px - hex.cx, py - hex.cy)).toBeLessThanOrEqual(30 + 1e-9);
            }
        }
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:1', '1:1', '1:1', 'N:1']);
        expectInverseMatchesAutkIds(plot, rows());
    });

    test('segregated view: the inner hexagon covers the selected fraction', () => {
        const { plot, partials, rows } = mount(hexbin());
        const { row, chosen } = splitFirstRow(plot, rows());
        const partial = partials().find(p => p.getAttribute('data-autk-provenance') === `mark:${plot.instance['rowIdOf'](row)}`)!;
        expect(units(partial)).toEqual([chosen.length, row.autkIds.length]);

        // Corner distance from the center is √f · radius.
        const hex = row as unknown as BinningHexRow;
        const [x, y] = partial.getAttribute('d')!.slice(1).split('L')[0].split(',').map(Number);
        expect(Math.hypot(x - hex.cx, y - hex.cy)).toBeCloseTo(30 * Math.sqrt(chosen.length / row.autkIds.length), 1);
    });
});

describe('hexbin and calendar colors', () => {
    const fills = (div: HTMLElement) => Array.from(div.querySelectorAll<SVGElement>('.autkMark')).map(m => m.style.fill);
    const channels = (fill: string) => fill.match(/\d+/g)!.map(Number);

    test('values are grey, never white or black, so the provenance color stands out', () => {
        const { div } = mount({
            type: 'hexbin',
            collection: regions(),
            attributes: { axis: ['shape_area', 'shape_leng'] },
            transform: { preset: 'binning-hex', options: { radius: 30 } },
        });
        for (const fill of fills(div)) {
            const [r, g, b] = channels(fill);
            expect(r === g && g === b).toBe(true);
            expect(r).toBeGreaterThan(40);
            expect(r).toBeLessThan(250);
        }
    });

    test('a configured colormap is kept', () => {
        const { div } = mount({
            type: 'calendar',
            collection: withEvents(),
            attributes: { axis: ['sjoin.collect.noise', '@transform'] },
            transform: { preset: 'binning-events', options: { timestamp: 'date' } },
            colorMapInterpolator: ColorMapInterpolator.SEQ_REDS,
        });
        expect(fills(div).some(fill => { const [r, g] = channels(fill); return r !== g; })).toBe(true);
    });
});

describe('calendar (unnest then partition, N:N)', () => {
    const calendar = (resolution?: 'day' | 'month'): UnifiedPlotConfig => ({
        type: 'calendar',
        collection: withEvents(),
        attributes: { axis: ['sjoin.collect.noise', '@transform'] },
        transform: { preset: 'binning-events', options: { timestamp: 'date', ...(resolution ? { resolution } : {}) } },
        events: [next.PlotEvent.CLICK],
    });

    test('one mark per day with events, in the row of its weekday', () => {
        const { div, plot, marks, rows } = mount(calendar());
        expect(marks()).toHaveLength(rows().length);
        const cell = internals(plot).cell;
        rows().forEach((row, index) => {
            const weekday = new Date(`${row.bucket}T00:00:00Z`).getUTCDay();
            expect(Number(marks()[index].getAttribute('y'))).toBeCloseTo(weekday * cell);
        });

        const days = rows().map(r => new Date(`${r.bucket}T00:00:00Z`).getTime());
        const span = (Math.max(...days) - Math.min(...days)) / 86400000 + 1;
        expect(div.querySelectorAll('.autk-calendar-day')).toHaveLength(span);
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['1:N', 'N:1', '1:1', 'N:N']);
        expectInverseMatchesAutkIds(plot, rows());
    });

    test('segregated view: a day fills the share of its events from the selection', () => {
        const { plot, partials, rows } = mount(calendar());
        const row = rows().find(r => r.autkIds.length >= 2)!;
        plot.setSelection([row.autkIds[0]]);
        const partial = partials().find(p => p.getAttribute('data-autk-provenance') === `mark:${plot.instance['rowIdOf'](row)}`)!;
        const [selected, total] = units(partial);
        expect(selected).toBeGreaterThan(0);
        expect(selected).toBeLessThan(total);
        const cell = internals(plot).cell;
        expect(Number(partial.getAttribute('width'))).toBeCloseTo(cell * Math.sqrt(selected / total));
    });

    test('other resolutions are rejected: cells are days', () => {
        expect(() => mount(calendar('month'))).toThrow(/daily buckets/);
    });
});

describe('waffle (partition, N:1, one square per unit)', () => {
    const waffle = (reducer: 'count' | 'sum' = 'count'): UnifiedPlotConfig => ({
        type: 'waffle',
        collection: regions(),
        attributes: { axis: ['landuse', '@transform'] },
        transform: { preset: 'binning-1d', options: reducer === 'count' ? {} : { reducer, value: 'shape_area' } },
        events: [next.PlotEvent.CLICK],
    });
    const featuresOf = (els: Element[]) => sortNumbers(els.map(el => Number(el.getAttribute('data-autk-feature'))));

    test('one square per feature, in the block of its land use, each block one mark', () => {
        const { plot, marks, rows } = mount(waffle());
        const features = regions().features;
        expect(featuresOf(marks())).toEqual(features.map((_f, i) => i));
        for (const mark of marks()) {
            const feature = Number(mark.getAttribute('data-autk-feature'));
            const row = (mark as unknown as { __data__: { label: string } }).__data__;
            expect(row.label).toBe(features[feature].properties!.landuse);
        }
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:1', '1:1', '1:1', 'N:1']);
        expectInverseMatchesAutkIds(plot, rows());
    });

    test('segregated view: exactly the squares of the selected features are painted', () => {
        const { plot, partials, rows } = mount(waffle());
        const { row, chosen } = splitFirstRow(plot, rows());
        expect(featuresOf(partials())).toEqual(sortNumbers(chosen));
        expect(units(partials()[0])).toEqual([chosen.length, row.autkIds.length]);
    });

    test('a click on any square selects its whole group', () => {
        const { div, plot } = mount(waffle());
        const square = div.querySelector('.autkMark')!;
        const row = (square as unknown as { __data__: { autkIds: number[] } }).__data__;
        square.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortNumbers(plot.selection)).toEqual(sortNumbers(row.autkIds));
    });

    test('only counts: each square is one feature', () => {
        expect(() => mount(waffle('sum'))).toThrow(/count reducer/);
    });
});
