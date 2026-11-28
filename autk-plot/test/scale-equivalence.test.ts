/**
 * The provenance queries, rewritten to scale to a million units, return
 * exactly what the original implementations returned, in the same order.
 *
 * Each reference below is the original code, kept verbatim in spirit:
 * JSON keys, a copy of the relation per inverse step, one id string per
 * selected feature. Random models cover fractional weights, unit groups,
 * several stages, rows of several stages, and selections of every size.
 */

import { describe, expect, test } from 'vitest';

import { ProvenanceModel, cardinality, compose, featureId, image, markId, transpose } from '../src';
import { reduceUnits } from '../src/provenance/model';
import { preimage } from '../src/provenance/relations';
import type { ProvenanceContribution, ProvenancePair, ProvenanceRelation, ProvenanceStage } from '../src/types-provenance';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- References: the original implementations ------------------------------

function composeReference(first: ProvenancePair[], second: ProvenancePair[]): ProvenancePair[] {
    const bySource = new Map<string, ProvenancePair[]>();
    for (const pair of second) {
        const list = bySource.get(pair.source) ?? [];
        list.push(pair);
        bySource.set(pair.source, list);
    }
    const composed = new Map<string, ProvenancePair>();
    for (const a of first) {
        for (const b of bySource.get(a.target) ?? []) {
            const key = JSON.stringify([a.source, b.target]);
            const existing = composed.get(key);
            if (existing) existing.weight += a.weight * b.weight;
            else composed.set(key, { source: a.source, target: b.target, weight: a.weight * b.weight });
        }
    }
    return Array.from(composed.values());
}

type Reducer = 'count' | 'sum' | 'avg' | 'min' | 'max';

function reduceReference(units: ProvenanceContribution[], reducer: Reducer): number | null {
    if (units.length === 0) return null;
    const values = units.map(unit => unit.value);
    if (reducer === 'count') return units.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    if (reducer === 'sum') return sum;
    if (reducer === 'avg') return sum / values.length;
    if (reducer === 'min') return Math.min(...values);
    return Math.max(...values);
}

function contributionReference(contributions: ProvenanceContribution[], reducer: Reducer, rowId: string, selected: ReadonlySet<number>) {
    const units = contributions.filter(unit => unit.target === rowId);
    const selectedIds = new Set(Array.from(selected, featureId));
    const chosen = units.filter(unit => selectedIds.has(unit.source));
    return {
        selectedUnits: chosen.length,
        totalUnits: units.length,
        value: reduceReference(chosen, reducer),
        totalValue: reduceReference(units, reducer),
        additive: reducer === 'count' || reducer === 'sum',
    };
}

function featureSharesReference(stages: ProvenanceStage[], contributions: ProvenanceContribution[], rowIds: string[]) {
    const selectedRows = new Set(rowIds);
    const stageOf = new Map<string, string>();
    for (const stage of stages) for (const id of stage.ids) stageOf.set(id, stage.name);
    const totals = new Map<string, number>();
    const selected = new Map<string, number>();
    for (const unit of contributions) {
        const key = JSON.stringify([unit.source, stageOf.get(unit.target) ?? '', unit.group ?? '']);
        const weight = unit.weight ?? 1;
        totals.set(key, (totals.get(key) ?? 0) + weight);
        if (selectedRows.has(unit.target)) selected.set(key, (selected.get(key) ?? 0) + weight);
    }
    const best = new Map<string, { feature: number; selectedUnits: number; totalUnits: number }>();
    for (const [key, selectedUnits] of selected) {
        const source = (JSON.parse(key) as string[])[0];
        const share = { feature: Number(source.slice('feature:'.length)), selectedUnits, totalUnits: totals.get(key) ?? selectedUnits };
        const current = best.get(source);
        if (!current || share.selectedUnits / share.totalUnits > current.selectedUnits / current.totalUnits) best.set(source, share);
    }
    return Object.fromEntries(Array.from(best.values(), ({ feature, ...share }) => [feature, { feature: share }]));
}

// ---- Random models ----------------------------------------------------------

/**
 * D0 features -> D1 units (1:N, unit groups) -> D2 buckets (N:1) -> marks,
 * with integer or fractional weights; marks render rows of D2 and, when
 * `twoStages`, of D1 too (like Sankey links and nodes).
 */
