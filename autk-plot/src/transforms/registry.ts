/**
 * Registry of transforms, built-in and user-defined.
 *
 * A transform turns input rows into the rows a plot draws and declares, with weighted relations,
 * how those rows came from the source features. Every consumer of provenance (the segregated view,
 * the provenance path, inverse shares, the filter, linked views) reads only that declaration. The
 * contract has two parts: the shape of the output rows (`RowShape`), which tells plots how to read
 * them, and a provenance that satisfies the invariants checked by `checkTransform`. Built-in
 * transforms are registered with the same function as user transforms; their names stay reserved.
 */

import type { PlotTransformConfig } from '../api';
import type { AutkDatum } from '../types-plot';
import type { TransformProvenance } from '../types-provenance';

/**
 * Output row families. Each built-in transform defines one, so a user
 * transform that yields rows of the same family is read by the same plots.
 *
 * - `category-value`: `label`, `value` (from `binning-1d`); bar, pie, donut, waffle (counts).
 * - `series`: `bucket`, `value` (from `binning-events`, `reduce-series`); line, area, calendar (daily buckets).
 * - `sort`: the source rows themselves, one per feature; table.
 * - `binning-2d`: cells `x`, `y` with their order and a `value`; heat matrix.
 * - `binning-hex`: hexagons centered at `cx`, `cy`; hexbin.
 * - `box-stats`: quartiles, whiskers, and outliers per `category`; box plot.
 * - `flows`: nodes and links between consecutive columns, each link naming its nodes in `source`
 *   and `target`; Sankey, chord.
 * - `hierarchy`: nodes with `key`, `parent`, `level`, `path`; treemap, sunburst, stacked bars.
 * - `cumulative`: bars and cumulative points with their `share`; ECDF, Pareto.
 * - `fold`: one cell per `category` and `measure`; radar.
 * - `density`: points `x` of one curve per `group`; density, violin.
 */
export type RowShape =
    | 'category-value' | 'series' | 'sort' | 'binning-2d' | 'binning-hex' | 'box-stats'
    | 'flows' | 'hierarchy' | 'cumulative' | 'fold' | 'density';

/** What a shape asks of the output, and how plots read it. */
type ShapeSpec = {
    /** Fields every row carries, besides `autkIds`. */
    fields: string[];
    /** Fields bound to the plot axes, in order; none keeps the source attributes. */
    axis?: string[];
    /** Field bound to color. */
    color?: string;
    /** Fields of the output besides `rows` and `provenance`. */
    extras?: string[];
    /** Every row is one source feature: a selection maps to the same features, and there is no `@transform` value. */
    oneToOne?: boolean;
    /** Rows of a `kind` whose fields name the `key` of a row of another kind (the ends of a link). */
    references?: Record<string, { fields: string[]; of: string }>;
    /** Field that names each row: one mark per value, so no two rows share it. */
    unique?: string;
};

const SHAPES: Record<RowShape, ShapeSpec> = {
    'category-value': { fields: ['label', 'value'], axis: ['label', 'value'], unique: 'label' },
    series: { fields: ['bucket', 'value'], axis: ['bucket', 'value'], unique: 'bucket' },
    sort: { fields: [], oneToOne: true },
    'binning-2d': { fields: ['x', 'y', 'xOrder', 'yOrder', 'value', 'count'], axis: ['x', 'y'], color: 'value' },
    'binning-hex': { fields: ['label', 'cx', 'cy', 'value', 'count'], axis: ['label', 'value'], color: 'value', extras: ['extent', 'radius'] },
    'box-stats': {
        fields: ['category', 'count', 'q1', 'median', 'q3', 'whiskerLow', 'whiskerHigh', 'outliers', 'medianIds', 'outlierIds'],
        axis: ['category', 'median'],
    },
    flows: {
        fields: ['kind', 'key', 'column', 'label', 'value', 'count'],
        axis: ['label', 'value'],
        references: { link: { fields: ['source', 'target'], of: 'node' } },
    },
    hierarchy: { fields: ['key', 'level', 'path', 'label', 'parent', 'value', 'count'], axis: ['label', 'value'], extras: ['depth'] },
    cumulative: { fields: ['kind', 'index', 'label', 'upper', 'value', 'share', 'count'], axis: ['label', 'value'], extras: ['numeric', 'total'] },
    fold: { fields: ['category', 'measure', 'measureIndex', 'label', 'value', 'count'], axis: ['label', 'value'], extras: ['measures', 'extents'] },
    density: { fields: ['group', 'index', 'x', 'label', 'value'], axis: ['label', 'value'], extras: ['groups', 'bandwidth'] },
};

