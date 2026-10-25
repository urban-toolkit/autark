/**
 * Exclusion (1:0) across the whole catalog.
 *
 * The filter runs before any transform, so it must work on every plot type:
 * an excluded feature has no mark, and the provenance path explains where and
 * why it was lost. Top-k, which needs a rankable value per row, works on the
 * barchart, the pie, and the donut.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotType, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const THRESHOLD = 10_000_000;
const collection = () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj_landuse.geojson'));
const areas = () => collection().features.map(f => f.properties!.shape_area as number);
const excluded = () => areas().flatMap((a, i) => a > THRESHOLD ? [] : [i]);
const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);

type Config = Omit<UnifiedPlotConfig, 'type' | 'collection'>;

/** A registered plot: one dot per row, drawn by user code. */
const DOTS: next.PlotDefinition = {
    name: 'filter-dots',
    draw({ group, rows }) {
        group.selectAll('circle').data(rows).join('circle')
            .attr('class', 'autkMark').attr('cx', (_r, i) => i * 3).attr('cy', 10).attr('r', 2);
    },
};
beforeAll(() => next.registerPlot(DOTS));
afterAll(() => next.unregisterPlot(DOTS.name));
const events = { axis: ['sjoin.collect.noise', '@transform'] };
const daily = { preset: 'binning-events' as const, options: { timestamp: 'date', resolution: 'day' as const } };

/** One configuration per plot type; the record type makes a new type without a case a type error. */
const CONFIGS: Record<PlotType, Config> = {
    scatterplot: { attributes: { axis: ['shape_area', 'shape_leng'] } },
    barchart: { attributes: { axis: ['shape_area', '@transform'] }, transform: { preset: 'binning-1d' } },
    'parallel-coordinates': { attributes: { axis: ['shape_area', 'shape_leng', 'landuse'] } },
    table: { attributes: { axis: ['ntaname', 'landuse'] } },
    linechart: { attributes: events, transform: { preset: 'binning-events', options: { timestamp: 'date' } } },
    heatmatrix: { attributes: { axis: ['shape_area', 'landuse'], color: '@transform' }, transform: { preset: 'binning-2d' } },
    boxplot: { attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'box-stats' } },
    sankey: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' } },
    pie: { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
    donut: { attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' } },
    areachart: { attributes: events, transform: { preset: 'binning-events', options: { timestamp: 'date' } } },
    bubble: { attributes: { axis: ['shape_area', 'shape_leng', 'shape_area'] } },
    hexbin: { attributes: { axis: ['shape_area', 'shape_leng'] }, transform: { preset: 'binning-hex', options: { radius: 24 } } },
    calendar: { attributes: events, transform: daily },
    waffle: { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
    stackedbar: { attributes: { axis: ['cdta2020', 'landuse'] }, transform: { preset: 'hierarchy' } },
    treemap: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' } },
    sunburst: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' } },
    radar: { attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] }, transform: { preset: 'fold' } },
    ecdf: { attributes: { axis: ['shape_leng'] }, transform: { preset: 'cumulative' } },
    pareto: { attributes: { axis: ['cdta2020'] }, transform: { preset: 'cumulative' } },
    chord: { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'flows' } },
    density: { attributes: { axis: ['shape_leng'] }, transform: { preset: 'density' } },
    violin: { attributes: { axis: ['landuse', 'shape_leng'] }, transform: { preset: 'density' } },
    registered: { plot: 'filter-dots', attributes: { axis: ['shape_area'] } },
};

function mount(type: PlotType, extra: Partial<UnifiedPlotConfig> = {}) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, {
        type,
        collection: collection(),
        events: [next.PlotEvent.CLICK],
        provenance: { path: 'open' },
        ...CONFIGS[type],
        ...extra,
    } as UnifiedPlotConfig);
    const markIds = () => new Set(Array.from(div.querySelectorAll('.autkMark'))
        .flatMap(m => (m as unknown as { __data__: AutkDatum }).__data__?.autkIds ?? []));
    const notes = () => Array.from(div.querySelectorAll('.autk-provenance-note')).map(n => n.textContent ?? '');
    return { div, plot, markIds, notes };
}

describe('filter on every plot type (exclusion, 1:0)', () => {
    const filter = { attribute: 'shape_area', op: '>' as const, value: THRESHOLD };

    for (const type of Object.keys(CONFIGS) as PlotType[]) {
        test(`${type}: excluded features have no mark, and the path says why`, () => {
            const gone = excluded();
            expect(gone.length).toBeGreaterThan(0);
            const { plot, markIds, notes } = mount(type, { filter });

            // No mark carries an excluded feature.
            const shown = markIds();
            for (const feature of gone) expect(shown.has(feature)).toBe(false);

            // The kept features form their own stage right after D0.
            expect(plot.provenance.stages[1]).toMatchObject({ name: 'D1', label: 'kept' });
            expect(plot.provenance.stages[1].ids).toHaveLength(areas().length - gone.length);

            // An excluded feature reaches no mark; selecting it explains where it was lost.
            const path = plot.provenance.direct([gone[0]]);
            expect(path[path.length - 1].ids).toHaveLength(0);
            plot.setSelection([gone[0]]);
            expect(notes()).toEqual([`1 feature excluded at D1 — filter: shape_area > ${THRESHOLD}`]);
        });
    }
});

describe('top-k on the pie and the donut (cut and gather)', () => {
    test('keeps the k largest slices and gathers the rest into one more slice', () => {
        for (const type of ['pie', 'donut'] as const) {
            // The pie groups by land use (3 categories), the donut by district: k = 2 leaves a rest in both.
            const { div, plot } = mount(type, { topK: { k: 2, others: 'Outras' } });
            const rows = plot.instance['_data'] as unknown as { label: string; value: number; autkIds: number[] }[];
            expect(rows).toHaveLength(3);
            expect(rows.map(r => r.label)).toContain('Outras');
            expect(rows.reduce((sum, r) => sum + r.value, 0)).toBe(areas().length);
            expect(sortNumbers(rows.flatMap(r => r.autkIds))).toEqual(areas().map((_a, i) => i));
            expect(div.querySelectorAll('.autkMark')).toHaveLength(3);
        }
    });

    test('a selection inside the gathered slice fills only its share of it', () => {
        const { div, plot } = mount('donut', { topK: { k: 3, others: 'Outras' } });
        const rows = plot.instance['_data'] as unknown as { label: string; autkIds: number[] }[];
        const others = rows.find(r => r.label === 'Outras')!;
        plot.setSelection([others.autkIds[0]]);
        const partial = div.querySelector(`.autkPartial[data-autk-provenance="mark:${plot.instance['rowIdOf'](others)}"]`)!;
        expect(partial.getAttribute('data-autk-units')).toBe(`1/${others.autkIds.length}`);
    });

    test('without a gathered slice, cut features have no slice and the path says why', () => {
        const { plot, notes } = mount('pie', { topK: { k: 1 } });
        const rows = plot.instance['_data'] as unknown as { autkIds: number[] }[];
        const kept = new Set(rows.flatMap(r => r.autkIds));
        const cut = areas().map((_a, i) => i).find(i => !kept.has(i))!;
        plot.setSelection([cut]);
        expect(notes()[0]).toMatch(/^1 aggregate excluded at D3 — top 1 by /);
    });

    test('plots without a rankable value per row reject top-k', () => {
        for (const type of ['treemap', 'stackedbar', 'waffle', 'hexbin'] as const) {
            expect(() => mount(type, { topK: { k: 2 } })).toThrow(/topK is not supported/);
        }
    });
});