function randomModel(seed: number, twoStages: boolean) {
    const random = rng(seed);
    const features = 30 + Math.floor(random() * 40);
    const buckets = 5 + Math.floor(random() * 10);
    const fractional = random() < 0.5;

    const d0: ProvenanceStage = { name: 'D0', label: 'features', ids: Array.from({ length: features }, (_, i) => featureId(i)) };
    const unitIds: string[] = [];
    const r01: ProvenancePair[] = [];
    const r12 = new Map<string, ProvenancePair>();
    const contributions: ProvenanceContribution[] = [];
    for (let f = 0; f < features; f++) {
        const count = 1 + Math.floor(random() * 6);
        for (let u = 0; u < count; u++) {
            const unit = `unit:${f}.${u}`;
            unitIds.push(unit);
            r01.push({ source: featureId(f), target: unit, weight: 1 });
            const bucket = `bucket:${Math.floor(random() * buckets)}`;
            const key = `${unit}|${bucket}`;
            const existing = r12.get(key);
            if (existing) existing.weight += 1;
            else r12.set(key, { source: unit, target: bucket, weight: 1 });
            const weight = fractional ? Math.round(random() * 1000) / 1000 : undefined;
            // Mostly integers around zero; now and then NaN or -0, whose min and max must match Math.min(...).
            const draw = random();
            const value = draw < 0.03 ? NaN : draw < 0.06 ? -0 : Math.round(random() * 100) - 20;
            contributions.push({
                source: featureId(f),
                target: bucket,
                value,
                ...(weight !== undefined ? { weight } : {}),
                ...(random() < 0.5 ? { group: `g${u % 3}` } : {}),
            });
            if (twoStages && random() < 0.3) {
                contributions.push({ source: featureId(f), target: unit, value: 1, group: 'node' });
            }
        }
    }
    const bucketIds = Array.from({ length: buckets }, (_, b) => `bucket:${b}`);
    const stages: ProvenanceStage[] = [
        d0,
        { name: 'D1', label: 'units', ids: unitIds },
        { name: 'D2', label: 'buckets', ids: bucketIds },
    ];
    const relations: ProvenanceRelation[] = [
        { source: 'D0', target: 'D1', pairs: r01 },
        { source: 'D1', target: 'D2', pairs: Array.from(r12.values()) },
    ];
    const rows = twoStages ? [...bucketIds, ...unitIds.filter((_, i) => i % 4 === 0)] : bucketIds;
    return { random, features, stages, relations, contributions, rows };
}

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

