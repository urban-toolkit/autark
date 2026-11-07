/**
 * Filter (before the transform) and top-k (after it) as provenance stages.
 *
 * Both can leave source features without any mark (`1:0`); the provenance
 * path then explains where and why they were excluded.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const collection = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const areas = () => collection().features.map(f => f.properties!.shape_area as number);
const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
const featureIndices = (ids: string[]) => sortNumbers(ids.map(id => Number(id.slice('feature:'.length))));
const THRESHOLD = 10_000_000;

function mount(config: Partial<UnifiedPlotConfig>) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, { collection: collection(), provenance: { path: 'open' }, ...config } as UnifiedPlotConfig);
    const rows = () => plot.instance['_data'] as unknown as AutkDatum[];
    const partials = () => Array.from(div.querySelectorAll('.autkPartial'));
    const notes = () => Array.from(div.querySelectorAll('.autk-provenance-note')).map(n => n.textContent);
    return { div, plot, rows, partials, notes };
}

const histogram = (extra: Partial<UnifiedPlotConfig> = {}): Partial<UnifiedPlotConfig> => ({
    type: 'barchart',
    attributes: { axis: ['shape_area', '@transform'] },
    transform: { preset: 'binning-1d', options: { bins: 10 } },
    events: [next.PlotEvent.CLICK],
    ...extra,
});

describe('filter', () => {
    const filter = { attribute: 'shape_area', op: '>' as const, value: THRESHOLD };
    const kept = areas().map((a, i) => [a, i] as const).filter(([a]) => a > THRESHOLD).map(([, i]) => i);
    const excluded = areas().findIndex(a => a <= THRESHOLD);

    test('kept features form a stage before the transform stages', () => {
        const { plot } = mount(histogram({ filter }));
        const stages = plot.provenance.stages;
        expect(stages.map(s => [s.name, s.label])).toEqual([
            ['D0', 'features'], ['D1', 'kept'], ['D2', 'bins'], ['D3', 'aggregates'], ['M', 'marks'],
        ]);
        expect(stages[1].ids).toHaveLength(kept.length);
        expect(stages[1].note).toBe(`filter: shape_area > ${THRESHOLD}`);
        expect(plot.provenance.cardinalities[0]).toMatchObject({ source: 'D0', target: 'D1', cardinality: '1:1' });
    });

    test('bars only count kept features and trace back to them', () => {
        const { plot, rows } = mount(histogram({ filter }));
        const counted = rows().flatMap(row => row.autkIds ?? []);
        expect(sortNumbers(counted)).toEqual(kept);
        rows().forEach(row => {
            const path = plot.provenance.inverse([`mark:${plot.instance['rowIdOf'](row)}`]);
            expect(featureIndices(path[path.length - 1].ids)).toEqual(sortNumbers(row.autkIds ?? []));
        });
    });

    test('an excluded feature has no image; the path explains why', () => {
        const { plot, notes } = mount(histogram({ filter }));
        const path = plot.provenance.direct([excluded]);
        expect(path.map(step => step.ids.length)).toEqual([1, 0, 0, 0, 0]);
        expect(path[1]).toMatchObject({ dropped: 1, note: `filter: shape_area > ${THRESHOLD}` });

        plot.setSelection([excluded]);
        expect(notes()).toEqual([`1 feature excluded at D1 — filter: shape_area > ${THRESHOLD}`]);
    });

    test('works without a transform and with membership conditions', () => {
        const { plot, div } = mount({
            type: 'scatterplot',
            attributes: { axis: ['shape_area', 'shape_leng'] },
            filter: { attribute: 'landuse', op: 'in', value: ['Mixed'] },
        });
        const mixed = collection().features.filter(f => f.properties!.landuse === 'Mixed').length;
        expect(div.querySelectorAll('.autkMark')).toHaveLength(mixed);
        expect(plot.provenance.cardinalities.map(c => `${c.source}→${c.target} ${c.cardinality}`)).toEqual([
            'D0→D1 1:1', 'D1→M 1:1', 'D0→M 1:1',
        ]);
    });

    test('an unknown filter attribute is rejected', () => {
        expect(() => mount(histogram({ filter: { attribute: 'nope', op: '>', value: 1 } }))).toThrow(/filter attribute "nope"/);
    });
});

describe('top-k', () => {
    const bars = (others: boolean): Partial<UnifiedPlotConfig> => ({
        type: 'barchart',
        attributes: { axis: ['ntaname', 'shape_area'] },
        topK: { k: 5, others },
        events: [next.PlotEvent.CLICK],
    });
    const ranked = areas().map((a, i) => [a, i] as const).sort((x, y) => y[0] - x[0]);
    const top = sortNumbers(ranked.slice(0, 5).map(([, i]) => i));
    const rest = ranked.slice(5).map(([, i]) => i);

    test('keeps the 5 largest bars in original order and gathers the rest into Others', () => {
        const { plot, rows } = mount(bars(true));
        expect(rows()).toHaveLength(6);
        expect(rows().slice(0, 5).map(r => r.autkIds![0])).toEqual(top);

        const others = rows()[5];
        expect(others.ntaname).toBe('Others');
        expect(sortNumbers(others.autkIds!)).toEqual(sortNumbers(rest));
        expect(others.shape_area).toBeCloseTo(rest.reduce((acc, i) => acc + areas()[i], 0));

        const last = plot.provenance.stages[plot.provenance.stages.length - 2];
        expect(last).toMatchObject({ label: 'top 5', note: 'top 5 by shape_area, rest in "Others"' });
        expect(plot.provenance.cardinalities.find(c => c.target === last.name)?.cardinality).toBe('N:1');
    });

    test('a selection of gathered features fills only their share of the Others bar', () => {
        const { plot, partials } = mount(bars(true));
        plot.setSelection(rest.slice(0, 2));
        expect(partials()).toHaveLength(1);
        expect(partials()[0].getAttribute('data-autk-provenance')).toBe('mark:top:others');
        expect(partials()[0].getAttribute('data-autk-units')).toBe(`2/${rest.length}`);
    });

    test('without Others, cut rows have no image and the path explains why', () => {
        const { plot, notes, rows } = mount(histogram({ topK: { k: 3 } }));
        expect(rows()).toHaveLength(3);
        const shown = new Set(rows().flatMap(r => r.autkIds ?? []));
        const cut = areas().findIndex((_a, i) => !shown.has(i));

        plot.setSelection([cut]);
        const path = plot.provenance.direct([cut]);
        expect(path[path.length - 2]).toMatchObject({ dropped: 1, note: 'top 3 by value' });
        expect(notes()).toEqual([`1 aggregate excluded at ${path[path.length - 2].stage} — top 3 by value`]);
    });

    test('filter and top-k compose: D0 → kept → bins → aggregates → top → M', () => {
        const { plot } = mount(histogram({ filter: { attribute: 'shape_area', op: '>', value: THRESHOLD }, topK: { k: 3, others: true } }));
        expect(plot.provenance.stages.map(s => s.label)).toEqual(['features', 'kept', 'bins', 'aggregates', 'top 3', 'marks']);
    });

    test('top-k is rejected by plots without a rankable value axis', () => {
        expect(() => mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, topK: { k: 3 } })).toThrow(/topK/);
    });
});
