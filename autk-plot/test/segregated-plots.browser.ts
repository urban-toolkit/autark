/**
 * Segregated view on every plot type.
 *
 * Direct direction (N:1, N:N): an external selection of features fills only
 * their part of each aggregated mark. Inverse direction (1:N): a selection of
 * aggregated marks sends the share of each feature it covers, and one-to-one
 * plots fill only that share of each feature's mark.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { FeatureShare, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const number = (node: Element | null | undefined, attribute: string) => Number(node?.getAttribute(attribute));

/** Builds a plot in a detached div and returns DOM helpers. */
function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const partials = () => Array.from(div.querySelectorAll('.autkPartial'));
    const mark = (id: string) => div.querySelector(`.autkMark[data-autk-provenance="${id}"]`);
    return { div, plot, partials, mark };
}

const linechart = (resolution: 'month' | 'year' = 'month'): UnifiedPlotConfig => ({
    type: 'linechart',
    collection: withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
    attributes: { axis: ['sjoin.collect.noise', '@transform'] },
    transform: { preset: 'binning-events', options: { timestamp: 'date', resolution } },
    events: [next.PlotEvent.CLICK],
});

describe('heatmatrix (N:1)', () => {
    const heatmatrix = (reducer: 'count' | 'avg' = 'count'): UnifiedPlotConfig => ({
        type: 'heatmatrix',
        collection: loadGalleryCollection('mnt_neighs_proj_landuse.geojson'),
        attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
        transform: { preset: 'binning-2d', options: { binsX: 5, reducer, value: 'shape_leng' } },
    });

    test('count: inner square covers the selected fraction of the cell area', () => {
        const { plot, partials, mark } = mount(heatmatrix());
        const cell = plot.provenance.direct([0])[2].ids[0];
        const { totalUnits } = plot.provenance.contribution(cell, new Set([0]));
        plot.setSelection([0]);

        const [square] = partials();
        const cellNode = mark(`mark:${cell}`);
        expect(partials()).toHaveLength(1);
        expect(square.getAttribute('data-autk-units')).toBe(`1/${totalUnits}`);
        const areaRatio = (number(square, 'width') * number(square, 'height')) / (number(cellNode, 'width') * number(cellNode, 'height'));
        expect(areaRatio).toBeCloseTo(1 / totalUnits);
    });

    test('avg: half-size inner square colored by the subset value', () => {
        const { plot, partials, mark } = mount(heatmatrix('avg'));
        const cell = plot.provenance.direct([0])[2].ids[0];
        plot.setSelection([0]);

        const [square] = partials();
        expect(number(square, 'width')).toBeCloseTo(number(mark(`mark:${cell}`), 'width') / 2);
        expect((square as SVGElement).style.fill).not.toBe('');
    });
});

describe('linechart (N:N)', () => {
    test('the subset line holds the selected feature events per bucket', () => {
        const { plot, div, partials } = mount(linechart());
        plot.setSelection([3]);

        const buckets = plot.provenance.direct([3])[2].ids;
        expect(div.querySelector('.autkPartialLine')).not.toBeNull();
        expect(partials().map(p => p.getAttribute('data-autk-provenance')).sort()).toEqual(buckets.map(id => `mark:${id}`).sort());
        for (const node of partials()) {
            const id = node.getAttribute('data-autk-provenance')!.slice('mark:'.length);
            const part = plot.provenance.contribution(id, new Set([3]));
            expect(node.getAttribute('data-autk-units')).toBe(`${part.selectedUnits}/${part.totalUnits}`);
        }
    });

    test('count parts fit inside the plot: the y axis starts at 0', () => {
        const { plot, partials } = mount(linechart());
        plot.setSelection(Array.from({ length: 13 }, (_, i) => i));

        // Parts with different values must sit at different heights, not clamped at the bottom.
        const heights = new Set(partials().map(p => number(p, 'cy').toFixed(3)));
        expect(heights.size).toBeGreaterThan(1);
    });

    test('a feature with many events in one bucket weighs that many units', () => {
        // Feature 3 has four synthetic events, all in 2024.
        const { plot, partials } = mount(linechart('year'));
        plot.setSelection([3]);
        const total = plot.provenance.contribution('bucket:2024', new Set([3])).totalUnits;
        expect(partials()[0].getAttribute('data-autk-units')).toBe(`4/${total}`);
    });

    test('clicking a bucket emits the share of each feature it covers', () => {
        const { div, plot } = mount(linechart());
        const emitted: { selection: number[]; shares?: FeatureShare[] }[] = [];
        plot.events.on(next.PlotEvent.CLICK, (data) => emitted.push(data));

        div.querySelectorAll('.autkMark')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const { selection, shares } = emitted[0];
        expect(shares!.map(s => s.feature).sort((a, b) => a - b)).toEqual([...selection].sort((a, b) => a - b));
        for (const share of shares!) {
            const events = plot.provenance.contributions.filter(u => u.source === `feature:${share.feature}`).length;
            expect(share.totalUnits).toBe(events);
            expect(share.selectedUnits).toBeGreaterThan(0);
        }
        expect(shares!.some(s => s.selectedUnits < s.totalUnits)).toBe(true);
    });
});

