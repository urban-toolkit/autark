/**
 * Provenance builders shared by transform presets.
 *
 * Every aggregating preset reduces units into buckets through `collectBuckets`.
 * These builders turn the counted members of each bucket into stages,
 * relations, and unit-level contributions. Units the reducer skips have no
 * image in the next stage.
 */

import type { TransformReducer } from '../api';
import type {
    ProvenanceContribution,
    ProvenanceId,
    ProvenancePair,
    TransformProvenance,
} from '../types-provenance';

import { featureId } from '../provenance/model';

import type { CollectedBucket, Row } from './kernel';

/** Returns the source feature indices of a row, falling back to its position. */
function sourcesOf(row: Row | undefined, index: number): number[] {
    const autkIds = row?.autkIds;
    const ids = Array.isArray(autkIds)
        ? autkIds.filter(n => typeof n === 'number' && Number.isFinite(n))
        : [];
    return ids.length > 0 ? ids : [index];
}

/** Adds a weighted pair, merging repeated pairs into a single heavier one. */
function addPair(pairs: Map<string, ProvenancePair>, source: ProvenanceId, target: ProvenanceId): void {
    const key = JSON.stringify([source, target]);
    const existing = pairs.get(key);
    if (existing) existing.weight += 1;
    else pairs.set(key, { source, target, weight: 1 });
}

/**
 * Assigns indexed ids to bins, in mapper order, so empty bins also belong to `D1`.
 *
 * Bucket keys the mapper does not list (e.g. `unknown` for non-finite values)
 * are appended after the regular bins.
 *
 * @param labels Bin labels in mapper order.
 * @param keys Bucket keys produced by the reduction.
 * @param prefix Entity prefix, e.g. `bin`.
 * @returns Bin id by bucket key.
 */
export function indexedBins(labels: string[], keys: string[], prefix: string): Map<string, ProvenanceId> {
    const bins = new Map<string, ProvenanceId>();
    for (const key of [...labels, ...keys]) {
        if (!bins.has(key)) bins.set(key, `${prefix}:${bins.size}`);
    }
    return bins;
}

/**
 * Builds `D0 features → D1 bins → D2 aggregates` for binning presets.
 *
 * Each input row is one feature, so the reduced units are the features
 * themselves (`N:1` into bins, `1:1` from bins to aggregates).
 *
 * @param options Input rows, collected buckets, all bins of `D1`, and output row keys.
 * @returns Transform provenance aligned with the output rows.
 */
export function binnedProvenance(options: {
    /** Input rows reduced by the preset, one per feature. */
    rows: Row[];
    /** Buckets returned by `collectBuckets`. */
    buckets: CollectedBucket[];
    /** Every bin of `D1` by bucket key, including empty bins. */
    bins: Map<string, ProvenanceId>;
    /** Stage label of `D1`, e.g. `bins` or `cells`. */
    binLabel: string;
    /** Stage label of `D2`. Defaults to `aggregates`. */
    aggregateLabel?: string;
    /** Bucket key of each output row, in output order. */
    rowKeys: string[];
    /** Reducer applied by the preset. */
    reducer: TransformReducer;
}): TransformProvenance {
    const { rows, buckets, bins, binLabel, aggregateLabel = 'aggregates', rowKeys, reducer } = options;
    const aggregateOf = (key: string) => bins.get(key)!.replace(/^[^:]+:/, 'aggregate:');

    const r01 = new Map<string, ProvenancePair>();
    const r12: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];

    for (const bucket of buckets) {
        const bin = bins.get(bucket.key)!;
        const aggregate = aggregateOf(bucket.key);
        r12.push({ source: bin, target: aggregate, weight: 1 });

        for (const member of bucket.members) {
            for (const source of sourcesOf(rows[member.row], member.row)) {
                addPair(r01, featureId(source), bin);
                contributions.push({ source: featureId(source), target: aggregate, value: member.value });
            }
        }
    }

    return {
        stages: [
            { name: 'D1', label: binLabel, ids: Array.from(bins.values()) },
            { name: 'D2', label: aggregateLabel, ids: buckets.map(bucket => aggregateOf(bucket.key)) },
        ],
        relations: [
            { source: 'D0', target: 'D1', pairs: Array.from(r01.values()) },
            { source: 'D1', target: 'D2', pairs: r12 },
        ],
        rowIds: rowKeys.map(aggregateOf),
        contributions,
        reducer,
    };
}

