/**
 * Invariants every transform's provenance must satisfy.
 *
 * The segregated view, the provenance path, and inverse shares trust the
 * provenance a transform declares. These checks turn that trust into a
 * contract: they hold for every built-in preset (see the conformance tests),
 * and a registered transform should pass them on sample data before use.
 *
 * 1. One unique id per row.
 * 2. Stages named `D1…Dn` in order, with unique ids; every row id in a stage.
 * 3. Relations chain `D0 → D1 → … → Dn`; pairs point to existing ids, with
 *    finite, non-negative weights.
 * 4. Following the relations back from each row reaches exactly its `autkIds`.
 * 5. Contributions go from existing features to existing rows, with finite
 *    values and finite, non-negative weights.
 * 6. For additive reducers, the contributions of each row reduce to its value
 *    (count: number of units; sum: sum of unit values), so painted fractions are right.
 */

import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import type { AutkDatum } from '../types-plot';
import type { ProvenanceId, TransformProvenance } from '../types-provenance';
import type { TransformDefinition } from '../transforms/registry';

import { ProvenanceModel, featureId, markId } from './model';

/** Reported violations are capped, so a systematic error stays readable. */
const MAX_VIOLATIONS = 20;

/** One broken invariant: its number (1–6, or 0 when `run` itself fails) and what is wrong. */
export type ContractViolation = { invariant: number; message: string };

/**
 * Result of checking the contract: violations, and invariants not checked
 * (4 when 1–3 fail, 6 when the reducer is not additive, all when `run` fails).
 */
export type ContractReport = { violations: ContractViolation[]; skipped: number[] };

/**
 * Checks the provenance of a transform output against the contract
 * invariants, reporting which invariant each violation breaks.
 *
 * @param featureCount Number of source features (`D0` holds `feature:0 … feature:n-1`).
 * @param rows Output rows, aligned with `provenance.rowIds`.
 * @param provenance Provenance declared by the transform.
 * @param valueField Row field holding the reduced value. Defaults to `value`.
 * @returns Violations by invariant, and invariants that could not be checked.
 */
export function checkProvenanceReport(
    featureCount: number,
    rows: AutkDatum[],
    provenance: TransformProvenance,
    valueField = 'value',
): ContractReport {
    const violations: ContractViolation[] = [];
    const skipped: number[] = [];
    const report = (invariant: number, message: string) => {
        if (violations.length < MAX_VIOLATIONS) violations.push({ invariant, message });
    };
    // A malformed provenance cannot be checked: report it instead of failing on it.
    const structure = provenanceStructureError(rows, provenance);
    if (structure) return { violations: [{ invariant: 0, message: structure }], skipped: [1, 2, 3, 4, 5, 6] };
    const { stages, relations, rowIds, contributions, reducer } = provenance;

    // 1. Row ids
    if (rowIds.length !== rows.length) report(1, `rowIds has ${rowIds.length} ids for ${rows.length} rows`);
    const rowSet = new Set(rowIds);
    if (rowSet.size !== rowIds.length) report(1, 'rowIds are not unique');

    // 2. Stages
    const features = new Set(Array.from({ length: featureCount }, (_v, i) => featureId(i)));
    const stageIds = new Map<string, Set<ProvenanceId>>([['D0', features]]);
    stages.forEach((stage, index) => {
        if (stage.name !== `D${index + 1}`) report(2, `stage ${index} is named "${stage.name}", expected "D${index + 1}"`);
        const ids = new Set(stage.ids);
        if (ids.size !== stage.ids.length) report(2, `stage ${stage.name} has repeated ids`);
        stageIds.set(stage.name, ids);
    });
    const inSomeStage = new Set(stages.flatMap(stage => stage.ids));
    const orphan = rowIds.find(id => !inSomeStage.has(id));
    if (orphan !== undefined) report(2, `row id "${orphan}" belongs to no stage`);

    // 3. Relations
    if (relations.length !== stages.length) report(3, `${relations.length} relations for ${stages.length} stages (expected one per stage)`);
    relations.forEach((relation, index) => {
        const source = index === 0 ? 'D0' : `D${index}`;
        const target = `D${index + 1}`;
        if (relation.source !== source || relation.target !== target) {
            report(3, `relation ${index} goes ${relation.source} → ${relation.target}, expected ${source} → ${target}`);
            return;
        }
        for (const pair of relation.pairs) {
            if (!stageIds.get(source)?.has(pair.source)) { report(3, `relation ${source} → ${target} has unknown source "${pair.source}"`); break; }
            if (!stageIds.get(target)?.has(pair.target)) { report(3, `relation ${source} → ${target} has unknown target "${pair.target}"`); break; }
            if (!Number.isFinite(pair.weight) || pair.weight < 0) { report(3, `relation ${source} → ${target} has weight ${pair.weight} (must be finite and ≥ 0)`); break; }
        }
    });

    // 4. Inverse query of each row reaches exactly its autkIds.
    // It needs a well-formed graph, so it is skipped when invariants 1–3 fail.
    if (violations.length > 0) {
        skipped.push(4);
    } else {
        const model = new ProvenanceModel(
            [{ name: 'D0', label: 'features', ids: Array.from(features) }, ...stages],
            relations,
            contributions,
            reducer,
        );
        model.registerMarks(rowIds);
        rows.forEach((row, index) => {
            const path = model.inverse([markId(rowIds[index])]);
            const reached = path[path.length - 1].ids.slice().sort().join(',');
            const declared = (row.autkIds ?? []).map(featureId).sort().join(',');
            if (reached !== declared) report(4, `row ${index} ("${rowIds[index]}"): relations lead back to {${reached}}, but autkIds are {${declared}}`);
        });
    }

    // 5. Contributions
    for (const unit of contributions) {
        if (!features.has(unit.source)) { report(5, `contribution from unknown feature "${unit.source}"`); break; }
        if (!rowSet.has(unit.target)) { report(5, `contribution to unknown row "${unit.target}"`); break; }
        if (!Number.isFinite(unit.value)) { report(5, `contribution to "${unit.target}" has value ${unit.value}`); break; }
        if (unit.weight !== undefined && (!Number.isFinite(unit.weight) || unit.weight < 0)) {
            report(5, `contribution to "${unit.target}" has weight ${unit.weight} (must be finite and ≥ 0)`);
            break;
        }
    }

    // 6. Additive reducers: units reduce to the row value
    if (reducer === 'count' || reducer === 'sum') {
        const totals = new Map<ProvenanceId, number>();
        for (const unit of contributions) {
            totals.set(unit.target, (totals.get(unit.target) ?? 0) + (reducer === 'count' ? 1 : unit.value));
        }
        rows.forEach((row, index) => {
            const value = Number(row[valueField]);
            if (!Number.isFinite(value)) return;
            const total = totals.get(rowIds[index]) ?? 0;
            if (Math.abs(total - value) > 1e-9 * Math.max(1, Math.abs(value))) {
                report(6, `row ${index} ("${rowIds[index]}") has ${valueField} ${value}, but its units ${reducer === 'count' ? 'count' : 'sum to'} ${total}`);
            }
        });
    } else {
        skipped.push(6);
    }

    return { violations, skipped };
}

