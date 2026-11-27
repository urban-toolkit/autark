import type { ReduceSeriesTransformConfig } from '../api';
import type { PlotSeriesGroup } from '../series';
import { runReduceSeries } from './presets/reduce-series';

/**
 * Reduces already-filtered source groups independently, then merges their graphs
 * by stage. The combined rows and groups share the same reduced row objects.
 * Source IDs still refer to the original collection so the plot can insert its
 * filter stage later. This is an internal runner, not a transform preset.
 */
export function runGroupedReduceSeries(
    groups: readonly PlotSeriesGroup[],
    options: NonNullable<ReduceSeriesTransformConfig['options']>,
    columns: string[],
) {
    // The preset supplies the common stage layout and reducer, including for empty inputs.
    const result = runReduceSeries([], options, columns);
    const { rows, provenance } = result;
    const reducedGroups = groups.map(group => {
        if (group.rows.length === 0) return { ...group, rows: [] };
        const reduced = runReduceSeries([...group.rows], options, columns);
        const qualify = (id: string) => `series:${JSON.stringify([group.key, id])}`;

        reduced.provenance.stages.forEach((stage, index) => {
            for (const id of stage.ids) provenance.stages[index].ids.push(qualify(id));
        });
        reduced.provenance.relations.forEach((relation, index) => {
            for (const pair of relation.pairs) {
                provenance.relations[index].pairs.push({
                    source: relation.source === 'D0' ? pair.source : qualify(pair.source),
                    target: qualify(pair.target),
                    weight: pair.weight,
                });
            }
        });
        for (const unit of reduced.provenance.contributions) {
            provenance.contributions.push({ ...unit, target: qualify(unit.target) });
        }
        reduced.rows.forEach((row, index) => {
            rows.push(row);
            provenance.rowIds.push(qualify(reduced.provenance.rowIds[index]));
        });
        return { ...group, rows: reduced.rows };
    });
    return { ...result, groups: reducedGroups };
}
