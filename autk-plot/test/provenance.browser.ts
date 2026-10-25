/**
 * Provenance model: stages, relations, cardinalities, and contributions.
 *
 * Reproduces the e04 histogram-brush results inside the real `AutkPlot`, and
 * checks that the explicit relations agree with the `autkIds` the original
 * pipeline accumulates, for every transform preset.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotTransformConfig, ProvenancePair } from '../src';

import { loadGalleryCollection, withSyntheticEvents, withSyntheticSeries } from './fixtures';
import type { Collection } from './fixtures';

/** Builds source rows exactly as `PlotBaseData.buildSourceRows()` does. */
function sourceRows(collection: Collection): AutkDatum[] {
    return collection.features.map((feature, idx) => ({ ...(feature.properties ?? {}), autkIds: [idx] }));
}

/** Builds the provenance graph of a transform run, as `PlotBaseData` does. */
function modelOf(collection: Collection, config: PlotTransformConfig, columns: string[]) {
    const executed = next.run(sourceRows(collection), config, columns);
    const d0 = { name: 'D0', label: 'features', ids: collection.features.map((_f, i) => next.featureId(i)) };
    const { stages, relations, contributions, reducer, rowIds } = executed.provenance;
    return { executed, rowIds, model: new next.ProvenanceModel([d0, ...stages], relations, contributions, reducer) };
}

const featureIndices = (ids: string[]) => ids.map(id => Number(id.slice('feature:'.length))).sort((a, b) => a - b);

const histogram = (): next.UnifiedPlotConfig => ({
    type: 'barchart',
    collection: loadGalleryCollection('mnt_neighs_proj.geojson'),
    attributes: { axis: ['shape_area', '@transform'] },
    transform: { preset: 'binning-1d', options: { bins: 10 } },
    events: [next.PlotEvent.CLICK],
});

describe('e04 histogram-brush scenario inside AutkPlot', () => {
    const plot = new next.AutkPlot(document.createElement('div'), histogram());
    const { stages, cardinalities } = plot.provenance;

    test('stage sizes are D0 38, D1 10, D2 9, M 9', () => {
        expect(stages.map(stage => [stage.name, stage.ids.length])).toEqual([['D0', 38], ['D1', 10], ['D2', 9], ['M', 9]]);
    });

    test('feature 0 follows bin:4 → aggregate:4 → mark:aggregate:4', () => {
        expect(plot.provenance.direct([0]).map(step => step.ids)).toEqual([
            ['feature:0'], ['bin:4'], ['aggregate:4'], ['mark:aggregate:4'],
        ]);
    });

    test('mark 4 traces back to features 0, 7, 8, 10, 26, 29', () => {
        const path = plot.provenance.inverse(['mark:aggregate:4']);
        expect(path.map(step => step.stage)).toEqual(['M', 'D2', 'D1', 'D0']);
        expect(featureIndices(path[3].ids)).toEqual([0, 7, 8, 10, 26, 29]);
    });

    test('bin 8 belongs to D1 but has no aggregate', () => {
        expect(stages[1].ids).toContain('bin:8');
        expect(plot.provenance.relations[1].pairs.some(pair => pair.source === 'bin:8')).toBe(false);
    });

    test('cardinalities are N:1, 1:1, 1:1 and N:1 overall', () => {
        expect(cardinalities.map(c => `${c.source}→${c.target} ${c.cardinality}`)).toEqual([
            'D0→D1 N:1', 'D1→D2 1:1', 'D2→M 1:1', 'D0→M N:1',
        ]);
    });
});

