/**
 * Provenance graph of one plot draw cycle.
 *
 * Holds the stages `D0 … Dn, M`, the relations between consecutive stages,
 * and the unit-level contributions used to draw segregated marks.
 */

import type { TransformReducer } from '../api';
import type {
    FeatureShare,
    MarkContribution,
    ProvenanceCardinality,
    ProvenanceContribution,
    ProvenanceId,
    ProvenancePath,
    ProvenanceRelation,
    ProvenanceStage,
} from '../types-provenance';

import { cardinality, compose, image, transpose } from './relations';

/** Returns the provenance id of a source feature index. */
export function featureId(index: number): ProvenanceId {
    return `feature:${index}`;
}

/** Returns the provenance id of the mark that renders a row. */
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

        for (const contribution of contributions) {
            const list = this._contributionsByRow.get(contribution.target) ?? [];
            list.push(contribution);
            this._contributionsByRow.set(contribution.target, list);
        }
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
        const last = this._stages[this._stages.length - 1];
        if (last.name === 'M') {
            this._stages = this._stages.slice(0, -1);
            this._relations = this._relations.slice(0, -1);
        }

        // Rendered rows usually belong to the last stage, but may span several
        // (e.g. Sankey links and nodes).
        const unique = Array.from(new Set(rowIds));
        const sources = this._stages
            .filter(stage => stage.ids.some(id => unique.includes(id)))
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
        return prefixes.flatMap(prefix => compose(prefix, toMarks));
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
            const sources = new Set(relation.pairs.map(pair => pair.source));
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
        const fromMarks = this.hasMarks ? image(transpose(this._relations[last].pairs), current) : [];

        for (let index = last; index >= 0; index--) {
            const stage = this._stages[index];
            const inStage = new Set(stage.ids);
            if (this.hasMarks && index === last) {
                current = fromMarks.filter(id => inStage.has(id));
            } else {
                const reached = new Set(image(transpose(this._relations[index].pairs), current));
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
        const selectedIds = new Set(Array.from(selected, featureId));
        const chosen = units.filter(unit => selectedIds.has(unit.source));
        const reducer = this._reducer ?? 'count';

        return {
            selectedUnits: chosen.length,
            totalUnits: units.length,
            value: reduceUnits(chosen, reducer),
            totalValue: reduceUnits(units, reducer),
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
     * @returns Shares of the features with at least one unit in the selected rows.
     */
    featureShares(rowIds: Iterable<ProvenanceId>): FeatureShare[] {
        const selectedRows = new Set(rowIds);
        const stageOf = new Map<ProvenanceId, string>();
        for (const stage of this._stages) {
            for (const id of stage.ids) stageOf.set(id, stage.name);
        }

        // Units per feature, stage, and group: total, and inside the selected rows.
        // Each unit counts once unless it carries a fractional weight (density).
        const totals = new Map<string, number>();
        const selected = new Map<string, number>();
        for (const unit of this._contributions) {
            const key = JSON.stringify([unit.source, stageOf.get(unit.target) ?? '', unit.group ?? '']);
            const weight = unit.weight ?? 1;
            totals.set(key, (totals.get(key) ?? 0) + weight);
            if (selectedRows.has(unit.target)) selected.set(key, (selected.get(key) ?? 0) + weight);
        }

        const best = new Map<ProvenanceId, FeatureShare>();
        for (const [key, selectedUnits] of selected) {
            const source = (JSON.parse(key) as string[])[0];
            const share = {
                feature: Number(source.slice('feature:'.length)),
                selectedUnits,
                totalUnits: totals.get(key) ?? selectedUnits,
            };
            const current = best.get(source);
            if (!current || share.selectedUnits / share.totalUnits > current.selectedUnits / current.totalUnits) {
                best.set(source, share);
            }
        }
        return Array.from(best.values());
    }
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
    const values = units.map(unit => unit.value);
    if (reducer === 'count') return units.length;
    const sum = values.reduce((acc, v) => acc + v, 0);
    if (reducer === 'sum') return sum;
    if (reducer === 'avg') return sum / values.length;
    if (reducer === 'min') return Math.min(...values);
    return Math.max(...values);
}
