/**
 * Relation algebra for provenance pairs.
 *
 * Weighted relations: compositions through one-to-many steps keep multiplicity.
 */

import type { ProvenanceCardinality, ProvenanceId, ProvenancePair } from '../types-provenance';

/**
 * Composes two relations, returning `second ∘ first`.
 *
 * Pairs meet on the intermediate id. Weights multiply along a path and add up
 * across alternative paths between the same source and target.
 *
 * @param first Relation applied first (`R_{i,j}`).
 * @param second Relation applied second (`R_{j,k}`).
 * @returns Composed relation `R_{i,k}`.
 * @example
 * const r02 = compose(r01, r12);
 */
export function compose(first: ProvenancePair[], second: ProvenancePair[]): ProvenancePair[] {
    const bySource = new Map<ProvenanceId, ProvenancePair[]>();
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
            if (existing) {
                existing.weight += a.weight * b.weight;
            } else {
                composed.set(key, { source: a.source, target: b.target, weight: a.weight * b.weight });
            }
        }
    }
    return Array.from(composed.values());
}

/**
 * Swaps source and target of every pair.
 *
 * @param relation Relation to invert.
 * @returns Transposed relation.
 */
export function transpose(relation: ProvenancePair[]): ProvenancePair[] {
    return relation.map(({ source, target, weight }) => ({ source: target, target: source, weight }));
}

/**
 * Returns the distinct targets reached from the given sources.
 *
 * @param relation Relation to query.
 * @param sources Source ids.
 * @returns Reached target ids, in first-reached order.
 */
export function image(relation: ProvenancePair[], sources: Iterable<ProvenanceId>): ProvenanceId[] {
    const selected = new Set(sources);
    const targets = new Set<ProvenanceId>();
    for (const pair of relation) {
        if (selected.has(pair.source)) targets.add(pair.target);
    }
    return Array.from(targets);
}

/**
 * Classifies a relation by the maximum number of targets per source (fan-out)
 * and sources per target (fan-in). Weights do not change the classification.
 *
 * @param relation Relation to classify.
 * @returns `1:1`, `N:1`, `1:N`, `N:N`, or `empty` when there are no pairs.
 */
export function cardinality(relation: ProvenancePair[]): ProvenanceCardinality {
    if (relation.length === 0) return 'empty';

    const fanOut = new Map<ProvenanceId, Set<ProvenanceId>>();
    const fanIn = new Map<ProvenanceId, Set<ProvenanceId>>();
    for (const { source, target } of relation) {
        if (!fanOut.has(source)) fanOut.set(source, new Set());
        if (!fanIn.has(target)) fanIn.set(target, new Set());
        fanOut.get(source)!.add(target);
        fanIn.get(target)!.add(source);
    }

    const many = (degrees: Map<ProvenanceId, Set<ProvenanceId>>) =>
        Array.from(degrees.values()).some(set => set.size > 1);
    const oneToMany = many(fanOut);
    const manyToOne = many(fanIn);

    if (oneToMany && manyToOne) return 'N:N';
    if (oneToMany) return '1:N';
    if (manyToOne) return 'N:1';
    return '1:1';
}