/**
 * Builds `D0 features → D1 units → D2 buckets` for presets that unnest arrays.
 *
 * Each feature expands into many units (`1:N`), and units sharing a bucket key
 * are reduced together (`N:1`), so features and buckets relate `N:N`.
 *
 * @param options Unnested units, their ids, collected buckets, and output row keys.
 * @returns Transform provenance aligned with the output rows.
 */
export function unnestedProvenance(options: {
    /** Unnested unit rows, each carrying the `autkIds` of its feature. */
    units: Row[];
    /** Provenance id of each unit, aligned with `units`. */
    unitIds: ProvenanceId[];
    /** Stage label of `D1`, e.g. `events` or `series points`. */
    unitLabel: string;
    /** Buckets returned by `collectBuckets` over `units`. */
    buckets: CollectedBucket[];
    /** Bucket key of each output row, in output order. */
    rowKeys: string[];
    /** Reducer applied by the preset. */
    reducer: TransformReducer;
    /** Stage label of `D2`. Defaults to `buckets`. */
    bucketLabel?: string;
    /**
     * Share group of a bucket key. Defaults to no group. A preset whose
     * features have one unit in each of several buckets (e.g. one per measure)
     * groups them so a feature is fully covered within its group.
     */
    groupOf?: (key: string) => string;
}): TransformProvenance {
    const { units, unitIds, unitLabel, buckets, rowKeys, reducer, bucketLabel = 'buckets', groupOf } = options;
    const bucketId = (key: string) => `bucket:${key}`;

    const r01: ProvenancePair[] = [];
    units.forEach((unit, index) => {
        for (const source of sourcesOf(unit, index)) {
            r01.push({ source: featureId(source), target: unitIds[index], weight: 1 });
        }
    });

    const r12: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];
    for (const bucket of buckets) {
        const target = bucketId(bucket.key);
        for (const member of bucket.members) {
            r12.push({ source: unitIds[member.row], target, weight: 1 });
            for (const source of sourcesOf(units[member.row], member.row)) {
                const contribution: ProvenanceContribution = { source: featureId(source), target, value: member.value };
                if (groupOf) contribution.group = groupOf(bucket.key);
                contributions.push(contribution);
            }
        }
    }

    return {
        stages: [
            { name: 'D1', label: unitLabel, ids: unitIds },
            { name: 'D2', label: bucketLabel, ids: buckets.map(bucket => bucketId(bucket.key)) },
        ],
        relations: [
            { source: 'D0', target: 'D1', pairs: r01 },
            { source: 'D1', target: 'D2', pairs: r12 },
        ],
        rowIds: rowKeys.map(bucketId),
        contributions,
        reducer,
    };
}

/**
 * Builds `D0 features → D1 segments → D2 links → D3 nodes` for flow presets.
 *
 * Each feature walks one step per pair of consecutive columns; every step is a
 * segment (`1:N`), segments with equal endpoints form a link (`N:1`), and each
 * link touches its two endpoint nodes (`N:N`). Going through segments keeps
 * paths exact: a link only leads back to the features that walked it, which a
 * chain through nodes would over-approximate.
 *
 * @param options Segment and node units, their buckets, id helpers, and output row ids.
 * @returns Transform provenance aligned with the output rows.
 */
