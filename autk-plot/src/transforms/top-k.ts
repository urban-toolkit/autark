/**
 * Top-k cut applied after the configured transform.
 *
 * Keeps the `k` rendered rows with the highest value, in their original order.
 * The remaining rows are either dropped (`1:0`) or gathered into one extra
 * row (`N:1`), and the cut becomes its own provenance stage.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { TopKConfig, TransformReducer } from '../api';
import type { AutkDatum } from '../types-plot';
import type {
    ProvenanceContribution,
    ProvenanceId,
    ProvenancePair,
    ProvenanceRelation,
    ProvenanceStage,
} from '../types-provenance';

import { reduceUnits } from '../provenance';

/** Output of `runTopK`, replacing the rendered rows and extending the provenance chain. */
export type TopKResult = {
    /** Kept rows in their original order, plus the gathered row when requested. */
    rows: AutkDatum[];
    /** Provenance id of each output row. */
    rowIds: ProvenanceId[];
    /** New stage holding the output rows. */
    stage: ProvenanceStage;
    /** Relation from the previous rendered rows to the new stage. */
    relation: ProvenanceRelation;
    /** Contributions retargeted to the output rows. */
    contributions: ProvenanceContribution[];
};

/**
 * Label of the row that gathers the cut rows, or `null` when they are dropped.
 *
 * Shared by the cut itself and by the selection projection, so both agree on
 * whether rows are gathered (e.g. `others: ''` gathers under an empty label).
 *
 * @param config Top-k configuration.
 * @returns Gathered row label, or `null`.
 */
export function othersLabelOf(config: TopKConfig): string | null {
    if (config.others === true) return 'Others';
    return typeof config.others === 'string' ? config.others : null;
}

/**
 * Keeps the `k` highest rows and gathers or drops the rest.
 *
 * @param options Rendered rows with their ids and contributions, the value and
 * label attributes, the top-k config, and the names of the stages involved.
 * @returns Output rows, ids, the top-k stage, its relation, and retargeted contributions.
 */
export function runTopK(options: {
    /** Rendered rows before the cut. */
    rows: AutkDatum[];
    /** Provenance id of each rendered row. */
    rowIds: ProvenanceId[];
    /** Contributions to the rendered rows. */
    contributions: ProvenanceContribution[];
    /** Reducer of the rendered rows; recomputes the gathered row from its units. */
    reducer: TransformReducer;
    /** Attribute holding the row label, overwritten on the gathered row. */
    labelAttr: string;
    /** Attribute holding the row value used for ranking. */
    valueAttr: string;
    /** Top-k configuration. */
    config: TopKConfig;
    /** Name of the stage holding the rendered rows. */
    sourceStage: string;
    /** Name of the new stage. */
    stageName: string;
}): TopKResult {
    const { rows, rowIds, contributions, reducer, labelAttr, valueAttr, config, sourceStage, stageName } = options;
    const k = Math.max(0, Math.floor(config.k));
    let othersLabel = othersLabelOf(config);

    const valueOf = (row: AutkDatum) => {
        const v = Number(valueAtPath(row, valueAttr));
        return Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
    };
    const ranked = rows.map((_row, index) => index).sort((a, b) => valueOf(rows[b]) - valueOf(rows[a]));
    const keep = new Set(ranked.slice(0, k));
    const kept = rows.map((_row, index) => index).filter(index => keep.has(index));
    const dropped = rows.map((_row, index) => index).filter(index => !keep.has(index));

    const topId = (id: ProvenanceId) => `top:${id}`;
    const othersId = 'top:others';
    const gathered = othersLabel !== null && dropped.length > 0;

    const pairs: ProvenancePair[] = kept.map(index => ({ source: rowIds[index], target: topId(rowIds[index]), weight: 1 }));
    if (gathered) {
        dropped.forEach(index => pairs.push({ source: rowIds[index], target: othersId, weight: 1 }));
    }

    const keptIds = new Set(kept.map(index => rowIds[index]));
    const droppedIds = new Set(dropped.map(index => rowIds[index]));
    const retargeted: ProvenanceContribution[] = [];
    for (const unit of contributions) {
        if (keptIds.has(unit.target)) retargeted.push({ ...unit, target: topId(unit.target) });
        else if (gathered && droppedIds.has(unit.target)) retargeted.push({ ...unit, target: othersId });
    }

    const outRows = kept.map(index => rows[index]);
    const outIds = kept.map(index => topId(rowIds[index]));
    if (gathered) {
        // The gathered row must not share its label with a kept row (labels are band keys).
        const keptLabels = new Set(outRows.map(row => String(valueAtPath(row, labelAttr))));
        while (keptLabels.has(String(othersLabel))) othersLabel = `${othersLabel} (rest)`;

        const template = rows[dropped[0]];
        const units = retargeted.filter(unit => unit.target === othersId);
        const others: AutkDatum = {
            ...template,
            [labelAttr]: othersLabel,
            [valueAttr]: reduceUnits(units, reducer) ?? 0,
            autkIds: Array.from(new Set(dropped.flatMap(index => rows[index]?.autkIds ?? []))),
        };
        if (typeof template?.count === 'number') {
            others.count = dropped.reduce((acc, index) => acc + Number(rows[index]?.count ?? 0), 0);
        }
        outRows.push(others);
        outIds.push(othersId);
    }

    return {
        rows: outRows,
        rowIds: outIds,
        stage: {
            name: stageName,
            label: `top ${k}`,
            note: `top ${k} by ${valueAttr}${gathered ? `, rest in "${othersLabel}"` : ''}`,
            ids: outIds,
        },
        relation: { source: sourceStage, target: stageName, pairs },
        contributions: retargeted,
    };
}