describe('scaled provenance queries match the original implementations', () => {
    test.each(SEEDS)('compose, seed %i', (seed) => {
        const { relations } = randomModel(seed, false);
        expect(compose(relations[0].pairs, relations[1].pairs)).toEqual(composeReference(relations[0].pairs, relations[1].pairs));
    });

    test.each(SEEDS)('preimage equals image of the transpose, seed %i', (seed) => {
        const { random, relations } = randomModel(seed, false);
        const pairs = relations[1].pairs;
        const targets = Array.from(new Set(pairs.map(p => p.target))).filter(() => random() < 0.4);
        expect(preimage(pairs, targets)).toEqual(image(transpose(pairs), targets));
    });

    test.each(SEEDS.flatMap(seed => [[seed, false], [seed, true]] as const))('contribution, featureShares, direct, inverse, cardinalities, seed %i, rows of two stages: %s', (seed, twoStages) => {
        const { random, features, stages, relations, contributions, rows } = randomModel(seed, twoStages);
        for (const reducer of ['count', 'sum', 'avg', 'min', 'max'] as const) {
            const model = new ProvenanceModel(stages, relations, contributions, reducer);
            model.registerMarks(rows);

            for (const share of [0, 0.1, 0.5, 1]) {
                const selection = Array.from({ length: features }, (_, i) => i).filter(() => random() < share);
                const selectedSet = new Set(selection);
                for (const row of rows) {
                    expect(model.contribution(row, selectedSet)).toEqual(contributionReference(contributions, reducer, row, selectedSet));
                }
                const selectedRows = rows.filter(() => random() < share);
                // Duplicated and unknown row ids are ignored the same way.
                const queried = [...selectedRows, ...selectedRows.slice(0, 2), 'bucket:missing'];
                expect(model.featureShares(queried)).toEqual(featureSharesReference(model.stages, contributions, queried));

                const path = model.direct(selection);
                expect(path.map(step => step.ids.length)).toEqual(path.map(step => new Set(step.ids).size));
                const marks = selectedRows.map(markId);
                const inverse = model.inverse(marks);
                expect(inverse[inverse.length - 1].ids.every(id => id.startsWith('feature:'))).toBe(true);
            }
            expect(model.cardinalities.length).toBeGreaterThan(0);
        }
    });

    test('direct and inverse return what the original scans returned', () => {
        // Reference: the original direct/inverse over the same model, with image(transpose(...)).
        const { stages, relations, contributions, rows } = randomModel(7, true);
        const model = new ProvenanceModel(stages, relations, contributions, 'count');
        model.registerMarks(rows);
        const rels = model.relations;
        const sts = model.stages;

        const selection = [0, 3, 5, 8, 13, 21];
        let ids = selection.map(featureId);
        const reached = new Set(ids);
        const expectedDirect: string[][] = [ids];
        rels.forEach((relation) => {
            if (relation.target === 'M') {
                ids = image(relation.pairs, reached);
            } else {
                ids = image(relation.pairs, ids);
                ids.forEach(id => reached.add(id));
            }
            expectedDirect.push(ids);
        });
        expect(model.direct(selection).map(step => step.ids)).toEqual(expectedDirect);

        const marks = rows.slice(0, 5).map(markId);
        const last = rels.length - 1;
        const fromMarks = image(transpose(rels[last].pairs), marks);
        let current = marks;
        const expectedInverse: string[][] = [current];
        for (let index = last; index >= 0; index--) {
            const inStage = new Set(sts[index].ids);
            if (index === last) {
                current = fromMarks.filter(id => inStage.has(id));
            } else {
                const set = new Set(image(transpose(rels[index].pairs), current));
                fromMarks.filter(id => inStage.has(id)).forEach(id => set.add(id));
                current = Array.from(set);
            }
            expectedInverse.push(current);
        }
        expect(model.inverse(marks).map(step => step.ids)).toEqual(expectedInverse);
    });

    test.each(SEEDS)('cardinality, seed %i', (seed) => {
        const reference = (relation: ProvenancePair[]) => {
            if (relation.length === 0) return 'empty';
            const fanOut = new Map<string, Set<string>>();
            const fanIn = new Map<string, Set<string>>();
            for (const { source, target } of relation) {
                if (!fanOut.has(source)) fanOut.set(source, new Set());
                if (!fanIn.has(target)) fanIn.set(target, new Set());
                fanOut.get(source)!.add(target);
                fanIn.get(target)!.add(source);
            }
            const many = (m: Map<string, Set<string>>) => Array.from(m.values()).some(s => s.size > 1);
            const [o, i] = [many(fanOut), many(fanIn)];
            return o && i ? 'N:N' : o ? '1:N' : i ? 'N:1' : '1:1';
        };
        const random = rng(seed * 31);
        // Relations of every cardinality: sizes and fan-outs drawn at random, repeated pairs allowed.
        for (let k = 0; k < 20; k++) {
            const sources = 1 + Math.floor(random() * 6);
            const targets = 1 + Math.floor(random() * 6);
            const pairs: ProvenancePair[] = [];
            const count = Math.floor(random() * 10);
            for (let p = 0; p < count; p++) {
                pairs.push({ source: `s${Math.floor(random() * sources)}`, target: `t${Math.floor(random() * targets)}`, weight: 1 });
            }
            expect(cardinality(pairs)).toBe(reference(pairs));
        }
        const { stages, relations, contributions, rows } = randomModel(seed, seed % 2 === 0);
        const model = new ProvenanceModel(stages, relations, contributions, 'count');
        model.registerMarks(rows);
        expect(model.cardinalities.map(c => c.cardinality)).toEqual([
            ...model.relations.map(r => reference(r.pairs)),
            reference(model.composed()),
        ]);
    });

    test('reducers match the original, also with NaN and -0', () => {
        const cases = [[3, NaN, 1], [0, -0], [-0, 0], [5], [2, 7, -1, 7]];
        for (const values of cases) {
            const units = values.map((value, i) => ({ source: featureId(i), target: 'row', value }));
            for (const reducer of ['count', 'sum', 'avg', 'min', 'max'] as const) {
                expect(Object.is(reduceUnits(units, reducer), reduceReference(units, reducer))).toBe(true);
            }
        }
    });

    test('reducers handle a million units without overflowing the call stack', () => {
        const units = Array.from({ length: 1_000_000 }, (_, i) => ({ source: featureId(i), target: 'row', value: i % 977 }));
        expect(reduceUnits(units, 'min')).toBe(0);
        expect(reduceUnits(units, 'max')).toBe(976);
    });
});
