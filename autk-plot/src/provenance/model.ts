/**
 * Provenance graph of one plot draw cycle.
 *
 * Holds the stages `D0 … Dn, M`, the relations between consecutive stages,
 * and the unit-level contributions used to draw segregated marks.
 */

import type { TransformReducer } from '../api';
import type {
    MarkContribution,
    SelectionShares,
    ProvenanceCardinality,
    ProvenanceContribution,
    ProvenanceId,
    ProvenancePath,
    ProvenanceRelation,
    ProvenanceStage,
} from '../types-provenance';

import { cardinality, compose, image, preimage, tupleKey } from './relations';

type ShareIndex = { keys: (string | undefined)[]; totals: Map<string, number> };

/**
 * Provenance id of a source feature.
 *
 * @param index Source feature index.
 * @returns Id `feature:<index>`.
 */
export function featureId(index: number): ProvenanceId {
    return `feature:${index}`;
}

/**
 * Provenance id of the mark that renders a row.
 *
 * @param rowId Provenance id of the row.
 * @returns Id `mark:<rowId>`.
 */
export function markId(rowId: ProvenanceId): ProvenanceId {
    return `mark:${rowId}`;
}

/**
 * Provenance graph built by `PlotBaseData` on every draw.
 */
export class ProvenanceModel {
    /** Stages in pipeline order, from `D0` to `M` once marks are registered. */
    private _stages: ProvenanceStage[];
    /** Relations between consecutive stages. */
    private _relations: ProvenanceRelation[];
    /** Unit-level contributions to rendered rows. */
    private _contributions: ProvenanceContribution[];
    /** Reducer applied to the contributions of each rendered row, if the rows are aggregated. */
    private _reducer: TransformReducer | undefined;
    /** Contributions grouped by rendered row id. */
    private _contributionsByRow: Map<ProvenanceId, ProvenanceContribution[]> = new Map();
    /**
     * Source feature index of each contribution in `_contributionsByRow`, aligned
     * with it (`-1` when the source is not a feature). Lets `contribution` test
     * the selection without building one id string per selected feature.
     */
    private _featuresByRow: Map<ProvenanceId, number[]> = new Map();
    /** Reduced value of every unit of a row (`contribution().totalValue`), computed once per row. */
    private _totalValues: Map<ProvenanceId, number | null> = new Map();
    /** Position of each contribution in `_contributions`, grouped by rendered row id. */
    private _indicesByRow: Map<ProvenanceId, number[]> = new Map();
    /** Selection-independent part of `featureShares`, built on first use and cleared when marks are registered. */
    private _shareIndex: ShareIndex | undefined;
    private _seriesShareIndexes = new WeakMap<ReadonlyMap<ProvenanceId, string>, ShareIndex>();
    /** Cached result of `cardinalities`, cleared when marks are registered. */
    private _cardinalities: { source: string; target: string; cardinality: ProvenanceCardinality }[] | undefined;

    /**
     * Creates a provenance graph from `D0` and the transform output.
     *
     * @param stages Stages from `D0` to the rendered rows.
     * @param relations Relations between consecutive stages.
     * @param contributions Unit-level contributions to rendered rows.
     * @param reducer Reducer of the rendered rows, or `undefined` for one-to-one rows.
     */
    constructor(
        stages: ProvenanceStage[],
        relations: ProvenanceRelation[],
        contributions: ProvenanceContribution[] = [],
        reducer?: TransformReducer,
    ) {
        this._stages = stages;
        this._relations = relations;
        this._contributions = contributions;
        this._reducer = reducer;

        contributions.forEach((contribution, index) => {
            let list = this._contributionsByRow.get(contribution.target);
            let features = this._featuresByRow.get(contribution.target);
            let indices = this._indicesByRow.get(contribution.target);
            if (!list || !features || !indices) {
                list = [];
                features = [];
                indices = [];
                this._contributionsByRow.set(contribution.target, list);
                this._featuresByRow.set(contribution.target, features);
                this._indicesByRow.set(contribution.target, indices);
            }
            list.push(contribution);
            features.push(featureIndexOf(contribution.source));
            indices.push(index);
        });
    }

    /** Stages in pipeline order. */
    get stages(): ProvenanceStage[] {
        return this._stages;
    }

    /** Relations between consecutive stages. */
    get relations(): ProvenanceRelation[] {
        return this._relations;
    }

