/**
 * User-defined transforms: the contract, the registry, and the validator.
 *
 * A registered transform declares its rows and their provenance; every plot
 * that reads its row shape then gets the segregated view, the provenance path,
 * and inverse shares without changes. The validator enforces the invariants
 * those features rely on, and the built-in presets pass it too.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotEventData, PlotTransformConfig, TransformDefinition, UnifiedPlotConfig } from '../src';

import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { loadGalleryCollection, withSyntheticEvents, withSyntheticSeries } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const withEvents = () => withSyntheticEvents(regions());
const events = { axis: ['sjoin.collect.noise', '@transform'] };
const MA = { preset: 'registered' as const, name: 'moving-average', options: { timestamp: 'date', halfWindow: 3 } };
const DAY = 24 * 60 * 60 * 1000;

/** A category-value transform built from the public provenance blocks: regions by the initial of their name. */
const byInitial: TransformDefinition = {
    name: 'by-initial',
    shape: 'category-value',
    run(rows, _options, columns) {
        const attr = columns[0] ?? 'ntaname';
        const buckets = next.collectBuckets({
            rows,
            bucketOf: row => String(row[attr] ?? '').charAt(0).toUpperCase() || null,
            // Counting: no value per row (see collectBuckets on valueOf).
            valueOf: undefined,
            reducer: 'count',
        });
        const keys = buckets.map(b => b.key);
        return {
            rows: buckets.map(b => ({ label: b.key, value: b.value, autkIds: b.autkIds })) as AutkDatum[],
            provenance: next.binnedProvenance({ rows, buckets, bins: next.indexedBins(keys, keys, 'initial'), binLabel: 'initials', rowKeys: keys, reducer: 'count' }),
        };
    },
};

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const rows = () => plot.instance['_data'] as unknown as Array<Record<string, unknown> & { autkIds: number[] }>;
    const rowId = (row: unknown) => plot.instance['rowIdOf'](row) as string;
    const partialOf = (row: unknown) => Array.from(div.querySelectorAll('.autkPartial'))
        .find(p => p.getAttribute('data-autk-provenance') === `mark:${rowId(row)}`) ?? null;
    return { div, plot, rows, rowId, partialOf };
}

beforeEach(() => {
    next.registerTransform(movingAverage);
    next.registerTransform(byInitial);
});
afterEach(() => {
    next.unregisterTransform(movingAverage.name);
    next.unregisterTransform(byInitial.name);
});

describe('registry', () => {
    test('a name can be registered once; unknown names and shapes are rejected clearly', () => {
        expect(() => next.registerTransform(movingAverage)).toThrow(/already registered/);
        expect(() => next.registerTransform({ ...byInitial, name: 'x', shape: 'matrix' as never })).toThrow(/unknown row shape/);
        expect(() => next.registerTransform({ ...byInitial, name: ' ' })).toThrow(/non-empty name/);
        expect(() => mount({ type: 'linechart', collection: withEvents(), attributes: events, transform: { ...MA, name: 'nope' } })).toThrow(/No transform is registered as "nope"/);
    });

    test('plots accept only the row shapes they can read', () => {
        expect(() => mount({ type: 'barchart', collection: withEvents(), attributes: events, transform: MA })).toThrow(/binning-1d/);
        expect(() => mount({ type: 'linechart', collection: regions(), attributes: { axis: ['ntaname'] }, transform: { preset: 'registered', name: 'by-initial' } })).toThrow(/reduce-series and binning-events/);
    });
});

