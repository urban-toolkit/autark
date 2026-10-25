/**
 * Regression tests for the defects found in the independent review.
 *
 * Each test reproduces the reported failing scenario. Sankey shares per column
 * and per step (review item 8) are covered in `new-plots.test.ts`.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotEventData, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';
import type { Collection } from './fixtures';

/** Builds a collection of point features with the given properties. */
function collectionOf(properties: Record<string, unknown>[]): Collection {
    return {
        type: 'FeatureCollection',
        features: properties.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: p })),
    };
}

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const emitted: PlotEventData[] = [];
    plot.events.on(next.PlotEvent.CLICK, data => emitted.push(data));
    const click = (node: Element | undefined) => node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { div, plot, emitted, click };
}

const num = (node: Element | null | undefined, attr: string) => Number(node?.getAttribute(attr));

describe('review fixes', () => {
    test('1 · linechart with negative sums keeps every point inside the plot', () => {
        const height = 400;
        const margins = { left: 40, right: 20, top: 20, bottom: 40 };
        const { div, plot } = mount({
            type: 'linechart',
            collection: collectionOf([{ series: [-5, -3, -8] }, { series: [-1, -2, -4] }]),
            attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series', options: { reducer: 'sum' } },
            height,
            margins,
        });
        plot.setSelection([0]);
        const inner = height - margins.top - margins.bottom;
        for (const node of div.querySelectorAll('.autkMark, .autkPartial')) {
            expect(num(node, 'cy')).toBeGreaterThanOrEqual(0);
            expect(num(node, 'cy')).toBeLessThanOrEqual(inner);
        }
    });

    test('3 · avg inner bar of a subset never overflows the plot', () => {
        const height = 400;
        const margins = { left: 40, right: 20, top: 20, bottom: 40 };
        const { div, plot } = mount({
            type: 'barchart',
            collection: collectionOf([{ c: 'A', v: 1 }, { c: 'A', v: 9 }, { c: 'B', v: 6 }]),
            attributes: { axis: ['c', '@transform'] },
            transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'v' } },
            height,
            margins,
        });
        plot.setSelection([1]);
        const part = div.querySelector('.autkPartial')!;
        expect(num(part, 'y')).toBeGreaterThanOrEqual(0);
        expect(num(part, 'y') + num(part, 'height')).toBeLessThanOrEqual(height - margins.top - margins.bottom + 1e-6);
    });

    test('4 · flows keeps distinct links when labels contain "→"', () => {
        const result = next.run([{ a: 'A→B', b: 'C', autkIds: [0] }, { a: 'A', b: 'B→C', autkIds: [1] }], { preset: 'flows' }, ['a', 'b']);
        const links = (result.rows as next.FlowRow[]).filter((row): row is next.FlowLinkRow => row.kind === 'link');
        expect(links.map(l => [l.source, l.target, l.autkIds])).toEqual([
            ['0:A→B', '1:C', [0]],
            ['0:A', '1:B→C', [1]],
        ]);
    });

    test('5 · the gathered row never shares its label with a kept bar', () => {
        const { div, plot } = mount({
            type: 'barchart',
            collection: collectionOf([{ n: 'a', v: 5 }, { n: 'Others', v: 4 }, { n: 'c', v: 3 }, { n: 'd', v: 1 }]),
            attributes: { axis: ['n', 'v'] },
            topK: { k: 2, others: true },
        });
        const labels = (plot.instance['_data'] as unknown as AutkDatum[]).map(r => r.n);
        expect(new Set(labels).size).toBe(labels.length);
        const xs = Array.from(div.querySelectorAll('.autkMark')).map(n => n.getAttribute('x'));
        expect(new Set(xs).size).toBe(xs.length);
    });

    test('6 · others: "" gathers rows and makes the plot aggregated', () => {
        const { plot } = mount({
            type: 'barchart',
            collection: collectionOf([{ n: 'a', v: 9 }, { n: 'b', v: 7 }, { n: 'c', v: 1 }]),
            attributes: { axis: ['n', 'v'] },
            topK: { k: 1, others: '' },
        });
        expect(plot.instance['_selectionProjection']).toBe('aggregated');
        plot.setSelection([1]);
        expect(plot.provenance.contribution('top:others', new Set([1]))).toMatchObject({ selectedUnits: 1, totalUnits: 2 });
    });

    test('7 · filtering out every feature keeps a finite y axis', () => {
        const { div } = mount({
            type: 'barchart',
            collection: loadGalleryCollection('mnt_neighs_proj.geojson'),
            attributes: { axis: ['shape_area', '@transform'] },
            transform: { preset: 'binning-1d' },
            filter: { attribute: 'shape_area', op: '<', value: 0 },
        });
        expect(div.querySelectorAll('#axisY .tick').length).toBeGreaterThan(0);
    });

    test('7 · bars with no positive value keep a finite y axis', () => {
        const { div } = mount({
            type: 'barchart',
            collection: collectionOf([{ n: 'a', v: 0 }, { n: 'b', v: 0 }]),
            attributes: { axis: ['n', 'v'] },
        });
        const ticks = Array.from(div.querySelectorAll('#axisY .tick')).map(n => n.getAttribute('transform') ?? '');
        expect(ticks.length).toBeGreaterThan(1);
        expect(ticks.some(t => t.includes('NaN'))).toBe(false);
    });

    test('9 · cardinalities are computed once per draw', () => {
        const { plot } = mount({
            type: 'barchart',
            collection: loadGalleryCollection('mnt_neighs_proj.geojson'),
            attributes: { axis: ['shape_area', '@transform'] },
            transform: { preset: 'binning-1d' },
        });
        const first = plot.provenance.cardinalities;
        plot.setSelection([0]);
        expect(plot.provenance.cardinalities).toBe(first);
        plot.draw();
        expect(plot.provenance.cardinalities).not.toBe(first);
    });

    test('10 · a relation without pairs is classified as empty, not 1:1', () => {
        const { plot } = mount({
            type: 'linechart',
            collection: collectionOf([{ events: [] }, { events: [] }]),
            attributes: { axis: ['events', '@transform'] },
            transform: { preset: 'binning-events' },
        });
        expect(plot.provenance.cardinalities.every(c => c.cardinality === 'empty')).toBe(true);
        expect(next.cardinality([])).toBe('empty');
    });
});