export function flowProvenance(options: {
    /** One unit row per feature step, carrying the feature `autkIds`. */
    segments: Row[];
    /** Provenance id of each segment, aligned with `segments`. */
    segmentIds: ProvenanceId[];
    /** Buckets returned by `collectBuckets` over `segments`, one per link. */
    linkBuckets: CollectedBucket[];
    /** Returns the link id of a link bucket key. */
    linkId: (key: string) => ProvenanceId;
    /** Returns the ids of the two endpoint nodes of a link bucket key. */
    endsOf: (key: string) => [ProvenanceId, ProvenanceId];
    /** Returns the share group of a link bucket key (its step), so shares are computed per step. */
    linkGroup: (key: string) => string;
    /** One unit row per feature and column, carrying the feature `autkIds`. */
    nodeUnits: Row[];
    /** Buckets returned by `collectBuckets` over `nodeUnits`, one per node. */
    nodeBuckets: CollectedBucket[];
    /** Returns the node id of a node bucket key. */
    nodeId: (key: string) => ProvenanceId;
    /** Returns the share group of a node bucket key (its column), so shares are computed per column. */
    nodeGroup: (key: string) => string;
    /** Provenance id of each output row, in output order. */
    rowIds: ProvenanceId[];
    /** Reducer applied by the preset. */
    reducer: TransformReducer;
}): TransformProvenance {
    const {
        segments, segmentIds, linkBuckets, linkId, endsOf, linkGroup,
        nodeUnits, nodeBuckets, nodeId, nodeGroup, rowIds, reducer,
    } = options;

    const r01: ProvenancePair[] = [];
    segments.forEach((segment, index) => {
        for (const source of sourcesOf(segment, index)) {
            r01.push({ source: featureId(source), target: segmentIds[index], weight: 1 });
        }
    });

    const r12: ProvenancePair[] = [];
    const r23: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];
    for (const bucket of linkBuckets) {
        const link = linkId(bucket.key);
        for (const node of endsOf(bucket.key)) r23.push({ source: link, target: node, weight: 1 });
        for (const member of bucket.members) {
            r12.push({ source: segmentIds[member.row], target: link, weight: 1 });
            for (const source of sourcesOf(segments[member.row], member.row)) {
                contributions.push({ source: featureId(source), target: link, value: member.value, group: linkGroup(bucket.key) });
            }
        }
    }
    for (const bucket of nodeBuckets) {
        for (const member of bucket.members) {
            for (const source of sourcesOf(nodeUnits[member.row], member.row)) {
                contributions.push({ source: featureId(source), target: nodeId(bucket.key), value: member.value, group: nodeGroup(bucket.key) });
            }
        }
    }

    return {
        stages: [
            { name: 'D1', label: 'segments', ids: segmentIds },
            { name: 'D2', label: 'links', ids: linkBuckets.map(bucket => linkId(bucket.key)) },
            { name: 'D3', label: 'nodes', ids: nodeBuckets.map(bucket => nodeId(bucket.key)) },
        ],
        relations: [
            { source: 'D0', target: 'D1', pairs: r01 },
            { source: 'D1', target: 'D2', pairs: r12 },
            { source: 'D2', target: 'D3', pairs: r23 },
        ],
        rowIds,
        contributions,
        reducer,
    };
}

/**
 * Builds a chain of partitions for hierarchy presets, from the deepest level up:
 * `D0 features → D1 leaves → D2 parents → … → Dn top level`.
 *
 * Each feature falls in one node per level (`N:1` into leaves), and each node
 * belongs to one parent (`N:1` between levels). Every node reduces the
 * features under it, grouped by level, so a feature is fully covered within
 * the level of a selected node.
 *
 * @param options Feature units and buckets per level, labels, and id helpers.
 * @returns Transform provenance aligned with the output rows.
 */
export function hierarchyProvenance(options: {
    /** One unit row per feature, per level (index `0` is the top level). */
    levelUnits: Row[][];
    /** Buckets returned by `collectBuckets` for each level, one per node. */
    levelBuckets: CollectedBucket[][];
    /** Stage label of each level, e.g. the attribute it groups by. */
    levelLabels: string[];
    /** Returns the node id of a node bucket key. */
    nodeId: (key: string) => ProvenanceId;
    /** Returns the parent bucket key of a node bucket key, or `null` at the top level. */
    parentOf: (key: string) => string | null;
    /** Provenance id of each output row, in output order. */
    rowIds: ProvenanceId[];
    /** Reducer applied by the preset. */
    reducer: TransformReducer;
}): TransformProvenance {
    const { levelUnits, levelBuckets, levelLabels, nodeId, parentOf, rowIds, reducer } = options;
    const depth = levelBuckets.length;
    const stageOf = (level: number) => `D${depth - level}`;

    const contributions: ProvenanceContribution[] = [];
    const leaves = new Map<string, ProvenancePair>();
    levelBuckets.forEach((buckets, level) => {
        for (const bucket of buckets) {
            for (const member of bucket.members) {
                for (const source of sourcesOf(levelUnits[level][member.row], member.row)) {
                    if (level === depth - 1) addPair(leaves, featureId(source), nodeId(bucket.key));
                    contributions.push({ source: featureId(source), target: nodeId(bucket.key), value: member.value, group: `level:${level}` });
                }
            }
        }
    });

    // From the leaves up: each level links its nodes to their parents.
    const relations: TransformProvenance['relations'] = [{ source: 'D0', target: 'D1', pairs: Array.from(leaves.values()) }];
    for (let level = depth - 1; level > 0; level--) {
        relations.push({
            source: stageOf(level),
            target: stageOf(level - 1),
            pairs: levelBuckets[level].map(bucket => ({ source: nodeId(bucket.key), target: nodeId(parentOf(bucket.key)!), weight: 1 })),
        });
    }

    return {
        stages: levelBuckets
            .map((buckets, level) => ({ name: stageOf(level), label: levelLabels[level], ids: buckets.map(bucket => nodeId(bucket.key)) }))
            .reverse(),
        relations,
        rowIds,
        contributions,
        reducer,
    };
}

