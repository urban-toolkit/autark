/**
 * Registry of user-defined transforms.
 *
 * A registered transform is the unit of extension: it turns input rows into
 * the rows a plot draws and declares, with explicit weighted relations, how
 * those rows came from the source features. Every consumer of provenance (the
 * segregated view, the provenance path, inverse shares, the filter, linked
 * views) reads only that declaration, so a transform that honors the contract
 * gets all of them without any change to the plots.
 *
 * The contract has two parts:
 * - **Shape**: the fields of the output rows, so plots know how to read them
 *   (`RowShape`);
 * - **Provenance**: stages, relations, and unit contributions that satisfy the
 *   invariants checked by `checkTransform` (see `provenance/validate.ts`).
 *
 * @example
 * registerTransform({
 *   name: 'moving-average',
 *   shape: 'series',
 *   run: (rows, options, columns) => ({ rows: smoothed, provenance }),
 * });
 * new AutkPlot(div, { type: 'linechart', transform: { preset: 'registered', name: 'moving-average' }, ... });
 */

import type { RegisteredTransformConfig } from '../api';
import type { AutkDatum } from '../types-plot';
import type { TransformProvenance } from '../types-provenance';

/**
 * Output row families a registered transform can produce.
 *
 * - `category-value`: one row per category with `label` and `value`; read by
 *   the barchart, the pie, and the donut.
 * - `series`: one row per ordered bucket with `bucket` and `value`; read by the
 *   line chart and the area chart.
 */
export type RowShape = 'category-value' | 'series';

/** Row fields each shape requires, in axis order. */
const SHAPE_FIELDS: Record<RowShape, [string, string]> = {
    'category-value': ['label', 'value'],
    series: ['bucket', 'value'],
};

/** Output of a registered transform's `run`. */
export type TransformOutput = {
    /** Rows to draw; each carries `autkIds` and the fields of its shape. */
    rows: AutkDatum[];
    /** Provenance from `D0` to the rows: stages `D1…Dn`, relations, row ids, unit contributions, reducer. */
    provenance: TransformProvenance;
};

/**
 * Contract of a user-defined transform.
 */
export type TransformDefinition = {
    /** Unique name, used as `transform: { preset: 'registered', name }`. */
    name: string;
    /** Family of the output rows. */
    shape: RowShape;
    /**
     * Turns input rows into output rows and their provenance.
     *
     * @param rows One row per source feature, with its properties and `autkIds: [index]`.
     * @param options `transform.options` of the plot configuration.
     * @param columns Source columns of `attributes.axis`, without `'@transform'`.
     */
    run: (rows: AutkDatum[], options: Record<string, unknown>, columns: string[]) => TransformOutput;
};

/** Result of running a registered transform, tagged like the built-in presets. */
export type ExecutedRegisteredTransform = TransformOutput & {
    /** Preset discriminator. */
    preset: 'registered';
    /** Registered name. */
    name: string;
    /** Family of the output rows. */
    shape: RowShape;
};

const registry = new Map<string, TransformDefinition>();

/**
 * Adds a transform to the registry.
 *
 * @param definition Transform contract: name, row shape, and `run`.
 * @throws If the name is empty or taken, the shape is unknown, or `run` is not a function.
 */
export function registerTransform(definition: TransformDefinition): void {
    const { name, shape, run } = definition;
    if (typeof name !== 'string' || name.trim() === '') {
        throw new Error('registerTransform: the transform needs a non-empty name.');
    }
    if (registry.has(name)) {
        throw new Error(`registerTransform: a transform named "${name}" is already registered.`);
    }
    // Own keys only: "toString" is in every object.
    if (!Object.prototype.hasOwnProperty.call(SHAPE_FIELDS, shape)) {
        throw new Error(`registerTransform: unknown row shape "${shape}" (expected ${Object.keys(SHAPE_FIELDS).join(' or ')}).`);
    }
    if (typeof run !== 'function') {
        throw new Error(`registerTransform: "${name}" needs a run function.`);
    }
    registry.set(name, definition);
}

/**
 * Removes a transform from the registry.
 *
 * @param name Registered name.
 * @returns Whether a transform was removed.
 */
export function unregisterTransform(name: string): boolean {
    return registry.delete(name);
}

/**
 * Looks up a registered transform.
 *
 * @param name Registered name.
 * @returns The transform definition.
 * @throws If no transform is registered under the name.
 */
export function registeredTransform(name: string): TransformDefinition {
    const definition = registry.get(name);
    if (!definition) {
        throw new Error(`No transform is registered as "${name}". Call registerTransform first.`);
    }
    return definition;
}

/**
 * Row fields a shape requires, in axis order (`[label or bucket, value]`).
 *
 * @param shape Row family.
 * @returns Field names read by the plots of the family.
 */
export function shapeFields(shape: RowShape): [string, string] {
    return SHAPE_FIELDS[shape];
}

/**
 * Structural checks run on every execution: cheap, and enough to fail loudly
 * instead of drawing wrong marks. The full invariants are in `checkTransform`.
 *
 * @param output Output of `run`.
 * @param shape Declared row family.
 * @returns Violations, empty when the output is well formed.
 */
export function checkOutputStructure(output: TransformOutput, shape: RowShape): string[] {
    const problems: string[] = [];
    if (!output || !Array.isArray(output.rows) || !output.provenance) {
        return ['run must return { rows, provenance }'];
    }
    const { rows, provenance } = output;
    if (!Array.isArray(provenance.rowIds) || provenance.rowIds.length !== rows.length) {
        problems.push(`provenance.rowIds must have one id per row (${provenance.rowIds?.length ?? 0} ids for ${rows.length} rows)`);
    }
    const [first, second] = SHAPE_FIELDS[shape];
    const missing = rows.findIndex(row => row?.[first] === undefined || row?.[second] === undefined || !Array.isArray(row?.autkIds));
    if (missing >= 0) {
        problems.push(`row ${missing} lacks "${first}", "${second}", or "autkIds" required by the "${shape}" shape`);
    }
    return problems;
}

/**
 * Runs a registered transform and checks the structure of its output.
 *
 * @param rows Input rows, one per source feature.
 * @param config `{ preset: 'registered', name, options }`.
 * @param columns Source columns of `attributes.axis`.
 * @returns Output rows and provenance, tagged with the name and shape.
 * @throws If the name is unknown or the output is malformed.
 */
export function runRegistered(rows: AutkDatum[], config: RegisteredTransformConfig, columns: string[]): ExecutedRegisteredTransform {
    const definition = registeredTransform(config.name);
    const output = definition.run(rows, config.options ?? {}, columns);
    const problems = checkOutputStructure(output, definition.shape);
    if (problems.length > 0) {
        throw new Error(`Transform "${config.name}": ${problems.join('; ')}.`);
    }
    return { preset: 'registered', name: config.name, shape: definition.shape, ...output };
}