const PRESETS: { name: string; collection: () => Collection; config: PlotTransformConfig; columns: string[] }[] = [
    { name: 'binning-1d', collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'), config: { preset: 'binning-1d', options: { bins: 10 } }, columns: ['shape_area'] },
    { name: 'binning-1d categorical', collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'), config: { preset: 'binning-1d' }, columns: ['landuse'] },
    { name: 'binning-2d', collection: () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson'), config: { preset: 'binning-2d', options: { binsX: 5 } }, columns: ['shape_area', 'landuse'] },
    { name: 'sort', collection: () => loadGalleryCollection('mnt_neighs_proj.geojson'), config: { preset: 'sort' }, columns: ['ntaname'] },
    { name: 'binning-events', collection: () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')), config: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month' } }, columns: ['sjoin.collect.noise'] },
    { name: 'reduce-series', collection: () => withSyntheticSeries(loadGalleryCollection('mnt_neighs_proj.geojson')), config: { preset: 'reduce-series' }, columns: ['series'] },
];

describe('explicit relations agree with accumulated autkIds', () => {
    test.each(PRESETS)('$name', ({ collection, config, columns }) => {
        const { executed, rowIds, model } = modelOf(collection(), config, columns);
        const path = (rowId: string) => model.inverse([rowId]);

        executed.rows.forEach((row, index) => {
            const steps = path(rowIds[index]);
            const d0 = steps[steps.length - 1].ids;
            expect(featureIndices(d0)).toEqual([...(row.autkIds ?? [])].sort((a, b) => a - b));
        });
    });
});

describe('cardinalities and multiplicity', () => {
    test('binning-events is 1:N then N:1, so features and buckets relate N:N', () => {
        const { model } = modelOf(withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
            { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month' } }, ['sjoin.collect.noise']);

        expect(model.cardinalities.map(c => c.cardinality)).toEqual(['1:N', 'N:1', 'N:N']);
    });

    test('composed weights count how many events a feature puts in each bucket', () => {
        // Yearly buckets gather all events of a feature, so weights above 1 occur.
        const { model } = modelOf(withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj.geojson')),
            { preset: 'binning-events', options: { timestamp: 'date', resolution: 'year' } }, ['sjoin.collect.noise']);

        const expected = new Map<string, number>();
        for (const unit of model.contributions) {
            const key = `${unit.source}|${unit.target}`;
            expected.set(key, (expected.get(key) ?? 0) + 1);
        }
        const composed = new Map(model.composed().map((pair: ProvenancePair) => [`${pair.source}|${pair.target}`, pair.weight]));

        expect(composed).toEqual(expected);
        expect(Math.max(...composed.values())).toBeGreaterThan(1);
    });

    test('a plot without transform is one-to-one from features to marks', () => {
        const plot = new next.AutkPlot(document.createElement('div'), {
            type: 'scatterplot',
            collection: loadGalleryCollection('mnt_neighs_proj.geojson'),
            attributes: { axis: ['shape_area', 'shape_leng'] },
        });
        expect(plot.provenance.cardinalities).toEqual([{ source: 'D0', target: 'M', cardinality: '1:1' }]);
    });
});

describe('contribution of a selection to a mark', () => {
    const rowOfFeature0 = 'aggregate:4';

    test('count: k selected units out of the bar count', () => {
        const { model } = modelOf(loadGalleryCollection('mnt_neighs_proj.geojson'), { preset: 'binning-1d', options: { bins: 10 } }, ['shape_area']);
        expect(model.contribution(rowOfFeature0, new Set([0]))).toEqual({ selectedUnits: 1, totalUnits: 6, value: 1, totalValue: 6, additive: true });
        expect(model.contribution(rowOfFeature0, new Set([0, 7, 99]))).toMatchObject({ selectedUnits: 2, value: 2 });
        expect(model.contribution(rowOfFeature0, new Set([1]))).toMatchObject({ selectedUnits: 0, value: null });
    });

    test('sum and avg apply the reducer to the selected units only', () => {
        const collection = loadGalleryCollection('mnt_neighs_proj.geojson');
        const lengths = [0, 7].map(i => Number(collection.features[i].properties!.shape_leng));
        const sum = modelOf(collection, { preset: 'binning-1d', options: { bins: 10, reducer: 'sum', value: 'shape_leng' } }, ['shape_area']).model;
        const avg = modelOf(collection, { preset: 'binning-1d', options: { bins: 10, reducer: 'avg', value: 'shape_leng' } }, ['shape_area']).model;

        expect(sum.contribution(rowOfFeature0, new Set([0, 7])).value).toBeCloseTo(lengths[0] + lengths[1]);
        expect(avg.contribution(rowOfFeature0, new Set([0, 7]))).toMatchObject({ additive: false });
        expect(avg.contribution(rowOfFeature0, new Set([0, 7])).value).toBeCloseTo((lengths[0] + lengths[1]) / 2);
    });
});

describe('segregated barchart', () => {
    const render = (config: Partial<next.UnifiedPlotConfig> = {}) => {
        const div = document.createElement('div');
        const plot = new next.AutkPlot(div, { ...histogram(), ...config });
        const bar = (mark: string) => div.querySelector<SVGRectElement>(`.autkMark[data-autk-provenance="${mark}"]`)!;
        const partials = () => Array.from(div.querySelectorAll<SVGRectElement>('.autkPartial'));
        const height = (node: Element) => Number(node.getAttribute('height'));
        return { div, plot, bar, partials, height };
    };

    test('an external selection colors only the contributed part of the bar', () => {
        const { plot, bar, partials, height } = render();
        plot.setSelection([0]);

        const [part] = partials();
        expect(partials()).toHaveLength(1);
        expect(part.getAttribute('data-autk-provenance')).toBe('mark:aggregate:4');
        expect(part.getAttribute('data-autk-units')).toBe('1/6');
        expect(height(part)).toBeCloseTo(height(bar('mark:aggregate:4')) / 6);
        expect(bar('mark:aggregate:4').style.fill).not.toBe(next.PlotStyle.highlight);
    });

    test('two selected features fill 2/6 and clearing removes the part', () => {
        const { plot, bar, partials, height } = render();
        plot.setSelection([0, 7]);
        expect(height(partials()[0])).toBeCloseTo(height(bar('mark:aggregate:4')) * 2 / 6);

        plot.setSelection([]);
        expect(partials()).toHaveLength(0);
    });

    test('selecting a whole bar locally keeps the whole-bar highlight', () => {
        const { div, partials } = render();
        div.querySelectorAll('.autkMark')[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(partials()).toHaveLength(0);
    });

    test('avg draws the subset statistic as a narrower inner bar', () => {
        const { plot, bar, partials } = render({
            transform: { preset: 'binning-1d', options: { bins: 10, reducer: 'avg', value: 'shape_leng' } },
        });
        plot.setSelection([0]);
        const width = (node: Element) => Number(node.getAttribute('width'));
        expect(width(partials()[0])).toBeCloseTo(width(bar('mark:aggregate:4')) / 2);
    });

    test('selections use the provenance color, on parts and on whole marks', () => {
        const hex = (color: string) => '#' + (color.match(/\d+/g) ?? []).map(n => Number(n).toString(16).padStart(2, '0')).join('');
        const segregated = render();
        segregated.plot.setSelection([0]);
        expect(hex(segregated.partials()[0].style.fill)).toBe(next.PlotStyle.provenance);

        const local = render();
        local.div.querySelectorAll('.autkMark')[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(hex(local.bar('mark:aggregate:4').style.fill)).toBe(next.PlotStyle.provenance);
    });
});