/**
 * Output of a transform's `run`: the rows, their provenance, and the extra
 * fields its shape asks for (e.g. `measures` for `fold`).
 */
export type TransformOutput = {
    /** Rows to draw; each carries `autkIds` and the fields of its shape. */
    rows: AutkDatum[];
    /** Provenance from `D0` to the rows: stages `D1…Dn`, relations, row ids, unit contributions, reducer. */
    provenance: TransformProvenance;
    /** Extra fields of the shape. */
    [extra: string]: unknown;
};

/**
 * Contract of a transform, built-in or user-defined.
 */
export type TransformDefinition = {
    /** Unique name: `transform: { preset: 'registered', name }` (built-in transforms: `{ preset: name }`). */
    name: string;
    /** Name shown to people; defaults to `name`. */
    label?: string;
    /** Family of the output rows. */
    shape: RowShape;
    /**
     * Turns input rows into output rows and their provenance.
     *
     * @param rows One row per source feature, with its properties and `autkIds: [index]`.
     * @param options `transform.options` of the plot configuration (`{}` when unset).
     * @param columns Source columns of `attributes.axis`, without `'@transform'`.
     * @returns Output rows, their provenance, and the extras of the shape.
     */
    run(rows: AutkDatum[], options: Record<string, unknown>, columns: string[]): TransformOutput;
};

/** Result of running a user transform (`preset: 'registered'`), tagged with its name and shape. */
export type ExecutedRegisteredTransform = TransformOutput & {
    /** Preset discriminator. */
    preset: 'registered';
    /** Registered name. */
    name: string;
    /** Family of the output rows. */
    shape: RowShape;
};

const registry = new Map<string, TransformDefinition>();
const builtIns = new Set<string>();

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
    if (registry.has(name) || name === 'registered') {
        throw new Error(`registerTransform: a transform named "${name}" is already registered.`);
    }
    // Own keys only: "toString" is in every object.
    if (!Object.prototype.hasOwnProperty.call(SHAPES, shape)) {
        throw new Error(`registerTransform: unknown row shape "${shape}" (expected ${Object.keys(SHAPES).join(', ')}).`);
    }
    if (typeof run !== 'function') {
        throw new Error(`registerTransform: "${name}" needs a run function.`);
    }
    registry.set(name, definition);
}

/**
 * Registers a built-in transform: the same registration, but its name stays reserved and its
 * definition cannot be changed.
 *
 * @param definition Built-in transform.
 */
export function registerBuiltInTransform(definition: TransformDefinition): void {
    registerTransform(freezeDefinition(definition));
    builtIns.add(definition.name);
}

/**
 * Freezes a built-in definition and the plain objects and arrays inside it, so a lookup
 * (`registeredTransform`, `registeredPlot`) cannot change a built-in.
 *
 * @param definition Built-in definition.
 * @returns The same definition, frozen.
 */