describe('one-to-one plots receiving shares (1:N inverse direction)', () => {
    const shares: FeatureShare[] = [
        { feature: 0, selectedUnits: 1, totalUnits: 4 },
        { feature: 3, selectedUnits: 3, totalUnits: 3 },
    ];
    const ids = shares.map(s => s.feature);
    const collection = () => loadGalleryCollection('mnt_neighs_proj.geojson');

    test('scatterplot: inner disc area is the share of the point', () => {
        const { plot, partials } = mount({ type: 'scatterplot', collection: collection(), attributes: { axis: ['shape_area', 'shape_leng'] } });
        plot.setSelection(ids, shares);

        const radius = (id: string) => number(partials().find(p => p.getAttribute('data-autk-provenance') === id), 'r');
        expect(radius('mark:feature:0')).toBeCloseTo(5 * Math.sqrt(1 / 4));
        expect(radius('mark:feature:3')).toBeCloseTo(5);
    });

    test('scatterplot without shares keeps the whole-point highlight', () => {
        const { plot, partials } = mount({ type: 'scatterplot', collection: collection(), attributes: { axis: ['shape_area', 'shape_leng'] } });
        plot.setSelection(ids);
        expect(partials()).toHaveLength(0);
    });

    test('barchart: one-to-one bar filled up to the share', () => {
        const { plot, partials, mark } = mount({ type: 'barchart', collection: collection(), attributes: { axis: ['ntaname', 'shape_area'] } });
        plot.setSelection(ids, shares);

        const part = partials().find(p => p.getAttribute('data-autk-provenance') === 'mark:feature:0');
        expect(number(part, 'height')).toBeCloseTo(number(mark('mark:feature:0'), 'height') / 4);
    });

    test('table: covered rows pinned to the top and filled up to the share', () => {
        const { div, plot } = mount({ type: 'table', collection: collection(), attributes: { axis: ['ntaname', 'shape_area'] } });
        plot.setSelection(ids, shares);

        const rows = Array.from(div.querySelectorAll<HTMLTableRowElement>('tbody tr'));
        expect(rows.slice(0, 2).map(r => r.getAttribute('data-autk-units')).sort()).toEqual(['1/4', '3/3']);
        expect(rows.find(r => r.getAttribute('data-autk-units') === '1/4')!.style.backgroundImage).toMatch(/ 25(\.0+)?%/);
    });

    test('parallel coordinates: overlay covers the share of the polyline length', () => {
        const { plot, partials } = mount({ type: 'parallel-coordinates', collection: collection(), attributes: { axis: ['shape_area', 'shape_leng'] } });
        plot.setSelection(ids, shares);

        const dash = (id: string) => partials().find(p => p.getAttribute('data-autk-provenance') === id)?.getAttribute('stroke-dasharray');
        expect(dash('mark:feature:0')).toBe('0.25 1');
        expect(dash('mark:feature:3')).toBe('1 1');
    });
});

describe('linked views end to end', () => {
    test('a bucket clicked in the linechart fills only the covered share of each scatter point', () => {
        const line = mount(linechart());
        const scatter = mount({
            type: 'scatterplot',
            collection: withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
            attributes: { axis: ['shape_area', 'shape_leng'] },
        });
        line.plot.events.on(next.PlotEvent.CLICK, ({ selection, shares }) => scatter.plot.setSelection(selection, shares));

        line.div.querySelectorAll('.autkMark')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const units = scatter.partials().map(p => p.getAttribute('data-autk-units'));
        expect(units.length).toBe(line.plot.selection.length);
        expect(units.some(u => { const [k, n] = u!.split('/').map(Number); return k < n; })).toBe(true);
    });
});