    /** Unit-level contributions to rendered rows. */
    get contributions(): ProvenanceContribution[] {
        return this._contributions;
    }

    /** Reducer of the rendered rows, or `undefined` when rows map one-to-one to features. */
    get reducer(): TransformReducer | undefined {
        return this._reducer;
    }

    /**
     * Cardinality of every relation, plus the composed source-to-mark relation.
     *
     * Computed once and cached; the graph only changes when marks are registered.
     *
     * @returns One entry per relation and a final `D0 → M` entry when marks exist.
     */
    get cardinalities(): { source: string; target: string; cardinality: ProvenanceCardinality }[] {
        if (this._cardinalities) return this._cardinalities;

        const steps = this._relations.map(relation => ({
            source: relation.source,
            target: relation.target,
            cardinality: cardinality(relation.pairs),
        }));
        if (this._relations.length > 1) {
            const first = this._stages[0].name;
            const last = this._stages[this._stages.length - 1].name;
            steps.push({ source: first, target: last, cardinality: cardinality(this.composed()) });
        }
        this._cardinalities = steps;
        return steps;
    }

    /**
     * Registers the rendered marks as stage `M` and the relation from the
     * rendered rows to them.
     *
     * Replaces any previous registration, since every draw rebuilds the marks.
     *
     * @param rowIds Row id bound to each rendered mark.
     */
    registerMarks(rowIds: ProvenanceId[]): void {
        this._cardinalities = undefined;
        this._shareIndex = undefined;
        this._seriesShareIndexes = new WeakMap();
        const last = this._stages[this._stages.length - 1];
        if (last.name === 'M') {
            this._stages = this._stages.slice(0, -1);
            this._relations = this._relations.slice(0, -1);
        }

        // Rendered rows usually belong to the last stage, but may span several
        // (e.g. Sankey links and nodes).
        const uniqueSet = new Set(rowIds);
        const unique = Array.from(uniqueSet);
        const sources = this._stages
            .filter(stage => stage.ids.some(id => uniqueSet.has(id)))
            .map(stage => stage.name);
        this._stages = [...this._stages, { name: 'M', label: 'marks', ids: unique.map(markId) }];
        this._relations = [...this._relations, {
            source: sources.length > 0 ? sources.join('+') : this._stages[this._stages.length - 2].name,
            target: 'M',
            pairs: unique.map(id => ({ source: id, target: markId(id), weight: 1 })),
        }];
    }

    /** Whether the last stage holds registered marks. */
    private get hasMarks(): boolean {
        return this._stages[this._stages.length - 1].name === 'M';
    }

    /**
     * Composes all relations into a single relation from `D0` to the last stage.
     *
     * When marks render rows of several stages, the relation to `M` is composed
     * with the path to each of those stages and the results are merged.
     *
     * @returns `R_{0,last} = R_{n-1,n} ∘ … ∘ R_{01}`.
     */
    composed(): ProvenanceRelation['pairs'] {
        const chain = this.hasMarks ? this._relations.slice(0, -1) : this._relations;
        const prefixes = [this._stages[0].ids.map(id => ({ source: id, target: id, weight: 1 }))];
        for (const relation of chain) {
            prefixes.push(compose(prefixes[prefixes.length - 1], relation.pairs));
        }
        if (!this.hasMarks) return prefixes[prefixes.length - 1];

        const toMarks = this._relations[this._relations.length - 1].pairs;
        // A prefix whose targets render no mark composes to nothing: skip it.
        const rendered = new Set<ProvenanceId>();
        for (const pair of toMarks) rendered.add(pair.source);
        return prefixes
            .filter(prefix => prefix.some(pair => rendered.has(pair.target)))
            .flatMap(prefix => compose(prefix, toMarks));
    }

    /**
     * Direct query: follows source features through every stage.
     *
     * @param features Source feature indices.
     * @returns Entities reached in each stage, from `D0` to the last stage.
     */
    direct(features: number[]): ProvenancePath {
        const known = new Set(this._stages[0].ids);
        let ids = Array.from(new Set(features.map(featureId))).filter(id => known.has(id));

        const path: ProvenancePath = [{ stage: this._stages[0].name, label: this._stages[0].label, ids }];
        const reached = new Set(ids);
        this._relations.forEach((relation, index) => {
            const stage = this._stages[index + 1];
            if (relation.target === 'M') {
                // Marks may render rows of any stage, so they are reached from everything seen so far.
                ids = image(relation.pairs, reached);
                path.push({ stage: stage.name, label: stage.label, ids });
                return;
            }
            const sources = new Set<ProvenanceId>();
            for (const pair of relation.pairs) sources.add(pair.source);
            const dropped = ids.filter(id => !sources.has(id)).length;
            ids = image(relation.pairs, ids);
            ids.forEach(id => reached.add(id));
            path.push({ stage: stage.name, label: stage.label, ids, dropped, ...(stage.note ? { note: stage.note } : {}) });
        });
        return path;
    }