describe('a transform registered outside the core: moving average', () => {
    test('honors the contract', () => {
        expect(next.checkTransform(movingAverage, withEvents(), MA.options, ['sjoin.collect.noise'])).toEqual([]);
    });

    test('each day averages the events of its 7-day window', () => {
        const { rows } = mount({ type: 'linechart', collection: withEvents(), attributes: events, transform: MA });
        const dates = withEvents().features.flatMap(f => (f.properties!.sjoin.collect.noise as { date: string }[]).map(e => Math.floor(new Date(e.date).getTime() / DAY)));
        const first = Math.min(...dates);
        expect(rows()).toHaveLength(Math.max(...dates) - first + 1);
        rows().forEach((row, k) => {
            const day = first + k;
            const expected = dates.filter(d => Math.abs(d - day) <= 3).length / 7;
            expect(row.y).toBeCloseTo(expected, 12);
        });
    });

    test('the area chart gets the segregated view with no change to the plot', () => {
        const { div, plot } = mount({ type: 'areachart', collection: withEvents(), attributes: events, transform: MA });
        plot.setSelection([0, 1, 2]);
        expect(div.querySelector('.autkPartialArea')).not.toBeNull();
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['1:N', 'N:N', '1:1', 'N:N']);
    });

    test('a selected day covers each region by the exact share of its event weight', () => {
        const { div, plot, rows, rowId } = mount({ type: 'linechart', collection: withEvents(), attributes: events, transform: MA, events: [next.PlotEvent.CLICK] });
        const emitted: PlotEventData[] = [];
        plot.events.on(next.PlotEvent.CLICK, data => emitted.push(data));
        const marks = Array.from(div.querySelectorAll('.autkMark'));
        const index = rows().findIndex(r => r.autkIds.length > 0);
        marks[index].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // A region's share: events within 3 days of the selected day, over all its spread inside the range.
        const day = Math.floor(new Date(`2024-${rows()[index].label}T00:00:00Z`).getTime() / DAY);
        for (const share of emitted[0].shares!) {
            const own = (withEvents().features[share.feature].properties!.sjoin.collect.noise as { date: string }[])
                .map(e => Math.floor(new Date(e.date).getTime() / DAY));
            const inWindow = own.filter(d => Math.abs(d - day) <= 3).length;
            expect(share.selectedUnits / share.totalUnits).toBeGreaterThan(0);
            expect(share.selectedUnits).toBeCloseTo(inWindow / 7, 12);
        }
        expect(rowId(rows()[index])).toMatch(/^day:/);
    });
});

describe('a transform built from the public blocks: regions by initial', () => {
    const initial = (type: 'barchart' | 'pie'): UnifiedPlotConfig => ({
        type,
        collection: regions(),
        attributes: { axis: ['ntaname', '@transform'] },
        transform: { preset: 'registered', name: 'by-initial' },
        events: [next.PlotEvent.CLICK],
    });

    test('honors the contract and draws in the barchart and the pie', () => {
        expect(next.checkTransform(byInitial, regions(), {}, ['ntaname'])).toEqual([]);
        for (const type of ['barchart', 'pie'] as const) {
            const { div, rows } = mount(initial(type));
            expect(div.querySelectorAll('.autkMark')).toHaveLength(rows().length);
        }
    });

    test('a slice fills the selected fraction, as with a built-in preset', () => {
        const { plot, rows, partialOf } = mount(initial('pie'));
        const row = rows().find(r => r.autkIds.length >= 2)!;
        plot.setSelection([row.autkIds[0]]);
        expect(partialOf(row)!.getAttribute('data-autk-units')).toBe(`1/${row.autkIds.length}`);
    });
});

