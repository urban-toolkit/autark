import { describe, expect, it } from 'vitest';
import type { Feature } from 'geojson';
import { featureId, markId, ProvenanceModel } from '../src/provenance';
import { checkProvenance } from '../src/provenance/validate';
import { resolveSeries } from '../src/series';
import { matchesFilter } from '../src/transforms/filter';
import { runGroupedReduceSeries } from '../src/transforms/grouped-reduce-series';

const baseline = 'Baseline: north';
const proposal = 'Proposal "B"';
const month = '2025-02';
const source = [
    { scenario: baseline, keep: 1, value: 10 },
    { scenario: proposal, keep: 0, value: 999 },
    { scenario: proposal, keep: 1, value: 20 },
    { scenario: baseline, keep: 1, value: 14 },
    { scenario: proposal, keep: 0, value: 999 },
    { scenario: proposal, keep: 1, value: 24 },
    { scenario: 'Removed', keep: 0, value: 999 },
];
const features = source.map(({ scenario, keep, value }): Feature => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { scenario, keep, monthly: [{ timestamp: month, value }] },
}));
const rows = features.map(({ properties }, i) => ({ ...properties, autkIds: [i] }));
const kept = rows.filter(row => matchesFilter(row, [{ attribute: 'keep', op: '==', value: 1 }]));
const { groups } = resolveSeries('scenario', features, kept);

describe('Grouped reduce-series', () => {
    it('reduces shared buckets independently and preserves the original contributors', () => {
        const result = runGroupedReduceSeries(groups, { reducer: 'avg' }, ['monthly']);
        expect(result.rows).toEqual([
            { bucket: month, count: 2, value: 12, autkIds: [0, 3] },
            { bucket: month, count: 2, value: 22, autkIds: [2, 5] },
        ]);
        expect(result.groups.map(group => [group.key, group.color, group.rows.length])).toEqual(
            groups.map(group => [group.key, group.color, group.rows.length === 0 ? 0 : 1]),
        );
        expect(result.groups[0].rows[0]).toBe(result.rows[0]);
        expect(result.groups[1].rows[0]).toBe(result.rows[1]);

        const { stages, relations, contributions, reducer, rowIds } = result.provenance;
        expect(reducer).toBe('avg');
        expect(stages.map(stage => [stage.name, stage.label, stage.ids.length])).toEqual([
            ['D1', 'series points', 4], ['D2', 'buckets', 2],
        ]);
        expect(new Set(rowIds).size).toBe(2);
        expect(checkProvenance(features.length, result.rows, result.provenance)).toEqual([]);
        expect(contributions.filter(unit => unit.target === rowIds[0]).map(unit => unit.source)).toEqual(['feature:0', 'feature:3']);
        expect(contributions.filter(unit => unit.target === rowIds[1]).map(unit => unit.source)).toEqual(['feature:2', 'feature:5']);

        const model = new ProvenanceModel(
            [{ name: 'D0', label: 'features', ids: features.map((_, i) => featureId(i)) }, ...stages],
            relations, contributions, reducer,
        );
        model.registerMarks(rowIds);
        expect(model.inverse([markId(rowIds[0])]).at(-1)?.ids).toEqual(['feature:0', 'feature:3']);
        expect(model.inverse([markId(rowIds[1])]).at(-1)?.ids).toEqual(['feature:2', 'feature:5']);
        expect(model.direct([1, 4]).at(-1)?.ids).toEqual([]);
        expect(model.contribution(rowIds[1], new Set([0, 5]))).toMatchObject({
            selectedUnits: 1, totalUnits: 2, value: 24, totalValue: 22, additive: false,
        });
    });

    it('keeps row and point IDs stable when other groups or features are filtered out', () => {
        const full = runGroupedReduceSeries(groups, {}, ['monthly']);
        const { groups: filtered } = resolveSeries('scenario', features, kept.filter(row => row.autkIds[0] === 5));
        const partial = runGroupedReduceSeries([...filtered].reverse(), {}, ['monthly']);
        expect(partial.provenance.rowIds).toEqual([full.provenance.rowIds[1]]);
        expect(partial.provenance.relations[0].pairs).toEqual(full.provenance.relations[0].pairs.filter(pair => pair.source === 'feature:5'));
        expect(partial.rows[0]).toMatchObject({ bucket: month, value: 24, autkIds: [5] });
    });

    it('retains the transform shape and reducer when no group yields any points', () => {
        const { groups: noneKept } = resolveSeries('scenario', features, []);
        for (const input of [[], noneKept, [{ ...groups[0], rows: [{ autkIds: [0], monthly: [] }] }]]) {
            const { rows: output, groups: outputGroups, provenance } = runGroupedReduceSeries(input, { reducer: 'sum' }, ['monthly']);
            expect(output).toEqual([]);
            expect(outputGroups.map(group => group.rows)).toEqual(input.map(() => []));
            expect(provenance.stages.map(stage => [stage.name, stage.ids])).toEqual([['D1', []], ['D2', []]]);
            expect(provenance.relations).toEqual([
                { source: 'D0', target: 'D1', pairs: [] }, { source: 'D1', target: 'D2', pairs: [] },
            ]);
            expect(provenance).toMatchObject({ rowIds: [], contributions: [], reducer: 'sum' });
            expect(checkProvenance(features.length, output, provenance)).toEqual([]);
        }
    });
});