    /**
     * Inverse query: follows entities of the last stage back to `D0`.
     *
     * @param ids Entity ids of the last stage (marks once registered).
     * @returns Entities reached in each stage, from the last stage to `D0`.
     */
    inverse(ids: ProvenanceId[]): ProvenancePath {
        const lastStage = this._stages[this._stages.length - 1];
        const known = new Set(lastStage.ids);
        let current = Array.from(new Set(ids)).filter(id => known.has(id));

        const path: ProvenancePath = [{ stage: lastStage.name, label: lastStage.label, ids: current }];
        const last = this._relations.length - 1;
        // Rows behind the selected marks, which may belong to several stages.
        const fromMarks = this.hasMarks ? preimage(this._relations[last].pairs, current) : [];

        for (let index = last; index >= 0; index--) {
            const stage = this._stages[index];
            const inStage = new Set(stage.ids);
            if (this.hasMarks && index === last) {
                current = fromMarks.filter(id => inStage.has(id));
            } else {
                const reached = new Set(preimage(this._relations[index].pairs, current));
                fromMarks.filter(id => inStage.has(id)).forEach(id => reached.add(id));
                current = Array.from(reached);
            }
            path.push({ stage: stage.name, label: stage.label, ids: current });
        }
        return path;
    }

    /**
     * Computes the share of a rendered row produced by the selected features.
     *
     * The row reducer is applied to the selected units only. For count and sum
     * the result is a part of the row value; for avg, min, and max it is the
     * statistic of the selected subset.
     *
     * @param rowId Rendered row id.
     * @param selected Selected source feature indices.
     * @returns Selected and total units and values of the row.
     */
    contribution(rowId: ProvenanceId, selected: ReadonlySet<number>): MarkContribution {
        const units = this._contributionsByRow.get(rowId) ?? [];
        const features = this._featuresByRow.get(rowId) ?? [];
        const reducer = this._reducer ?? 'count';

        // One pass over the row's units, without building the list of chosen
        // units: the same sums, in the same order, as reduceUnits over them.
        let count = 0;
        let sum = 0;
        let min = Infinity;
        let max = -Infinity;
        for (let index = 0; index < units.length; index++) {
            const feature = features[index];
            if (feature < 0 || !selected.has(feature)) continue;
            const value = units[index].value;
            count++;
            sum += value;
            // Pairwise Math.min/max: the semantics of Math.min(...values) (NaN, -0) without the spread.
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        const value = count === 0 ? null
            : reducer === 'count' ? count
                : reducer === 'sum' ? sum
                    : reducer === 'avg' ? sum / count
                        : reducer === 'min' ? min
                            : max;

        // The row total does not depend on the selection.
        let totalValue = this._totalValues.get(rowId);
        if (totalValue === undefined) {
            totalValue = reduceUnits(units, reducer);
            this._totalValues.set(rowId, totalValue);
        }

        return {
            selectedUnits: count,
            totalUnits: units.length,
            value,
            totalValue,
            additive: reducer === 'count' || reducer === 'sum',
        };
    }

    /**
     * Computes, for each source feature, the share of its units covered by the
     * selected rendered rows (inverse direction of `contribution`).
     *
     * Shares are computed within each stage and unit group: when rendered rows
     * span several stages (e.g. Sankey links and nodes), or a stage holds one
     * unit per column (Sankey nodes), each stage and group counts the feature's
     * units on its own. A feature is fully covered when any selected group
     * covers all its units there; the highest share is reported.
     *
     * @param rowIds Selected rendered row ids.
     * @param seriesByRow Optional fixed series lookup for the rendered rows of this draw.
     * @returns Shares keyed by the features with units in the selected rows.
     */
    featureShares(rowIds: Iterable<ProvenanceId>, seriesByRow?: ReadonlyMap<ProvenanceId, string>): SelectionShares {
        // Units of the selected rows, in their order among all contributions, so
        // features are reported in the order a scan of every unit would reach them.
        const picked: number[] = [];
        for (const rowId of new Set(rowIds)) {
            for (const index of this._indicesByRow.get(rowId) ?? []) picked.push(index);
        }
        picked.sort((a, b) => a - b);

        const shares: SelectionShares = {};
        // Count each unit once (or by fractional weight), independently for the
        // feature summary and for coverage within the selected series.
        for (const series of seriesByRow ? [undefined, seriesByRow] : [undefined]) {
            const { keys, totals } = this.shareIndex(series);
            const selected = new Map<string, { index: number; units: number }>();
            for (const index of picked) {
                const key = keys[index];
                if (key === undefined) continue;
                const weight = this._contributions[index].weight ?? 1;
                const entry = selected.get(key);
                if (entry) entry.units += weight;
                else selected.set(key, { index, units: weight });
            }
            for (const [key, { index, units: selectedUnits }] of selected) {
                const unit = this._contributions[index];
                const feature = featureIndexOf(unit.source);
                if (feature < 0) continue;
                const entry = shares[feature] ??= {};
                const share = { selectedUnits, totalUnits: totals.get(key) ?? selectedUnits };
                const id = series?.get(unit.target);
                if (id === undefined) {
                    const current = entry.feature;
                    if (!current || selectedUnits / share.totalUnits > current.selectedUnits / current.totalUnits) entry.feature = share;
                } else {
                    const list = entry.series ??= [];
                    const i = list.findIndex(item => item.id === id);
                    if (i < 0) list.push({ id, ...share });
                    else if (selectedUnits / share.totalUnits > list[i].selectedUnits! / list[i].totalUnits!) list[i] = { id, ...share };
                }
            }
        }
        return shares;
    }

    /**
     * Key of every contribution by feature, stage, and group, and the total
     * units of each key. Independent of the selection, so built once per draw.
     *
     * @returns Keys aligned with the contributions, and units per key.
     */
    private shareIndex(seriesByRow?: ReadonlyMap<ProvenanceId, string>): ShareIndex {
        const cached = seriesByRow ? this._seriesShareIndexes.get(seriesByRow) : this._shareIndex;
        if (cached) return cached;
        const stageOf = new Map<ProvenanceId, string>();
        for (const stage of this._stages) {
            for (const id of stage.ids) stageOf.set(id, stage.name);
        }
        const keys: (string | undefined)[] = new Array(this._contributions.length);
        const totals = new Map<string, number>();
        this._contributions.forEach((unit, index) => {
            const series = seriesByRow?.get(unit.target);
            if (seriesByRow && series === undefined) return;
            const key = tupleKey(unit.source, stageOf.get(unit.target) ?? '', unit.group ?? '', series ?? '');
            keys[index] = key;
            totals.set(key, (totals.get(key) ?? 0) + (unit.weight ?? 1));
        });
        const result = { keys, totals };
        if (seriesByRow) this._seriesShareIndexes.set(seriesByRow, result);
        else this._shareIndex = result;
        return result;
    }
}

/**
 * Source feature index of a provenance id.
 *
 * @param id Provenance id, `feature:<index>` for source features.
 * @returns The index, or `-1` when the id is not a source feature.
 */
function featureIndexOf(id: ProvenanceId): number {
    if (!id.startsWith('feature:')) return -1;
    const rest = id.slice('feature:'.length);
    const index = Number(rest);
    // Only ids that featureId() would produce: a non-negative integer written canonically.
    return Number.isInteger(index) && index >= 0 && String(index) === rest ? index : -1;
}

/**
 * Applies a reducer to unit values, mirroring `reduceBuckets`.
 *
 * @param units Units to reduce.
 * @param reducer Reducer name.
 * @returns Reduced value, or `null` when there are no units.
 */
export function reduceUnits(units: ProvenanceContribution[], reducer: TransformReducer): number | null {
    if (units.length === 0) return null;
    if (reducer === 'count') return units.length;
    // Loops instead of Math.min(...values): spreading many units overflows the call stack.
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const unit of units) {
        sum += unit.value;
        // Pairwise Math.min/max: the semantics of Math.min(...values) (NaN, -0) without the spread.
        min = Math.min(min, unit.value);
        max = Math.max(max, unit.value);
    }
    if (reducer === 'sum') return sum;
    if (reducer === 'avg') return sum / units.length;
    if (reducer === 'min') return min;
    return max;
}