describe('the validator catches each broken invariant', () => {
    /** Runs the moving average and lets a test break its output. */
    const broken = (name: string, edit: (out: ReturnType<TransformDefinition['run']>) => void): TransformDefinition => ({
        name,
        shape: 'series',
        run: (rows, options, columns) => {
            const out = movingAverage.run(rows, options, columns);
            edit(out);
            return out;
        },
    });
    const check = (definition: TransformDefinition) => next.checkTransform(definition, withEvents(), MA.options, ['sjoin.collect.noise']).join('\n');

    test('row ids not aligned with rows', () => {
        expect(check(broken('a', out => { out.provenance.rowIds.pop(); }))).toMatch(/ids for \d+ rows/);
    });
    test('a stage out of order', () => {
        expect(check(broken('b', out => { out.provenance.stages[0].name = 'D7'; }))).toMatch(/named "D7", expected "D1"/);
    });
    test('a pair pointing to an unknown id', () => {
        expect(check(broken('c', out => { out.provenance.relations[1].pairs[0].target = 'day:nowhere'; }))).toMatch(/unknown target "day:nowhere"/);
    });
    test('a negative weight', () => {
        expect(check(broken('d', out => { out.provenance.relations[1].pairs[0].weight = -1; }))).toMatch(/weight -1/);
    });
    test('relations that do not lead back to the autkIds of a row', () => {
        expect(check(broken('e', out => { (out.rows.find(r => (r.autkIds?.length ?? 0) > 1)!.autkIds as number[]).pop(); }))).toMatch(/relations lead back to/);
    });
    test('units that do not add up to the row value', () => {
        expect(check(broken('f', out => { (out.rows[0] as Record<string, unknown>).value = 99; }))).toMatch(/has value 99, but its units sum to/);
    });

    test('plots refuse a malformed output at once, instead of drawing wrong marks', () => {
        next.registerTransform(broken('malformed', out => { out.provenance.rowIds.pop(); }));
        try {
            expect(() => mount({ type: 'linechart', collection: withEvents(), attributes: events, transform: { preset: 'registered', name: 'malformed', options: MA.options } }))
                .toThrow(/Transform "malformed": provenance.rowIds must have one id per row/);
        } finally {
            next.unregisterTransform('malformed');
        }
    });
});

describe('public building blocks', () => {
    test('collectBuckets counts when valueOf is left out, as plain JavaScript callers do', () => {
        const rows = [{ k: 'a', autkIds: [0] }, { k: 'a', autkIds: [1] }, { k: 'b', autkIds: [2] }];
        const options = { rows, bucketOf: (row: { k?: unknown }) => String(row.k), reducer: 'count' } as unknown as Parameters<typeof next.collectBuckets>[0];
        expect(next.collectBuckets(options).map(b => [b.key, b.value])).toEqual([['a', 2], ['b', 1]]);
    });
});

describe('conformance: every built-in preset honors the same contract', () => {
    const series = () => withSyntheticSeries(withEvents());
    const cases: [string, PlotTransformConfig, string[], () => ReturnType<typeof regions>][] = [
        ['binning-1d (numeric)', { preset: 'binning-1d' }, ['shape_area'], regions],
        ['binning-1d (categories, sum)', { preset: 'binning-1d', options: { reducer: 'sum', value: 'shape_leng' } }, ['landuse'], regions],
        ['binning-2d', { preset: 'binning-2d' }, ['shape_area', 'landuse'], regions],
        ['binning-events', { preset: 'binning-events', options: { timestamp: 'date' } }, ['sjoin.collect.noise'], withEvents],
        ['reduce-series', { preset: 'reduce-series' }, ['series'], series],
        ['sort', { preset: 'sort' }, ['shape_area'], regions],
        ['box-stats', { preset: 'box-stats' }, ['landuse', 'shape_area'], regions],
        ['flows', { preset: 'flows' }, ['ntatype', 'landuse', 'cdta2020'], regions],
        ['binning-hex', { preset: 'binning-hex', options: { radius: 24 } }, ['shape_area', 'shape_leng'], regions],
        ['hierarchy', { preset: 'hierarchy' }, ['landuse', 'cdta2020'], regions],
        ['cumulative (numeric)', { preset: 'cumulative' }, ['shape_area'], regions],
        ['cumulative (Pareto)', { preset: 'cumulative', options: { order: 'value' } }, ['cdta2020'], regions],
        ['fold', { preset: 'fold' }, ['landuse', 'shape_area', 'shape_leng'], regions],
        ['density', { preset: 'density' }, ['shape_leng'], regions],
        ['density (groups)', { preset: 'density' }, ['landuse', 'shape_leng'], regions],
    ];

    for (const [label, config, columns, collection] of cases) {
        test(label, () => {
            const rows = collection().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];
            const result = next.run(rows, config, columns);
            expect(next.checkProvenance(rows.length, result.rows as AutkDatum[], result.provenance)).toEqual([]);
        });
    }
});
