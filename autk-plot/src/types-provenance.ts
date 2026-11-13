import type { TransformReducer } from './api';

/**
 * Entity id inside a provenance graph.
 *
 * Ids are prefixed by entity kind so they never collide across stages,
 * e.g. `feature:0`, `bin:4`, `aggregate:4`, `mark:aggregate:4`.
 */
export type ProvenanceId = string;

/**
 * One pair of a provenance relation.
 *
 * `source` contributed to `target`; `weight` counts how many times it did so
 * (e.g. a feature with three events in the same bucket has weight `3`).
 * Weights are natural numbers for counting transforms and non-negative reals
 * for fractional coverage (e.g. the kernel weight of a feature at a density point).
 */
export type ProvenancePair = {
    /** Contributing entity in the source stage. */
    source: ProvenanceId;
    /** Produced entity in the target stage. */
    target: ProvenanceId;
    /** Multiplicity of the contribution, or its real weight for fractional coverage. */
    weight: number;
};

/**
 * Cardinality of a relation, from the maximum fan-out and fan-in of its pairs.
 * `empty` marks a relation without pairs (e.g. a line chart with no events).
 */
export type ProvenanceCardinality = '1:1' | 'N:1' | '1:N' | 'N:N' | 'empty';

/**
 * A named set of entities produced by one pipeline step.
 *
 * `D0` holds source features, `D1..Dn` hold intermediate and aggregated rows,
 * and `M` holds rendered marks.
 */
export type ProvenanceStage = {
    /** Stage name, e.g. `D0`, `D1`, `M`. */
    name: string;
    /** Human-readable stage description, e.g. `bins`. */
    label: string;
    /** Entity ids in the stage. */
    ids: ProvenanceId[];
    /** Why entities of the previous stage may be missing here, e.g. `filter: shape_area > 10000000`. */
    note?: string;
};

/** Relation between two consecutive stages, `R_{source,target}`. */
export type ProvenanceRelation = {
    /** Source stage name. */
    source: string;
    /** Target stage name. */
    target: string;
    /** Weighted pairs of the relation. */
    pairs: ProvenancePair[];
};

/**
 * Unit-level contribution of a source feature to a rendered row.
 *
 * A unit is what the reducer actually counts: the feature itself for binning,
 * one event for `binning-events`, one series point for `reduce-series`.
 */
export type ProvenanceContribution = {
    /** Source feature id (`feature:i`). */
    source: ProvenanceId;
    /** Rendered row id the unit was reduced into. */
    target: ProvenanceId;
    /** Numeric value the unit contributed to the reducer (`1` for count). */
    value: number;
    /**
     * Share group of the unit. Feature shares are computed per stage and
     * group: a Sankey node unit belongs to its column, so a feature lying
     * entirely in a selected node is covered fully (1/1), not once per column.
     */
    group?: string;
    /**
     * Part of its feature this unit carries, for inverse shares. Defaults to `1`:
     * every unit counts once. Fractional-coverage presets (density) set the
     * kernel weight, so a feature's share is the part of its kernel mass that
     * falls in the selected rows.
     */
    weight?: number;
};

/**
 * Provenance produced by a transform, from `D0` to the rendered rows.
 */
export type TransformProvenance = {
    /** Stages after `D0`, in pipeline order. The last stage holds the rendered rows. */
    stages: ProvenanceStage[];
    /** Relations between consecutive stages, starting at `D0`. */
    relations: ProvenanceRelation[];
    /** Provenance id of each output row, aligned with the transform `rows`. */
    rowIds: ProvenanceId[];
    /** Unit-level contributions to the rendered rows. */
    contributions: ProvenanceContribution[];
    /** Reducer applied to the contributions of each rendered row; absent when rows map one-to-one to features. */
    reducer?: TransformReducer;
};

/** Entities reached in each stage by a provenance query. */
export type ProvenancePath = {
    /** Stage name. */
    stage: string;
    /** Stage description. */
    label: string;
    /** Entities reached in the stage. */
    ids: ProvenanceId[];
    /** Entities of the previous step with no image in this stage (`1:0`), for direct queries. */
    dropped?: number;
    /** Why entities may be missing in this stage, copied from the stage. */
    note?: string;
}[];

/**
 * Share of one source feature covered by a set of selected rendered rows.
 *
 * This is the inverse direction of `MarkContribution`: selecting the March
 * bucket of an event line covers 3 of the 12 events of a road, so the road's
 * share is `3/12`. Units are weighted by `ProvenanceContribution.weight`, so a
 * density interval covering 37% of a feature's kernel mass gives `0.37/1`.
 */
export type FeatureShare = {
    /** Source feature index. */
    feature: number;
    /** Units of the feature reduced into the selected rows, weighted. */
    selectedUnits: number;
    /** All units of the feature reduced into any rendered row, weighted. */
    totalUnits: number;
};

/**
 * Share of one rendered row produced by a set of selected source features.
 *
 * `value` applies the row reducer to the selected units only, so it is directly
 * comparable with the row's own value on the same scale.
 */
export type MarkContribution = {
    /** Units of the row that come from selected features. */
    selectedUnits: number;
    /** All units reduced into the row. */
    totalUnits: number;
    /** Reducer applied to the selected units, or `null` when none is selected. */
    value: number | null;
    /** Reducer applied to all units of the row. */
    totalValue: number | null;
    /**
     * Whether `value` is a part of `totalValue` (count, sum) or a statistic of
     * the selected subset that is not additive (avg, min, max).
     */
    additive: boolean;
};