export function freezeDefinition<T extends object>(definition: T): T {
    for (const value of Object.values(definition)) {
        const plain = Array.isArray(value) || (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
        if (plain && !Object.isFrozen(value)) freezeDefinition(value as object);
    }
    return Object.freeze(definition);
}

/**
 * Removes a transform from the registry.
 *
 * @param name Registered name.
 * @returns Whether a transform was removed.
 * @throws If the name is a built-in transform.
 */
export function unregisterTransform(name: string): boolean {
    if (builtIns.has(name)) throw new Error(`"${name}" is a built-in transform and cannot be unregistered.`);
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
 * The transform a configuration, or the result of one, names.
 *
 * @param config `{ preset: name }` for a built-in transform, `{ preset: 'registered', name }` for a user one.
 * @returns Its definition.
 * @throws If no transform is registered under the name.
 */
export function transformOf(config: { preset: string; name?: string }): TransformDefinition {
    return registeredTransform(config.preset === 'registered' ? config.name ?? '' : config.preset);
}

/**
 * Row fields a shape requires, besides `autkIds`.
 *
 * @param shape Row family.
 * @returns Field names every row of the family carries (`[label, value]` for `category-value`).
 */
export function shapeFields(shape: RowShape): string[] {
    return [...SHAPES[shape].fields];
}

/**
 * How plots read the rows of a shape.
 *
 * @param shape Row family.
 * @returns Axis fields (none: the source attributes stay), color field, and whether rows are the
 * source features.
 */
export function shapeBinding(shape: RowShape): { axis?: string[]; color?: string; oneToOne: boolean } {
    const { axis, color, oneToOne } = SHAPES[shape];
    return { axis: axis ? [...axis] : undefined, color, oneToOne: oneToOne === true };
}

/** Extra outputs of the shapes that have them, as their plots read them. */
export type ShapeExtras = {
    'binning-hex': { extent: { x: [number, number]; y: [number, number] }; radius: number };
    hierarchy: { depth: number };
    cumulative: { numeric: boolean; total: number };
    fold: { measures: string[]; extents: [number, number][] };
    density: { groups: string[]; bandwidth: number };
};

/**
 * The extra outputs of an executed transform, when its rows have a given shape.
 *
 * @param transform Result of the configured transform (the drawing context's `transform`).
 * @param shape Shape the plot reads.
 * @returns The output, typed with the extras of the shape, or `undefined` for another shape (or none).
 * @example
 * const fold = shapeOutput(transform, 'fold');
 * const measures = fold?.measures ?? [];
 */
export function shapeOutput<S extends keyof ShapeExtras>(
    transform: { preset: string; name?: string } | undefined,
    shape: S,
): ShapeExtras[S] | undefined {
    const name = transform && (transform.preset === 'registered' ? transform.name : transform.preset);
    const definition = name === undefined ? undefined : registry.get(name);
    return definition?.shape === shape ? transform as unknown as ShapeExtras[S] : undefined;
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
    return [...problems, ...shapeProblems(output, shape)];
}

/**
 * Whether the output has the fields its shape asks for.
 *
 * @param output Output of `run`, with `rows` as an array.
 * @param shape Declared row family.
 * @returns Missing row fields or extras, empty when the output has the shape.
 */
export function shapeProblems(output: TransformOutput, shape: RowShape): string[] {
    const problems: string[] = [];
    const { rows } = output;
    const { fields, extras = [], references = {}, unique } = SHAPES[shape];
    const missing = rows.findIndex(row => !Array.isArray(row?.autkIds) || fields.some(field => row[field] === undefined));
    if (missing >= 0) {
        const quoted = [...fields, 'autkIds'].map(field => `"${field}"`);
        problems.push(`row ${missing} lacks ${quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')}, or ${quoted[quoted.length - 1]}` : quoted[0]} required by the "${shape}" shape`);
    }
    if (unique) {
        const seen = new Map<unknown, number>();
        const repeated = rows.findIndex((row, index) => {
            const key = row?.[unique];
            if (seen.has(key)) return true;
            seen.set(key, index);
            return false;
        });
        if (repeated >= 0) {
            problems.push(`rows ${seen.get(rows[repeated][unique])} and ${repeated} share the ${unique} "${String(rows[repeated][unique])}": each row of the "${shape}" shape is one mark, named by its ${unique}`);
        }
    }
    for (const [kind, { fields: ends, of }] of Object.entries(references)) {
        const keys = new Set(rows.filter(row => row?.kind === of).map(row => row.key));
        const broken = rows.findIndex(row => row?.kind === kind && ends.some(end => !keys.has(row[end])));
        if (broken >= 0) {
            problems.push(`row ${broken} (a ${kind}) must name the "key" of a ${of} row in ${ends.map(end => `"${end}"`).join(' and ')}`);
        }
    }
    const absent = extras.filter(extra => output[extra] === undefined);
    if (absent.length > 0) problems.push(`the "${shape}" shape needs ${absent.map(extra => `"${extra}"`).join(', ')} in the output`);
    return problems;
}

/**
 * Runs the transform of a configuration and checks the structure of its output.
 *
 * @param rows Input rows, one per source feature.
 * @param config Transform configuration.
 * @param columns Source columns of `attributes.axis`.
 * @returns The output, tagged with the preset (and, for a user transform, its name and shape).
 * @throws If the name is unknown or the output is malformed.
 */
export function runTransform(rows: AutkDatum[], config: PlotTransformConfig, columns: string[]): TransformOutput & { preset: string } {
    const definition = transformOf(config);
    const output = definition.run(rows, (config.options ?? {}) as Record<string, unknown>, columns);
    const problems = checkOutputStructure(output, definition.shape);
    if (problems.length > 0) {
        throw new Error(`Transform "${definition.name}": ${problems.join('; ')}.`);
    }
    return config.preset === 'registered'
        ? { ...output, preset: 'registered', name: definition.name, shape: definition.shape }
        : { ...output, preset: config.preset };
}