/**
 * Builds `D0 features → D1 bars → D2 cumulative points` for accumulation presets.
 *
 * Features are partitioned into ordered bars (`N:1`), and bar `i` contributes
 * to every point `k ≥ i` (a prefix relation, `N:N`). Point `k` therefore
 * reduces the features of bars `0…k`; its units are grouped per point, so a
 * feature under a selected point is fully covered there.
 *
 * @param options Feature units, ordered bar buckets, and id helpers.
 * @returns Transform provenance aligned with the output rows.
 */
export function cumulativeProvenance(options: {
    /** One unit row per feature. */
    units: Row[];
    /** Buckets returned by `collectBuckets`, in bar order. */
    bars: CollectedBucket[];
    /** Provenance id of each output row, in output order. */
    rowIds: ProvenanceId[];
    /** Reducer applied by the preset. */
    reducer: TransformReducer;
}): TransformProvenance {
    const { units, bars, rowIds, reducer } = options;
    const barId = (index: number) => `bar:${index}`;
    const pointId = (index: number) => `point:${index}`;

    const r01 = new Map<string, ProvenancePair>();
    const r12: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];
    bars.forEach((bar, index) => {
        for (let k = index; k < bars.length; k++) r12.push({ source: barId(index), target: pointId(k), weight: 1 });
        for (const member of bar.members) {
            for (const source of sourcesOf(units[member.row], member.row)) {
                addPair(r01, featureId(source), barId(index));
                contributions.push({ source: featureId(source), target: barId(index), value: member.value });
                for (let k = index; k < bars.length; k++) {
                    contributions.push({ source: featureId(source), target: pointId(k), value: member.value, group: `point:${k}` });
                }
            }
        }
    });

    return {
        stages: [
            { name: 'D1', label: 'bars', ids: bars.map((_bar, index) => barId(index)) },
            { name: 'D2', label: 'cumulative', ids: bars.map((_bar, index) => pointId(index)) },
        ],
        relations: [
            { source: 'D0', target: 'D1', pairs: Array.from(r01.values()) },
            { source: 'D1', target: 'D2', pairs: r12 },
        ],
        rowIds,
        contributions,
        reducer,
    };
}

/**
 * Builds `D0 features → D1 rows` for presets that keep one row per feature.
 *
 * @param rows Output rows, each carrying the `autkIds` of its feature.
 * @returns Transform provenance aligned with the output rows.
 */
export function rowwiseProvenance(rows: Row[]): TransformProvenance {
    const rowIds = rows.map((row, index) => `row:${sourcesOf(row, index).join('+')}`);
    const pairs: ProvenancePair[] = [];
    const contributions: ProvenanceContribution[] = [];

    rows.forEach((row, index) => {
        for (const source of sourcesOf(row, index)) {
            pairs.push({ source: featureId(source), target: rowIds[index], weight: 1 });
            contributions.push({ source: featureId(source), target: rowIds[index], value: 1 });
        }
    });

    return {
        stages: [{ name: 'D1', label: 'rows', ids: rowIds }],
        relations: [{ source: 'D0', target: 'D1', pairs }],
        rowIds,
        contributions,
    };
}
