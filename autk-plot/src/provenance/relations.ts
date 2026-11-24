/**
 * Relation algebra for provenance pairs.
 *
 * Weighted relations: compositions through one-to-many steps keep multiplicity.
 */

import type { ProvenanceCardinality, ProvenanceId, ProvenancePair } from '../types-provenance';

/**
 * Map key of a tuple of ids, unique for any ids.
 *
 * Each part is prefixed with its length, so no two tuples share a key, whatever
 * characters the ids hold; cheaper than `JSON.stringify` on millions of pairs.
 *
 * @param parts Ids of the tuple, in order.
 * @returns Key unique to the tuple.
 * @example
 * tupleKey('feature:1', 'bin:2'); // '9:feature:15:bin:2'
 */
export function tupleKey(...parts: string[]): string {
    let key = '';
    for (const part of parts) key += `${part.length}:${part}`;
    return key;
}

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

    // Numeric keys: each id gets a number once, and a pair is source * targets + target,
    // which avoids building one string per composed pair.
    const targetNumber = new Map<ProvenanceId, number>();
    for (const pair of second) {
        if (!targetNumber.has(pair.target)) targetNumber.set(pair.target, targetNumber.size);
    }
    const sourceNumber = new Map<ProvenanceId, number>();
    const targetCount = targetNumber.size;

    const composed = new Map<number, ProvenancePair>();
    for (const a of first) {
        const next = bySource.get(a.target);
        if (!next) continue;
        let source = sourceNumber.get(a.source);
        if (source === undefined) {
            source = sourceNumber.size;
            sourceNumber.set(a.source, source);
        }
        for (const b of next) {
            const key = source * targetCount + targetNumber.get(b.target)!;
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
 * Returns the distinct sources that reach the given targets.
 *
 * Same result, in the same order, as `image(transpose(relation), targets)`,
 * without copying the relation.
 *
 * @param relation Relation to query.
 * @param targets Target ids.
 * @returns Reaching source ids, in first-reached order.
 */
export function preimage(relation: ProvenancePair[], targets: Iterable<ProvenanceId>): ProvenanceId[] {
    const selected = new Set(targets);
    const sources = new Set<ProvenanceId>();
    for (const pair of relation) {
        if (selected.has(pair.target)) sources.add(pair.source);
    }
    return Array.from(sources);
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

    // A side is "many" as soon as one id meets a second, different partner, so
    // the first partner of each id is all that needs to be kept.
    const firstTarget = new Map<ProvenanceId, ProvenanceId>();
    const firstSource = new Map<ProvenanceId, ProvenanceId>();
    let oneToMany = false;
    let manyToOne = false;
    for (const { source, target } of relation) {
        if (!oneToMany) {
            const seen = firstTarget.get(source);
            if (seen === undefined) firstTarget.set(source, target);
            else if (seen !== target) oneToMany = true;
        }
        if (!manyToOne) {
            const seen = firstSource.get(target);
            if (seen === undefined) firstSource.set(target, source);
            else if (seen !== source) manyToOne = true;
        }
        if (oneToMany && manyToOne) break;
    }

    if (oneToMany && manyToOne) return 'N:N';
    if (oneToMany) return '1:N';
    if (manyToOne) return 'N:1';
    return '1:1';
}