/**
 * Checks the provenance of a transform output against the contract invariants.
 *
 * @param featureCount Number of source features (`D0` holds `feature:0 … feature:n-1`).
 * @param rows Output rows, aligned with `provenance.rowIds`.
 * @param provenance Provenance declared by the transform.
 * @param valueField Row field holding the reduced value. Defaults to `value`.
 * @returns Violations, empty when every invariant holds.
 */
export function checkProvenance(
    featureCount: number,
    rows: AutkDatum[],
    provenance: TransformProvenance,
    valueField = 'value',
): string[] {
    return checkProvenanceReport(featureCount, rows, provenance, valueField).violations.map(v => v.message);
}

/**
 * Runs a registered transform on sample data and checks its provenance,
 * reporting which invariant each violation breaks.
 *
 * Meant for development, tests, and interactive tools: plots only run the
 * cheap structural checks.
 *
 * @param definition Transform contract to check.
 * @param collection Sample features.
 * @param options `transform.options` to run with.
 * @param columns Source columns, as in `attributes.axis` without `'@transform'`.
 * @returns Violations by invariant; invariant `0` when `run` fails or returns a malformed value.
 */
export function checkTransformReport(
    definition: TransformDefinition,
    collection: FeatureCollection<Geometry, GeoJsonProperties>,
    options: Record<string, unknown> = {},
    columns: string[] = [],
): ContractReport {
    const rows = collection.features.map((feature, index) => ({ ...(feature.properties ?? {}), autkIds: [index] })) as AutkDatum[];
    const nothingChecked = [1, 2, 3, 4, 5, 6];
    let output;
    try {
        output = definition.run(rows, options, columns);
    } catch (error) {
        return { violations: [{ invariant: 0, message: `run threw: ${(error as Error).message}` }], skipped: nothingChecked };
    }
    if (!output || !Array.isArray(output.rows) || !output.provenance) {
        return { violations: [{ invariant: 0, message: 'run must return { rows, provenance }' }], skipped: nothingChecked };
    }
    // Arrays of the wrong shape are a malformed result too, not a crash of the check.
    try {
        return checkProvenanceReport(rows.length, output.rows, output.provenance);
    } catch (error) {
        return { violations: [{ invariant: 0, message: `the provenance could not be checked: ${(error as Error).message}` }], skipped: nothingChecked };
    }
}

/** Describes what is missing from a provenance object, or `null` when its parts are arrays. */
function provenanceStructureError(rows: unknown, provenance: TransformProvenance): string | null {
    if (!Array.isArray(rows)) return 'rows must be an array';
    const missing = (['stages', 'relations', 'rowIds', 'contributions'] as const).filter(key => !Array.isArray(provenance?.[key]));
    return missing.length > 0 ? `provenance needs ${missing.join(', ')} as arrays` : null;
}

/**
 * Runs a registered transform on sample data and checks its provenance.
 *
 * @param definition Transform contract to check.
 * @param collection Sample features.
 * @param options `transform.options` to run with.
 * @param columns Source columns, as in `attributes.axis` without `'@transform'`.
 * @returns Violations, empty when the transform honors the contract.
 */
export function checkTransform(
    definition: TransformDefinition,
    collection: FeatureCollection<Geometry, GeoJsonProperties>,
    options: Record<string, unknown> = {},
    columns: string[] = [],
): string[] {
    return checkTransformReport(definition, collection, options, columns).violations.map(v => v.message);
}
