/**
 * Plot registration: D3 drawing code plus SVG annotations.
 *
 * Built-in and user plots are registered with `registerPlot` and drawn by `RegisteredPlot`. A
 * plot only draws its rows; selection, color, linking, and the segregated view are generic and
 * driven by annotations. Marks carry the class `autkMark` and bind a rendered row, inside `group`
 * (or the `html` container); a row drawn but not selectable binds an `autkContext` element. The
 * part of each mark follows its highlight (`partial-design.ts`): boolean, a subset render through
 * the plot's own encoding, or custom, declared by the plot or inferred from the drawing; a
 * function as `highlight` draws it instead, and `data-autk-highlight` sets one mark's own. `checkPlot`
 * checks the annotations on sample data, and every draw repeats the checks.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';
import type { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import type { NumericPlotDomain, PlotConfig, PlotMargins, PlotScaleDomain, PlotTransformConfig, TransformReducer } from '../api';
import type { ResolvedPlotTransform } from '../plot-base-data';
import type { ExecutedPlotTransform } from '../transforms';
import type { AutkDatum } from '../types-plot';
import type { ProvenanceContribution, ProvenanceId } from '../types-provenance';
import type { ContractReport, ContractViolation } from '../provenance/validate';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import { defaultTickFormat } from '../number-format';
import { featureId } from '../provenance';
import { PlotEvent } from '../types-events';
import type { BrushAxisExtent, BrushExtent } from '../types-events';

import { freezeDefinition, registeredTransform, transformOf } from '../transforms/registry';

import { centerOf, drawAutoPart, htmlFill, inferHighlight, markKindOf, outline, ratioOf, ruleOf, seriesPath, withDeclaredHighlight } from './partial-design';
import type { AutoPartContext, CustomPreset, HighlightDesign, HighlightRule, MarkKind, SubsetChannel } from './partial-design';

type ScaleChannel = 'x' | 'y' | 'size' | 'dimension';

type ResolvePlotDomain = {
    (channel: ScaleChannel, kind: 'numeric', field?: string): NumericPlotDomain | undefined;
    (channel: ScaleChannel, kind: 'categorical', field?: string): readonly string[] | undefined;
    (channel: ScaleChannel, kind: 'either', field?: string): PlotScaleDomain | undefined;
};

let nextPlotClipId = 0;

/** What a registered plot's `draw` receives. */
export type PlotDrawContext = {
    /** Root SVG of the plot, already sized; the title is drawn by the plot. */
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** Marks group, translated by the margins and empty when `draw` starts; draw every mark inside it. */
    group: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Container under the SVG for marks drawn as HTML (click selection only). */
    html: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    /** Rendered rows; bind these objects (not copies) to the marks. */
    rows: AutkDatum[];
    /** Row fields of the axes: the transform's (e.g. `label`, `value`) or `attributes.axis`. */
    fields: string[];
    /**
     * Whether the configuration asks for any interaction (`events`). A plot without one is
     * static: its drawing adds no interaction of its own either, such as sorting a table by a
     * clicked column. Marks get the pointer cursor from the plot, only when clicks select.
     */
    interactive: boolean;
    /** Appearance overrides for this plot. */
    style?: PlotConfig['style'];
    /** Resolves a configured display domain and clips marks for explicit numeric axes. */
    scaleDomain?: ResolvePlotDomain;
    /** Keeps only the rows in the display domain without changing the transform or its provenance. */
    visibleRows?: (includes: (row: AutkDatum) => boolean) => AutkDatum[];
    /** Optional custom label for a category or bucket on the X axis. */
    xTickLabel?: (key: string) => string;
    /** Supplies a brush scale for an axis drawn manually or positioned by bucket rank. */
    setBrushScale?: <Domain extends d3.AxisDomain>(side: 'x' | 'y', scale: d3.AxisScale<Domain>, dimension?: string) => void;
    /** Value of a row on axis `index` (default 0). */
    value: (row: AutkDatum, index?: number) => unknown;
    /** Current color of a row's mark. */
    color: (row: AutkDatum) => string;
    /** Inner width and height, without margins. */
    width: number;
    height: number;
    /**
     * Draws a bottom axis under the drawing area. Configure the D3 axis as usual; ticks drawn
     * across the plot (a negative `tickSizeInner`) take the grid color. The returned group can
     * be styled further.
     *
     * @param label The field the axis shows, by its index in the fields (its label from
     * `labels.axis`, or its name), or the text itself. Defaults to the first field, as in a
     * vertical chart; a horizontal bar chart passes 1, the field of its values.
     */
    axisX: <Domain extends d3.AxisDomain>(axis: d3.Axis<Domain>, label?: number | string) => d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Draws a left axis beside the drawing area; `label` as in `axisX`, defaulting to the second field. */
    axisY: <Domain extends d3.AxisDomain>(axis: d3.Axis<Domain>, label?: number | string) => d3.Selection<SVGGElement, unknown, null, undefined>;
    /**
     * Number format of axis `index`: the D3 format from `ticks`,
     * or, when neither sets it, SI prefixes from one up ("1.5k") and decimals under one
     * ("0.5", not "500m"). `fallback` stands in for an empty format (`''`) the configuration gives.
     */
    format: (index: number, fallback?: string) => (value: d3.NumberValue) => string;
    /** Whether axis `index` has an explicit format, which can also format numeric categories and buckets. */
    hasFormat: (index: number) => boolean;
    /** Tick count of a value axis up to `top`: `count`, or one tick per unit when the values are whole (counts) and `top` is smaller. */
    tickCount: (top: number, values: number[], count: number) => number;
    /** Draws a legend of colored swatches: a row above the drawing area, or a column at its top left. */
    legend: (keys: string[], color: (key: string) => string, direction: 'row' | 'column') => void;
    /**
     * Values the selected parts can take, when the rows reduce features
     * (`undefined` otherwise). With count and sum
     * (`additive`), a part lies between 0 and its row's value. With avg, min,
     * and max, it is a statistic of the subset, anywhere in `extent` (the range
     * of the reduced values), possibly beyond every row. A value scale that covers
     * these keeps the parts inside the plot.
     */
    partRange: { additive: true } | { additive: false; extent: [number, number] } | undefined;
    /**
     * Result of the configured transform, for what it computes besides rows
     * (e.g. the data extent and hexagon radius of `binning-hex`), or `undefined`.
     */
    transform: ExecutedPlotTransform | undefined;
    /** Options of the configured transform, as run (e.g. whether `fold` normalizes); empty without one. */
    options: Record<string, unknown>;
    /** Axis labels of the configuration (`labels.axis`), one per field. */
    axisLabels: string[];
    /** Margins around the drawing area, for what is drawn in the SVG outside `group` (e.g. brush areas). */
    margins: { top: number; right: number; bottom: number; left: number };
    /** Row field the marks are colored by, or `undefined`. */
    colorAttribute: string | undefined;
    /** Colors the marks by a row field (`undefined` for none), keeping the drawing (e.g. a clicked axis name). */
    colorBy: (attribute: string | undefined) => void;
    /** Runs the transform again with these options and draws the plot again (e.g. a table sorted by a clicked column). */
    setOptions: (options: Record<string, unknown>) => void;
};

/** What a registered plot's `arrange` receives. */
export type PlotArrangeContext = {
    /** Marks group. */
    group: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Container of HTML marks. */
    html: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    /** Rendered rows, in their order. */
    rows: AutkDatum[];
    /** Whether a row's mark is highlighted (selected here, or fully by another view). */
    highlighted: (row: AutkDatum) => boolean;
    /** Rows with a selected part (a selection from another view). */
    parts: SegregatedPart[];
    /** Whether the current selection came from another view (the map, a linked plot). */
    external: boolean;
};

/**
 * A series the plot drew through its marks (a line, an area, a radar polygon),
 * and how to draw it again through the selected parts.
 */
export type PlotSeries = {
    /** The drawn path; the part of the series takes its style, in the highlight color. */
    element: SVGPathElement;
    /** Rows of the series, in drawing order. */
    rows: AutkDatum[];
    /**
     * Path of the series with `value(row)` in place of each row's value: the
     * selected part of the row, `0` for a row without one when parts add up,
     * or `null` (a gap) when they do not. `null` draws nothing.
     */
    path: (value: (row: AutkDatum) => number | null) => string | null;
    /**
     * Whether the series is filled down to the baseline (an area). An area of
     * parts only means something when parts add up (count, sum), so with avg,
     * min, or max it is not drawn. Defaults to whether the path is filled; a
     * filled shape that is not an area (a radar polygon) sets `false`.
     */
    area?: boolean;
};

/** What a plot's own custom highlight (`highlight` as a function) receives. */
export type PlotHighlightContext = {
    /** Marks group; previous partial elements were already removed. */
    group: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Selected part of each row: its datum, mark id, and fraction in `[0, 1]`. */
    parts: SegregatedPart[];
    /** Mark elements of a row. */
    marksOf: (row: AutkDatum) => SVGGraphicsElement[];
    /** Color of the selected part. */
    color: string;
    /** Draws the parts with the inferred highlight (or the one `draw` returns), for a function that adds to them. */
    drawAuto: () => void;
};

/**
 * How a plot shows a selection from another view, in one of three modes:
 *
 * - `'boolean'`: the whole mark;
 * - `'subset'` (the default): the mark drawn again with the subset's value through the plot's own
 *   encoding, on the channel inferred from the geometry; or, per mark family, a declared channel,
 *   e.g. `{ rect: { mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' } }`;
 * - custom: a ready-made preset for every family (`'glyph'`, `'trace'`) or per family
 *   (`{ point: { mode: 'custom', preset: 'glyph' } }`), or a function that draws the parts.
 *   `trace` draws the leading fraction of a line, or of the outline of a filled mark; `members`
 *   is only per family, with the `scale` of its marks (declared, returned by `draw`, or inferred).
 */
export type PlotHighlight =
    | 'boolean'
    | 'subset'
    | Exclude<CustomPreset, 'members'>
    | Partial<Record<MarkKind, HighlightRule>>
    | ((context: PlotHighlightContext) => void);

/**
 * A plot: D3 drawing code plus what the plot accepts and knows.
 *
 * Built-in plots and user plots are both definitions, registered with
 * `registerPlot`. Only `name` and `draw` are required; every other field is
 * optional and refines the generic behavior.
 */
export type PlotDefinition = {
    /** Name used in `{ type: 'registered', plot: name }` (the `type` itself for a built-in plot). */
    name: string;
    /** Name shown in error messages. Defaults to `name`. */
    label?: string;
    /**
     * Draws the marks for the rendered rows. Called on every draw. It may return
     * highlight parameters known only while drawing (e.g. the scale of `members`),
     * which complete `highlight` per mark family (a word or a function is refused here: it
     * belongs to `highlight`), and the series drawn through the marks.
     */
    draw: (context: PlotDrawContext) => void | { highlight?: Partial<Record<MarkKind, HighlightRule>>; series?: PlotSeries[] };
    /**
     * How a mark shows the part of it that a selection from another view produces: `'boolean'`,
     * `'subset'` (the default, inferred from the geometry), a custom preset, a highlight per mark
     * family (families left out are inferred), or a function that draws the parts (give each
     * element the class `autkPartial` and `data-autk-provenance`). See `PlotHighlight`.
     */
    highlight?: PlotHighlight;
    /** Mark property the plot colors. Defaults to `fill`. */
    color?: 'fill' | 'stroke';
    /** Row field the marks encode, for the highlight inference. Defaults to the second axis field, or `value`. */
    value?: string;
    /**
     * Transforms the plot reads: transform names, or row shapes (`RowShape`)
     * that any transform, built-in or user, may yield. Any transform when absent.
     */
    transforms?: readonly string[];
    /** Whether the plot draws only transformed rows, refusing a configuration without one of `transforms`. */
    requiresTransform?: boolean;
    /**
     * Reducers whose rows the plot can draw (e.g. `['count', 'sum']` when marks
     * must add up to a whole). Any reducer when absent.
     */
    reducers?: readonly TransformReducer[];
    /**
     * Options the plot gives its transform at every draw, from the drawing area
     * and the configured options (e.g. `binning-hex` bins in the plot's pixels;
     * a Pareto chart orders by value unless told otherwise).
     */
    transformOptions?: (area: { width: number; height: number }, options: Record<string, unknown>) => Record<string, unknown>;
    /** Adjusts a numeric color domain computed from the data; a configured `domainSpec` is kept. */
    colorDomain?: (domain: [number, number]) => [number, number];
    /** Row field the marks are colored by when `attributes.color` is unset (e.g. `value`). */
    colorAttribute?: string;
    /**
     * Style of a mark besides its color, by whether it is highlighted (e.g.
     * translucent links that become opaque). The part of a mark takes the
     * highlighted style, since it is the highlighted share of the mark.
     */
    markStyle?: (row: AutkDatum, highlighted: boolean) => Record<string, string | number>;
    /**
     * Rearranges the drawing after every selection change (e.g. a table that
     * keeps the selected rows on top). Called after each draw too.
     */
    arrange?: (context: PlotArrangeContext) => void;
    /**
     * Color of a mark that is neither highlighted nor colored by an attribute
     * (gray by default), from the rendered rows: e.g. a shade per subgroup.
     */
    baseColor?: (rows: AutkDatum[]) => (row: AutkDatum) => string;
    /** Whether rows can be cut to the top k (`PlotConfig.topK`). Defaults to `true`. */
    topK?: boolean;
    /** Defaults for options the configuration leaves unset (labels are merged field by field). */
    defaults?: Partial<PlotConfig> | ((config: PlotConfig) => Partial<PlotConfig>);
    /** Numeric colormap used when none is configured. */
    defaultNumericInterpolator?: ColorMapInterpolator;
    /** Checks the configuration before drawing; throws to refuse it. */
    validate?: (config: PlotConfig) => void;
};

/** Built-in plot names: always registered, never replaced nor removed. */
const builtIns = new Set<string>();

/** Values of `data-autk-highlight`, a mark's own highlight over its family's. */
const MARK_HIGHLIGHTS = ['none', 'boolean'];

const SUBSET_CHANNELS: readonly SubsetChannel[] = ['length', 'position', 'band', 'angle', 'width', 'area', 'units'];
const CUSTOM_PRESETS: readonly CustomPreset[] = ['glyph', 'trace', 'members'];
const MARK_KINDS: readonly MarkKind[] = ['rect', 'point', 'sector', 'stroke', 'shape', 'html'];

/** Values of `highlight` given as a word: the boolean, the inferred subset render, or a preset for every family. */
const HIGHLIGHT_WORDS = ['boolean', 'subset', 'glyph', 'trace'];

/**
 * Checks a declared highlight.
 *
 * @param highlight Declared highlight.
 * @param where Name of the plot, for the message.
 * @throws If a word, mark family, mode, channel, or preset is unknown.
 */
function checkHighlight(highlight: PlotHighlight | undefined, where: string): void {
    if (highlight === undefined || typeof highlight === 'function') return;
    if (typeof highlight === 'string') {
        if (HIGHLIGHT_WORDS.includes(highlight)) return;
        const hint = (highlight as string) === 'members'
            ? '; members needs the scale of its mark family, as { rect: { mode: \'custom\', preset: \'members\', scale } }'
            : '';
        throw new Error(`Plot "${where}": highlight "${highlight}" is unknown `
            + `(expected ${HIGHLIGHT_WORDS.join(', ')}, a highlight per mark family, or a function)${hint}.`);
    }
    if (typeof highlight !== 'object' || highlight === null) {
        throw new Error(`Plot "${where}": highlight must be a word (${HIGHLIGHT_WORDS.join(', ')}), a highlight per mark family, or a function.`);
    }
    for (const [kind, rule] of Object.entries(highlight)) {
        if (!MARK_KINDS.includes(kind as MarkKind)) {
            throw new Error(`Plot "${where}": highlight names an unknown mark family "${kind}" (expected ${MARK_KINDS.join(', ')}).`);
        }
        const mode = (rule as { mode?: unknown } | undefined)?.mode;
        if (mode === 'boolean') continue;
        if (mode === 'subset') {
            const channel = (rule as { channel?: unknown }).channel;
            if (!SUBSET_CHANNELS.includes(channel as SubsetChannel)) {
                throw new Error(`Plot "${where}": the subset highlight of ${kind} needs a channel `
                    + `(${SUBSET_CHANNELS.join(', ')}), not "${String(channel)}".`);
            }
            continue;
        }
        if (mode === 'custom') {
            const preset = (rule as { preset?: unknown }).preset;
            if (!CUSTOM_PRESETS.includes(preset as CustomPreset)) {
                throw new Error(`Plot "${where}": the custom highlight of ${kind} needs a preset (${CUSTOM_PRESETS.join(', ')}), `
                    + `not "${String(preset)}"; a plot's own custom highlight is highlight as a function.`);
            }
            continue;
        }
        throw new Error(`Plot "${where}": the highlight of ${kind} has an unknown mode "${String(mode)}" (expected boolean, subset, or custom).`);
    }
}

/** Space between an axis label and the tick labels of its axis, in pixels. */
const AXIS_LABEL_GAP = 10;

/** SVG elements with a bounding box, which click, brush, and the part rules can measure. */
const SHAPE_TAGS = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image', 'use', 'g'];

const registry = new Map<string, PlotDefinition>();

/**
 * Registers a plot so `{ type: 'registered', plot: name }` draws with it.
 *
 * @param definition Plot to register.
 * @throws If the name is empty or taken, `draw` is not a function, or `highlight` is unknown.
 * @example
 * registerPlot({
 *   name: 'dots',
 *   draw({ group, rows, width, height, value, axisX, axisY }) {
 *     const x = d3.scaleBand(rows.map(r => String(value(r, 0))), [0, width]);
 *     const y = d3.scaleLinear([0, d3.max(rows, r => Number(value(r, 1))) ?? 1], [height, 0]);
 *     group.selectAll('circle').data(rows).join('circle')
 *       .attr('class', 'autkMark') // a selectable mark, bound to its own row
 *       .attr('cx', r => x(String(value(r, 0)))! + x.bandwidth() / 2)
 *       .attr('cy', r => y(Number(value(r, 1))))
 *       .attr('r', 5);
 *     axisX(d3.axisBottom(x));
 *     axisY(d3.axisLeft(y));
 *   },
 * });
 *
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'registered',
 *   plot: 'dots',
 *   collection: geojson,
 *   attributes: { axis: ['category', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 *   events: [PlotEvent.CLICK],
 * });
 */
export function registerPlot(definition: PlotDefinition): void {
    if (!definition || typeof definition.name !== 'string' || definition.name.trim() === '') {
        throw new Error('registerPlot: the plot needs a non-empty name.');
    }
    if (registry.has(definition.name) || definition.name === 'registered') {
        throw new Error(`registerPlot: a plot named "${definition.name}" is already registered.`);
    }
    if (typeof definition.draw !== 'function') throw new Error(`registerPlot: "${definition.name}" needs a draw function.`);
    checkHighlight(definition.highlight, definition.name);
    registry.set(definition.name, definition);
}

/**
 * Registers a built-in plot: the same registration, but its name stays reserved.
 *
 * @param definition Built-in plot.
 */
export function registerBuiltInPlot(definition: PlotDefinition): void {
    registerPlot(freezeDefinition(definition));
    builtIns.add(definition.name);
}

/**
 * Removes a registered plot.
 *
 * @param name Plot name.
 * @returns Whether a plot was registered under the name.
 * @throws If the name is a built-in plot.
 */
export function unregisterPlot(name: string): boolean {
    if (builtIns.has(name)) throw new Error(`unregisterPlot: "${name}" is a built-in plot and cannot be unregistered.`);
    return registry.delete(name);
}

/**
 * Whether a plot is registered under a name.
 *
 * @param name Plot name.
 * @returns Whether the name is registered.
 */
export function hasRegisteredPlot(name: string): boolean {
    return registry.has(name);
}

/**
 * Draws a legend of swatches in the marks group.
 *
 * @param group Marks group.
 * @param keys Entries, in order.
 * @param color Swatch color of each entry.
 * @param direction `row`: above the drawing area; `column`: at its top left.
 * @param width Width of the drawing area, shared by the entries of a row.
 */
function drawLegend(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    keys: string[],
    color: (key: string) => string,
    direction: 'row' | 'column',
    width: number,
): void {
    const step = direction === 'row' ? Math.min(110, width / Math.max(1, keys.length)) : 14;
    const entries = group.selectAll<SVGGElement, string>('g.autk-legend')
        .data(keys)
        .join('g')
        .attr('class', 'autk-legend')
        .attr('transform', (_key, i) => (direction === 'row' ? `translate(${i * step}, -6)` : `translate(0, ${8 + i * step})`));
    entries.append('rect').attr('width', 10).attr('height', 10).attr('y', -9).style('fill', color);
    entries.append('text').attr('x', 14).style('font-size', '10px').style('fill', '#24292f').text(key => key);
}

/** Whether a name in `PlotDefinition.transforms` is a registered transform (not only a row shape). */
function isTransformName(name: string): boolean {
    try {
        registeredTransform(name);
        return true;
    } catch {
        return false;
    }
}

/**
 * Applies a definition's defaults and checks the transform it reads, before
 * the plot is built.
 *
 * @throws If the plot does not read the configured transform, or refuses top-k.
 */
function prepareConfig(config: PlotConfig, definition: PlotDefinition): void {
    const label = definition.label ?? definition.name;
    if (config.events === undefined) config.events = [];

    const defaults = typeof definition.defaults === 'function' ? definition.defaults(config) : definition.defaults;
    for (const [key, value] of Object.entries(defaults ?? {}) as [keyof PlotConfig, unknown][]) {
        if (key === 'labels') {
            const set = Object.entries(config.labels ?? {}).filter(([, label]) => label !== undefined);
            config.labels = { ...(value as PlotConfig['labels']), ...Object.fromEntries(set) };
        } else if (config[key] === undefined) {
            (config as Record<string, unknown>)[key] = value;
        }
    }

    const transform = config.transform;
    const accepted = definition.transforms ?? [];
    // Accepted names that are transforms; the others are row shapes only (e.g. `category-value`).
    const presets = accepted.filter(isTransformName);
    const shapes = accepted.filter(name => !isTransformName(name));
    if (definition.requiresTransform && !transform) {
        if (presets.length > 0) throw new Error(`${label} requires a ${presets.join(' or ')} transform preset.`);
        throw new Error(shapes.length > 0 ? `${label} requires a transform of ${shapes.join(' or ')} rows.` : `${label} requires a transform.`);
    }
    if (transform && accepted.length > 0) {
        // A plot reads a transform by its name or by the shape of its rows, built-in or user alike.
        const used = transformOf(transform);
        if (!accepted.includes(used.name) && !accepted.includes(used.shape)) {
            if (presets.length === 0) throw new Error(`${label} only supports transforms of ${shapes.join(' or ')} rows.`);
            const names = presets.length > 1 ? `${presets.slice(0, -1).join(', ')} and ${presets[presets.length - 1]}` : presets[0];
            throw new Error(`${label} only supports the ${names} transform preset${presets.length > 1 ? 's' : ''}.`);
        }
    }
    if (config.topK && definition.topK === false) throw new Error(`${definition.label ?? definition.name} does not support topK.`);
}

/**
 * Refuses a reducer whose rows the plot cannot draw.
 *
 * @param reducer Reducer of the transform (`count` when unset).
 * @throws If the definition lists its reducers and this one is not among them.
 */
function checkReducer(reducer: TransformReducer | undefined, definition: PlotDefinition): void {
    const allowed = definition.reducers;
    if (!allowed || allowed.includes(reducer ?? 'count')) return;
    const label = definition.label ?? definition.name;
    const additive = allowed.length === 2 && allowed.includes('count') && allowed.includes('sum');
    throw new Error(additive
        ? `${label} requires an additive reducer (count or sum).`
        : `${label} requires the ${allowed.join(' or ')} reducer.`);
}

/**
 * Looks up a registered plot.
 *
 * @param name Plot name.
 * @returns The plot definition.
 * @throws If no plot is registered under the name.
 */
export function registeredPlot(name: string | undefined): PlotDefinition {
    const definition = name === undefined ? undefined : registry.get(name);
    if (!definition) throw new Error(`registeredPlot: no plot is registered as "${name}". Call registerPlot first.`);
    return definition;
}

/** Whether draws refuse a drawing that breaks the contract; `checkPlot` turns it off to report. */
let enforcing = true;

/**
 * Plot drawn by a registered definition, with the generic interactions,
 * linking, provenance path, and segregated view.
 */
export class RegisteredPlot extends PlotBaseInteractive {
    /** Definition that draws the marks. */
    readonly definition: PlotDefinition;
    /** Violations of the last draw. */
    drawingViolations: ContractViolation[] = [];
    /** Whether the drawing broke the contract more often than the violations kept. */
    drawingTruncated = false;
    /** Marks group of the current drawing (kept by reference: every plot's SVG has id `plot`). */
    private _group: SVGGElement | null = null;
    /** Container of HTML marks of the current drawing. */
    private _html: HTMLDivElement | null = null;
    /** Highlight of each mark family, declared or inferred at every draw. */
    highlightDesigns: HighlightDesign[] = [];
    /** Whether the configuration asks for the boolean highlight (`provenance.highlight`). */
    private _booleanHighlight = false;
    /** Result of the configured transform at the last draw. */
    private _transformResult: ExecutedPlotTransform | undefined;
    /** Series the plot drew through its marks at the last draw. */
    private _series: PlotSeries[] = [];
    /** Parts drawn over the marks: points moved by `position` (over their series) and traced lines. */
    private _moved: Element[] = [];
    /** Base color of the marks of the current drawing (`baseColor`). */
    private _baseColor: ((row: AutkDatum) => string) | undefined;

    /**
     * Creates the plot and performs the initial draw.
     *
     * @param config Plot configuration.
     * @param definition Registered plot that draws the marks.
     * @throws If the drawing breaks the contract (see `checkPlot`).
     */
    constructor(config: PlotConfig, definition: PlotDefinition) {
        // registerPlot checks it too; checkPlot draws definitions that were never registered.
        checkHighlight(definition.highlight, definition.name);
        prepareConfig(config, definition);
        super(config);
        definition.validate?.(config);
        this.definition = definition;
        this._ticks = config.ticks;
        this._scales = config.scales;
        this._defaultNumericInterpolator = definition.defaultNumericInterpolator ?? this._defaultNumericInterpolator;
        this._colorProperty = definition.color ?? 'fill';
        const configured: unknown = config.provenance?.highlight;
        if (configured !== undefined && configured !== 'boolean') {
            throw new Error(`Plot "${definition.name}": provenance.highlight can only be 'boolean' (the whole mark); `
                + `other modes are the plot's highlight, not "${String(configured)}".`);
        }
        this._booleanHighlight = configured === 'boolean';
        this._configuredMargins = { ...this._margins };
        this.draw();
    }

    /** Marks group of the current drawing. */
    private get marksGroup(): d3.Selection<SVGGElement, unknown, null, undefined> {
        return d3.select(this._group as SVGGElement);
    }

    /** Gives the transform the options the plot derives from its drawing area. */
    protected override resolveSize(): void {
        super.resolveSize();
        const options = this.definition.transformOptions;
        const transform = this._transformConfig;
        if (!options || !transform) return;
        const area = {
            width: this._width - this._margins.left - this._margins.right,
            height: this._height - this._margins.top - this._margins.bottom,
        };
        const configured = (transform.options ?? {}) as Record<string, unknown>;
        this._transformConfig = { ...transform, options: { ...configured, ...options(area, configured) } } as PlotTransformConfig;
    }

    /**
     * Keeps the transform result for the drawing context, and refuses a
     * registered transform whose reducer the plot cannot draw.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        checkReducer(result.provenance.reducer, this.definition);
        this._transformResult = result;
        return super.resolveTransformResult(result);
    }

    /** Lets the definition adjust a numeric color domain computed from the data. */
    protected override computeColorDomain(): void {
        super.computeColorDomain();
        const adjust = this.definition.colorDomain;
        const domain = this._resolvedDomain;
        if (!adjust || this._style?.colorMap || !domain || domain.length !== 2 || typeof domain[0] !== 'number') return;
        this._resolvedDomain = adjust([domain[0], domain[domain.length - 1] as number]);
    }

    /** The definition's color field when the configuration sets none (and it was not cleared). */
    protected override get renderColorAttribute(): string | undefined {
        const own = super.renderColorAttribute;
        if (own !== undefined || this._transformColorAttribute === null) return own;
        return this.definition?.colorAttribute;
    }

    /** Unhighlighted marks without a color attribute take the definition's base color. */
    protected override getMarkColor(d: unknown): string {
        if (this._baseColor && !this.isMarkHighlighted(d) && !this.renderColorAttribute) return this._baseColor(d as AutkDatum);
        return super.getMarkColor(d);
    }

    /**
     * Draws the frame (title, marks group, clear area), then the user marks.
     *
     * @throws If `draw` throws, or, while enforcing, if the drawing breaks the contract.
     */
    public render(): void {
        this._brushAxes.clear();
        // Each render starts from the configured margins; a second one keeps the room it was given.
        if (!this._growingMargins && this._configuredMargins) this._margins = { ...this._configuredMargins };
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        const svg = d3.select(this._div).selectChildren<SVGSVGElement, number>('svg')
            .data([0]).join('svg')
            // A class, not an id: a page holds many plots, and an id would repeat.
            .classed('autk-plot', true)
            .attr('width', this._width).attr('height', this._height)
            .style('width', `${this._width}px`).style('height', `${this._height}px`)
            // Pages may hide the host until a plot draws (the Autark gallery does).
            .style('visibility', 'visible')
            // A drag over labels brushes instead of selecting their text.
            .style('user-select', 'none');
        svg.selectAll('*').remove();
        const html = d3.select(this._div).selectChildren<HTMLDivElement, number>('div.autk-registered-html')
            .data([0]).join('div')
            .attr('class', 'autk-registered-html')
            .style('visibility', 'visible')
            .style('max-height', `${height}px`)
            .style('overflow', 'auto');
        html.selectAll('*').remove();
        this._html = html.node();

        if (this._title) {
            svg.append('text')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + width / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .text(this._title);
        }

        const group = svg.append('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        this._group = group.node();
        const svgNode = svg.node();
        const groupNode = group.node();
        const htmlNode = html.node();
        if (!svgNode || !groupNode || !htmlNode) throw new Error('SVG element could not be created.');

        const fields = this.renderAxisAttributes;
        const reducer = this._provenance.reducer;
        const omitted = new Set<AutkDatum>();
        let hasCategoricalOverride = false;
        let clipId: string | undefined;
        const scaleDomain = ((channel: ScaleChannel, kind: 'numeric' | 'categorical' | 'either', field?: string) => {
            const entry = channel === 'dimension' ? this._scales?.dimensions?.[field ?? ''] : this._scales?.[channel];
            const domain = entry?.domain;
            if (domain === undefined) return undefined;
            const numeric = Array.isArray(domain) && domain.length === 2
                && domain.every(value => typeof value === 'number' && Number.isFinite(value))
                && Number(domain[0]) < Number(domain[1]) && (channel !== 'size' || Number(domain[0]) >= 0);
            const categorical = Array.isArray(domain) && domain.every(value => typeof value === 'string')
                && new Set(domain).size === domain.length;
            if (kind === 'numeric' ? !numeric : kind === 'categorical' ? !categorical : !numeric && !categorical) {
                const path = channel === 'dimension' ? `dimensions.${field}` : channel;
                const expected = kind === 'numeric' ? 'finite increasing bounds' : kind === 'categorical'
                    ? 'an ordered list of unique strings' : 'finite increasing bounds or an ordered list of unique strings';
                throw new Error(`scales.${path}.domain must be ${expected}${channel === 'size' ? ' (nonnegative)' : ''}.`);
            }
            if (categorical) hasCategoricalOverride = true;
            if (numeric && channel !== 'size' && !clipId) {
                clipId = `autk-plot-clip-${++nextPlotClipId}`;
                svg.append('defs').append('clipPath').attr('id', clipId)
                    .append('rect').attr('width', width).attr('height', height);
                group.attr('clip-path', `url(#${clipId})`);
            }
            return domain;
        }) as ResolvePlotDomain;
        this._baseColor = this.definition.baseColor?.(this._data);
        const drawn = this.definition.draw({
            svg: d3.select(svgNode),
            group: d3.select(groupNode),
            html: d3.select(htmlNode),
            rows: this._data,
            fields,
            interactive: this._enabledEvents.length > 0,
            style: this._style,
            scaleDomain,
            visibleRows: includes => !hasCategoricalOverride ? this._data : this._data.filter(row => {
                if (includes(row)) return true;
                omitted.add(row);
                return false;
            }),
            xTickLabel: this._ticks?.x?.label,
            setBrushScale: (side, scale, dimension) => this.setBrushScale(side, scale, dimension),
            value: (row, index = 0) => valueAtPath(row, fields[index]),
            color: row => this.getMarkColor(row),
            width,
            height,
            axisX: (axis, label) => this.drawAxis(svg, 'x', axis, width, height, label),
            axisY: (axis, label) => this.drawAxis(svg, 'y', axis, width, height, label),
            format: (index, fallback) => {
                const specifier = this.tickFormatSpecifier(index);
                return specifier == null ? defaultTickFormat : d3.format(specifier || fallback || '');
            },
            hasFormat: index => this.tickFormatSpecifier(index) != null,
            tickCount: (top, values, count) => (top < count && values.every(Number.isInteger) ? Math.max(1, Math.ceil(top)) : count),
            legend: (keys, color, direction) => {
                const layer = clipId ? svg.append('g').attr('transform', group.attr('transform')) : group;
                drawLegend(d3.select(layer.node()!), keys, color, direction, width);
            },
            partRange: !reducer ? undefined
                : reducer === 'count' || reducer === 'sum' ? { additive: true }
                : { additive: false, extent: this.contributionExtent() },
            transform: this._transformConfig ? this._transformResult : undefined,
            options: { ...((this._transformConfig?.options ?? {}) as Record<string, unknown>) },
            axisLabels: [...this._axisLabels],
            margins: { ...this._margins },
            colorAttribute: this.renderColorAttribute,
            colorBy: attribute => this.colorBy(attribute),
            setOptions: options => {
                if (!this._transformConfig) return;
                this._transformConfig = { ...this._transformConfig, options } as PlotTransformConfig;
                this.draw();
            },
        });

        this._series = (drawn ? drawn.series : undefined) ?? [];

        // A drawing made only of HTML (a table) has no SVG: its title is an HTML
        // heading over the marks, and it fills its host, where its content scrolls.
        if (group.selectChildren().empty() && html.selectChildren().size() > 0) {
            svg.remove();
            html.style('max-height', null).style('height', '100%').style('overflow', 'hidden')
                .style('display', 'flex').style('flex-direction', 'column');
            if (this._title) {
                html.insert('div', ':first-child')
                        .attr('class', 'plot-title')
                    .style('text-align', 'center')
                    .style('font-weight', '600')
                    .style('margin', '0 0 6px')
                    .text(this._title);
            }
        }
        // A plot that draws its own brush areas (one per axis) brushes there, not on the whole group.
        if (!svg.selectAll('.autkBrush:not(.autkMarksGroup)').empty()) group.classed('autkBrush', false);
        this.rotateCrowdedTicks(svgNode);
        // A title the margin cannot hold clear of its tick labels gets room: `draw` grows the margin,
        // by at most half the plot area, and draws the plot once more.
        const room = this.placeAxisLabels(svgNode);
        if ((room.bottom > 0 || room.left > 0) && !this._growingMargins) {
            this._grownMargins = {
                ...this._margins,
                bottom: this._margins.bottom + Math.min(room.bottom, height / 2),
                left: this._margins.left + Math.min(room.left, width / 2),
            };
        }
        this.applyMarkStyles(d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark'));
        // The pointer says a click selects: only on plots whose clicks do.
        if (this._enabledEvents.includes(PlotEvent.CLICK)) d3.select(this._div).selectAll<HTMLElement, unknown>('.autkMark').style('cursor', 'pointer');
        const valueField = this.definition.value ?? fields[1] ?? 'value';
        const valueOf = (row: AutkDatum) => {
            const value = Number(valueAtPath(row, valueField));
            return Number.isFinite(value) ? value : Number((row as Record<string, unknown>).value);
        };
        if (drawn && drawn.highlight !== undefined) {
            // What draw returns completes the families; a word or a function belongs to the definition.
            const returned: unknown = drawn.highlight;
            if (typeof returned !== 'object' || returned === null) {
                throw new Error(`Plot "${this.definition.name}": draw returns highlight as a highlight per mark family; `
                    + `a word (${HIGHLIGHT_WORDS.join(', ')}) or a function goes in the definition's highlight.`);
            }
            checkHighlight(drawn.highlight, this.definition.name);
        }
        const inferred = inferHighlight(
            Array.from(this._div.querySelectorAll('.autkMark')),
            valueOf,
            this.aggregatesRows,
            this._colorProperty,
        );
        this.highlightDesigns = withDeclaredHighlight(inferred, this.declaredHighlight(inferred, drawn ? drawn.highlight : undefined));
        // A declared members preset takes its scale from the declaration or from inference; with
        // neither, it would draw nothing.
        const unscaled = this.highlightDesigns.find(design => design.mode === 'custom' && design.preset === 'members' && !design.scale);
        if (unscaled) {
            throw new Error(`Plot "${this.definition.name}": the members highlight of ${unscaled.kind} needs a scale `
                + '({ a, k, fields }), and the drawing gives none to infer.');
        }
        // The clear area goes under the marks after the drawing, so the user code finds the group
        // empty: a plain `group.selectAll('rect')` never takes it for a mark.
        group.insert('rect', ':first-child')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);
        this.configureSignalListeners();

        this.drawingViolations = this.checkDrawing(omitted);
        if (enforcing && this.drawingViolations.length > 0) {
            const shown = this.drawingViolations.slice(0, 3).map(v => `(${v.invariant}) ${v.message}`).join('; ');
            throw new Error(`Plot "${this.definition.name}": the drawing breaks its contract: ${shown.replace(/\.?$/, '.')}`);
        }
    }

    /**
     * Draws an axis of the drawing area, under the marks group so it never
     * covers a mark, labeled with the axis label of the configuration.
     */
    private drawAxis<Domain extends d3.AxisDomain>(
        svg: d3.Selection<SVGSVGElement, number, HTMLElement, unknown>,
        side: 'x' | 'y',
        axis: d3.Axis<Domain>,
        width: number,
        height: number,
        label: number | string = side === 'x' ? 0 : 1,
    ): d3.Selection<SVGGElement, unknown, null, undefined> {
        const { left, top, bottom } = this._margins;
        const g = svg.insert('g', '.autkMarksGroup')
            .attr('class', `${side} axis`)
            .attr('transform', side === 'x' ? `translate(${left}, ${top + height})` : `translate(${left}, ${top})`);
        const scale = axis.scale();
        this.setBrushScale(side, scale);
        const args = axis.tickArguments();
        const fallback = args[0] ?? 10;
        // Leave band scales, explicit positions, and axes that hide their ticks alone.
        if (axis.tickValues() === null && typeof fallback === 'number' && fallback > 0
            && 'ticks' in scale && typeof scale.ticks === 'function'
            && scale.domain().every(value => typeof value === 'number')) {
            const configured = this._ticks?.[side]?.count;
            if (configured !== undefined && Number.isFinite(configured) && configured > 0) {
                axis.tickArguments([configured, ...args.slice(1)]);
            } else if (this.definition.name === 'scatterplot'
                || (side === 'y' && ['barchart', 'linechart'].includes(this.definition.name))) {
                const spacing = side === 'x' ? width / 45 : height / 30;
                const count = Math.min(fallback, Math.max(2, Math.round(spacing)));
                if (count < fallback) axis.tickArguments([count, ...args.slice(1)]);
            }
        }
        g.call(axis);
        if (axis.tickSizeInner() < 0) g.selectAll('.tick line').style('stroke', PlotStyle.grid);
        const title = g.append('text')
            .attr('class', 'axis-label title')
            // An axis group has fill="none"; page styles still win over this attribute.
            .attr('fill', 'currentColor')
            // Centered on its axis; placeAxisLabels then sets it a gap away from the tick labels.
            .attr('text-anchor', 'middle')
            .text(typeof label === 'string' ? label : this._axisLabels[label] ?? '');
        if (side === 'x') title.attr('x', width / 2).attr('y', bottom / 2 + 10);
        else title.attr('transform', 'rotate(-90)').attr('y', -left / 2 - 7).attr('x', -height / 2);
        const node = g.node();
        if (!node) throw new Error('SVG element could not be created.');
        return d3.select(node) as d3.Selection<SVGGElement, unknown, null, undefined>;
    }

    /**
     * Rotates the labels of the x axis by 45° when neighbors overlap (long
     * category names), unless the plot already turned them. Text is measured
     * only in a browser; elsewhere labels stay as drawn.
     */
    private rotateCrowdedTicks(svg: SVGSVGElement): void {
        const texts = Array.from(svg.querySelectorAll<SVGTextElement>('.x.axis .tick text'));
        if (texts.length < 2 || texts.some(text => text.getAttribute('transform'))) return;
        const boxes = texts.map(text => text.getBoundingClientRect()).sort((a, b) => a.left - b.left);
        if (boxes.some(box => box.width === 0)) return;
        if (!boxes.some((box, i) => i > 0 && boxes[i - 1].right + 2 > box.left)) return;
        for (const text of texts) {
            text.setAttribute('transform', 'rotate(-45)');
            text.setAttribute('dx', '-0.6em');
            text.setAttribute('dy', '0.15em');
            text.style.setProperty('text-anchor', 'end');
        }
    }

    /**
     * Sets each axis label, centered on its axis, one gap past its tick labels: the x label below
     * them, the y label (rotated) to their left, within the margin. Text is measured only in a
     * browser; elsewhere labels stay where `drawAxis` put them.
     *
     * @returns The room each margin lacks to hold its label clear of the tick labels (0 when it has it).
     */
    private placeAxisLabels(svg: SVGSVGElement): { bottom: number; left: number } {
        const room = { bottom: 0, left: 0 };
        const { left, bottom } = this._margins;
        for (const side of ['x', 'y'] as const) {
            const label = svg.querySelector<SVGTextElement>(`.${side}.axis > .axis-label`);
            if (!label?.textContent) continue;
            const own = label.getBoundingClientRect();
            const ticks = Array.from(svg.querySelectorAll(`.${side}.axis .tick text`))
                .map(text => text.getBoundingClientRect())
                .filter(box => box.width > 0 && box.height > 0);
            if (own.width === 0 || ticks.length === 0) continue;
            const y = Number(label.getAttribute('y'));
            // Whether the label, moved by `shift` along its axis, is drawn over a tick label.
            const covers = (shift: number) => {
                const box = side === 'x'
                    ? { left: own.left, right: own.right, top: own.top + shift, bottom: own.bottom + shift }
                    : { left: own.left + shift, right: own.right + shift, top: own.top, bottom: own.bottom };
                return ticks.some(tick => tick.left < box.right && box.left < tick.right && tick.top < box.bottom && box.top < tick.bottom);
            };
            // The label goes one gap past the tick labels, within the margin; the margin lacks room
            // only when, held within it, the label would still be drawn over a tick label.
            if (side === 'x') {
                const below = Math.max(...ticks.map(box => box.bottom)) + AXIS_LABEL_GAP;
                const wanted = y + below - own.top;
                const held = Math.min(bottom - 4, wanted);
                if (covers(held - y)) room.bottom = wanted - held;
                label.setAttribute('y', String(held));
            } else {
                const beside = Math.min(...ticks.map(box => box.left)) - AXIS_LABEL_GAP;
                const wanted = y - (own.right - beside);
                const held = Math.max(-left + own.width + 2, wanted);
                if (covers(held - y)) room.left = held - wanted;
                label.setAttribute('y', String(held));
            }
        }
        return room;
    }

    /** SVG marks are colored on fill or stroke; HTML marks on their background. */
    protected override applyMarkStyles(marks: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        super.applyMarkStyles(marks.filter((_d, i, nodes) => nodes[i] instanceof SVGElement));
        // HTML marks: a highlighted background, with text that stays readable on it.
        marks.filter((_d, i, nodes) => !(nodes[i] instanceof SVGElement))
            .style('background-color', d => (this.isMarkHighlighted(d)
                ? this.highlightColor
                : this.renderColorAttribute ? this.getMarkColor(d) : 'transparent'))
            .style('color', d => (this.isMarkHighlighted(d) ? PlotStyle.provenanceText : null));
        const style = this.definition?.markStyle;
        if (style) {
            marks.each((d, i, nodes) => {
                const element = nodes[i] as HTMLElement | SVGElement;
                for (const [name, value] of Object.entries(style(d as AutkDatum, this.isMarkHighlighted(d)))) element.style.setProperty(name, String(value));
            });
        }
        // Highlighted lines cross the others: they are drawn on top.
        marks.filter((d, i, nodes) => this.isMarkHighlighted(d) && markKindOf(nodes[i] as Element, this._colorProperty) === 'stroke').raise();
    }

    /**
     * The highlight declared for each mark family: the configuration's or the plot's boolean, a
     * preset for every family, or the plot's families completed by what `draw` returned. A
     * subset render left to inference (`'subset'`, a function, or nothing) declares no family.
     */
    private declaredHighlight(
        inferred: HighlightDesign[],
        drawn: Partial<Record<MarkKind, HighlightRule>> | undefined,
    ): 'boolean' | Partial<Record<MarkKind, HighlightRule>> {
        const own = this.definition.highlight;
        if (this._booleanHighlight || own === 'boolean') return 'boolean';
        const preset: Partial<Record<MarkKind, HighlightRule>> = own === 'glyph' || own === 'trace'
            ? Object.fromEntries(inferred.map(design => [design.kind, { mode: 'custom', preset: own }]))
            : {};
        const families = own && typeof own === 'object' ? own : {};
        return { ...preset, ...families, ...drawn };
    }

    /** Margins of the configuration: each render starts from them. */
    private _configuredMargins: PlotMargins | undefined;
    private readonly _ticks: PlotConfig['ticks'];
    private readonly _scales: PlotConfig['scales'];
    private readonly _brushAxes = new Map<string, (range: [number, number]) => BrushAxisExtent | undefined>();

    private setBrushScale<Domain extends d3.AxisDomain>(side: 'x' | 'y', scale: d3.AxisScale<Domain>, dimension?: string): void {
        this._brushAxes.set(`${side}:${dimension ?? ''}`, ([low, high]) => {
            if ('invert' in scale && typeof scale.invert === 'function') {
                const a: unknown = scale.invert(low);
                const b: unknown = scale.invert(high);
                if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
                    return { kind: 'numeric', range: [Math.min(a, b), Math.max(a, b)] };
                }
            } else if (typeof scale.bandwidth === 'function') {
                const width = scale.bandwidth();
                const keys = scale.domain().filter(key => {
                    const position = scale(key);
                    return position !== undefined && position <= high && position + width >= low;
                }).map(String);
                return { kind: 'categorical', keys };
            }
            return undefined;
        });
    }

    protected override brushExtent(pixels: BrushExtent['pixels'], dimension?: string): BrushExtent {
        const extent = super.brushExtent(pixels, dimension);
        for (const side of ['x', 'y'] as const) {
            const range = pixels[side];
            if (!range) continue;
            const data = this._brushAxes.get(`${side}:${dimension ?? ''}`)?.(range);
            if (data) (extent.data ??= {})[side] = data;
        }
        return extent;
    }
    /** Whether this render is the second one, with margins grown for the axis titles. */
    private _growingMargins = false;
    /** Margins with room for the axis titles, which the last render found it lacked. */
    private _grownMargins: PlotMargins | undefined;

    /**
     * Draws the plot; when an axis title had no room clear of its tick labels, draws it once more
     * with the margin grown, transform included, since a transform may depend on the drawing area
     * (the hexagons of binning-hex).
     */
    public override draw(): void {
        super.draw();
        const grown = this._grownMargins;
        if (!grown) return;
        this._grownMargins = undefined;
        this._margins = grown;
        this._growingMargins = true;
        try {
            super.draw();
        } finally {
            this._growingMargins = false;
        }
    }

    /** Resolves the format for a Cartesian axis or a named parallel-coordinate dimension. */
    private tickFormatSpecifier(index: number): string | undefined {
        if (this.definition.name === 'parallel-coordinates') {
            return this._ticks?.dimensions?.[this.renderAxisAttributes[index]]?.format;
        }
        const side = index === 0 ? 'x' : index === 1 ? 'y' : undefined;
        return side === undefined ? undefined : this._ticks?.[side]?.format;
    }

    /** Smallest and largest value a unit contributes to a row (`[0, 0]` with no unit). */
    private contributionExtent(): [number, number] {
        const [low, high] = d3.extent(this._provenance.contributions, unit => unit.value);
        return [low ?? 0, high ?? 0];
    }

    /** Every registered plot gets the segregated view, from its highlight. */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /** Rows have the label and value the top-k cut needs when the plot reads them. */
    protected override supportsTopK(): boolean {
        return true;
    }

    /**
     * Draws the selected part of each mark: with the plot's own function when its highlight is
     * one (and the configuration does not ask for the boolean highlight), otherwise with the
     * highlight of its mark family, or of the mark itself (`data-autk-highlight`).
     */
    protected override renderSegregatedMarks(): void {
        const group = this.marksGroup;
        if (group.empty()) return;
        group.selectAll('.autkPartial, .autkPartialSeries').remove();
        d3.select(this._div).selectAll<HTMLElement, unknown>('.autkMark[data-autk-filled]')
            .style('background-image', null).attr('data-autk-filled', null).attr('data-autk-units', null);

        const parts = this.segregatedParts();
        if (parts.length === 0) return;

        const marks = new Map<object, SVGGraphicsElement[]>();
        d3.select(this._div).selectAll<SVGGraphicsElement, unknown>('.autkMark').each(function (d) {
            if (d == null || typeof d !== 'object') return;
            const own = marks.get(d) ?? [];
            own.push(this);
            marks.set(d, own);
        });

        const own = this.definition.highlight;
        if (typeof own === 'function' && !this._booleanHighlight) {
            own({
                group, parts, marksOf: row => marks.get(row) ?? [], color: this.highlightColor,
                drawAuto: () => this.drawAutoParts(group, parts, marks),
            });
            group.selectAll('.autkPartial').style('pointer-events', 'none');
            return;
        }
        this.drawAutoParts(group, parts, marks);
    }

    /** Draws the hovered features as parts of their aggregated marks, in the hover color. */
    protected override renderHoverParts(): void {
        const group = this.marksGroup;
        if (group.empty()) return;
        group.selectAll('.autkHoverPart').remove();
        const parts = this.hoverParts();
        if (parts.length === 0) return;
        const marks = new Map<object, SVGGraphicsElement[]>();
        d3.select(this._div).selectAll<SVGGraphicsElement, unknown>('.autkMark').each(function (d) {
            if (d == null || typeof d !== 'object') return;
            const own = marks.get(d) ?? [];
            own.push(this);
            marks.set(d, own);
        });
        this.drawAutoParts(group, parts, marks, {
            color: PlotStyle.hover,
            outline: PlotStyle.hover,
            selected: new Set(this._hoverFeatureIds),
            className: 'autkHoverPart',
            series: false,
        });
        group.selectAll('.autkHoverPart').style('pointer-events', 'none');
    }

    /** Draws the part of every mark with the highlight of its family (or its own `data-autk-highlight`). */
    private drawAutoParts(
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        parts: SegregatedPart[],
        marks: Map<object, SVGGraphicsElement[]>,
        options: {
            color?: string;
            outline?: string;
            selected?: Set<number>;
            className?: string;
            series?: boolean;
        } = {},
    ): void {
        const color = options.color ?? this.highlightColor;
        const selected = options.selected ?? new Set(this.selection);
        const designs = new Map(this.highlightDesigns.map(design => [design.kind, design]));
        // Every part is measured first and inserted afterwards: measuring a mark
        // (getBBox) after a DOM insertion forces a new layout, which made one
        // selection quadratic in the number of marks. Writes keep their order.
        const writes: (() => void)[] = [];
        let membersByRow: Map<ProvenanceId, ProvenanceContribution[]> | undefined;
        const context: AutoPartContext = {
            color,
            outline: options.outline ?? PlotStyle.provenanceStroke,
            selected,
            className: options.className,
            membersOf: part => {
                // Selected contributions by mark, indexed once per render, on the first part that asks.
                if (!membersByRow) {
                    const features = new Set(Array.from(selected).map(featureId));
                    membersByRow = d3.group(this._provenance.contributions.filter(unit => features.has(unit.source)), unit => unit.target);
                }
                const rowId = this.rowIdOf(part.datum);
                return (rowId === undefined ? [] : membersByRow.get(rowId) ?? [])
                    .map(unit => ({ feature: Number(unit.source.slice('feature:'.length)), value: unit.value }));
            },
        };
        this._moved = [];
        for (const part of parts) {
            for (const mark of marks.get(part.datum) ?? []) this.copyPart(mark, part, designs, context, writes);
        }
        for (const write of writes) write();
        if (options.series === false) return;
        const partOf = new Map(parts.map(part => [part.datum as object, part]));
        if (this._series.length > 0) this.drawPlotSeries(partOf);
        else this.drawSeries(group, marks, partOf, designs);
        // Moved points stay over the series drawn through them; traced lines over the lines they cross.
        for (const point of this._moved) point.parentNode?.appendChild(point);
    }

    /** Lets the plot rearrange its drawing for the current selection. */
    private arrange(): void {
        const arrange = this.definition?.arrange;
        if (!arrange || !this._group || !this._html) return;
        arrange({
            group: this.marksGroup,
            html: d3.select(this._html),
            rows: this._data,
            highlighted: row => this.isMarkHighlighted(row),
            parts: this.segregatedParts(),
            external: this._selectionOrigin === 'external',
        });
    }

    protected override afterRender(): void {
        super.afterRender();
        this.arrange();
    }

    protected override onSelectionUpdated(): void {
        super.onSelectionUpdated();
        this.arrange();
    }

    /**
     * Colors the marks by a row field, or by none, and repaints them.
     *
     * @param attribute Row field, or `undefined` to stop coloring by one.
     */
    private colorBy(attribute: string | undefined): void {
        this.setRenderColorAttribute(attribute);
        if (attribute) this.computeColorDomain();
        else this._resolvedDomain = undefined;
        this.renderSelection();
    }

    /** Whether the parts add up to their rows (count, sum, or rows that are features). */
    private get partsAddUp(): boolean {
        const reducer = this._provenance.reducer;
        return !reducer || reducer === 'count' || reducer === 'sum';
    }

    /** Draws the series the plot returned through the selected parts of their rows. */
    private drawPlotSeries(partOf: Map<object, SegregatedPart>): void {
        const additive = this.partsAddUp;
        for (const series of this._series) {
            if (!series.rows.some(row => partOf.has(row))) continue;
            if ((series.area ?? isFilled(series.element)) && !additive) continue;
            const d = series.path(row => {
                const part = partOf.get(row);
                return part ? part.part.value : additive ? 0 : null;
            });
            if (d) this.appendSeriesPart(series.element, d);
        }
    }

    /**
     * Inserts the part of a series: the series' style in the highlight color,
     * under the point marks drawn through it.
     */
    private appendSeriesPart(series: SVGPathElement, d: string): void {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'autkPartialSeries');
        path.setAttribute('d', d);
        const filled = isFilled(series);
        const stroke = series.style.stroke || series.getAttribute('stroke');
        path.style.setProperty('fill', filled ? this.highlightColor : 'none');
        if (filled) path.style.setProperty('fill-opacity', series.style.fillOpacity || series.getAttribute('fill-opacity') || '1');
        if (stroke && stroke !== 'none') {
            path.style.setProperty('stroke', this.highlightColor);
            path.style.setProperty('stroke-width', series.style.strokeWidth || series.getAttribute('stroke-width') || '1');
        }
        path.style.setProperty('pointer-events', 'none');
        const parent = series.parentNode;
        const firstPoint = Array.from(parent?.children ?? [])
            .find(child => child.classList.contains('autkMark') && markKindOf(child, this._colorProperty) === 'point');
        parent?.insertBefore(path, firstPoint ?? series.nextSibling);
    }

    /**
     * Redraws the single `autkSeries` path (line or area) through the moved
     * points of a `position` render, for a plot that returns no series: marks
     * without a part sit at the baseline. An area is drawn only when parts add up.
     */
    private drawSeries(
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        marks: Map<object, SVGGraphicsElement[]>,
        partOf: Map<object, SegregatedPart>,
        designs: Map<MarkKind, HighlightDesign>,
    ): void {
        const series = group.selectAll<SVGPathElement, unknown>('.autkSeries').nodes();
        const design = designs.get('point');
        if (series.length !== 1 || design?.mode !== 'subset' || design.channel !== 'position') return;

        const points: [number, number][] = [];
        for (const [row, elements] of marks) {
            const part = partOf.get(row);
            const r = part ? ratioOf(part, 'position') : 0;
            for (const mark of elements) {
                const center = markKindOf(mark, this._colorProperty) === 'point' ? centerOf(mark) : null;
                if (!center) continue;
                const b = design.baseline ?? 0;
                points.push(design.axis === 'x' ? [b + r * (center[0] - b), center[1]] : [center[0], b + r * (center[1] - b)]);
            }
        }
        const filled = isFilled(series[0]);
        if (filled && !this.partsAddUp) return;
        const d = seriesPath(points, design, filled);
        if (d) this.appendSeriesPart(series[0], d);
    }

    /**
     * Prepares a copy of the mark that shows only its selected part, and queues
     * its insertion after the mark. Reads the mark's geometry now; every DOM
     * write goes to `writes`, run once all marks are measured.
     */
    private copyPart(
        mark: SVGGraphicsElement,
        part: SegregatedPart,
        designs: Map<MarkKind, HighlightDesign>,
        context: AutoPartContext,
        writes: (() => void)[],
    ): void {
        const own = mark.getAttribute('data-autk-highlight');
        if (own === 'none') return;
        const kind = markKindOf(mark, this._colorProperty);
        const family = designs.get(kind);
        if (!family) return;
        // A mark may ask for the whole-mark highlight over its family's.
        const design: HighlightDesign = own === 'boolean'
            ? { kind, marks: family.marks, mode: 'boolean', reason: 'declared by the mark (data-autk-highlight)' }
            : family;
        const rule = ruleOf(design);

        // An HTML mark is filled to its part, from the anchor of the rule.
        if (kind === 'html') {
            const host = mark as unknown as HTMLElement;
            const fill = htmlFill(design, ratioOf(part, rule), context.color);
            writes.push(() => {
                host.style.setProperty('background-image', fill);
                host.setAttribute('data-autk-filled', String(part.fraction));
                host.setAttribute('data-autk-units', `${part.part.selectedUnits}/${part.part.totalUnits}`);
            });
            return;
        }

        const copy = mark.cloneNode(true) as SVGGraphicsElement;
        copy.querySelectorAll('title').forEach(title => title.remove());
        copy.removeAttribute('id');
        copy.setAttribute('class', context.className ?? 'autkPartial');
        copy.setAttribute('data-autk-provenance', part.mark);
        copy.setAttribute('data-autk-units', `${part.part.selectedUnits}/${part.part.totalUnits}`);
        copy.style.setProperty('pointer-events', 'none');
        // The part is the highlighted share of the mark: it looks like a highlighted mark.
        const style = this.definition.markStyle;
        if (style) for (const [name, value] of Object.entries(style(part.datum, true))) copy.style.setProperty(name, String(value));
        // Stroke-only marks show their part in the stroke.
        const property = kind === 'stroke' ? 'stroke' : this._colorProperty;
        for (const element of [copy, ...Array.from(copy.querySelectorAll<SVGElement>('*'))]) {
            element.style.setProperty(property, context.color);
        }

        // A subset statistic drawn inside a mark whose color encodes the value
        // takes the color of the statistic, and the outline of the selection,
        // since a data color alone does not tell it from the marks around it.
        const statistic = rule === 'glyph' || rule === 'area' ? this.statisticColor(part) : null;
        if (statistic) {
            copy.style.setProperty(property, statistic);
            outline(copy, context.outline);
        }

        const drawn = drawAutoPart(mark, part, design, copy, context, statistic !== null);
        // Moved points and traced lines are drawn over the marks they cross.
        if (rule === 'position' || rule === 'trace') this._moved.push(...drawn);
        writes.push(() => {
            let after: Node = mark;
            for (const element of drawn) {
                mark.parentNode?.insertBefore(element, after.nextSibling);
                after = element;
            }
        });
    }

    /**
     * Color of a part's subset statistic (avg, min, max), when the marks are
     * colored by the value the part reduces; otherwise `null`.
     */
    private statisticColor(part: SegregatedPart): string | null {
        const colorAttribute = this.renderColorAttribute;
        const { additive, value, totalValue } = part.part;
        if (additive || value === null || !colorAttribute || this._colorProperty !== 'fill') return null;
        if (Number(valueAtPath(part.datum, colorAttribute)) !== totalValue) return null;
        return this.getMarkColor({ ...part.datum, [colorAttribute]: value } as AutkDatum);
    }

    /**
     * Brush test in the marks group's coordinates, also for marks placed with
     * `transform` (theirs or a parent's), which built-in plots never use.
     */
    protected override markIntersectsRect(node: SVGGeometryElement, x0: number, y0: number, x1: number, y1: number): boolean {
        const group = this.marksGroup.node();
        const groupMatrix = group && typeof group.getScreenCTM === 'function' ? group.getScreenCTM() : null;
        const toNode = groupMatrix && typeof node.getScreenCTM === 'function'
            ? node.getScreenCTM()?.inverse().multiply(groupMatrix)
            : null;
        if (!toNode || toNode.isIdentity) return super.markIntersectsRect(node, x0, y0, x1, y1);

        // Brush corners in the mark's own coordinates (exact for translate and scale).
        const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(toNode));
        const xs = corners.map(p => p.x);
        const ys = corners.map(p => p.y);
        return super.markIntersectsRect(node, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    }

    /**
     * Checks the annotations of the current drawing against the contract.
     *
     * 1. Every mark binds a rendered row. 2. Every rendered row produced by features has a mark,
     * is drawn as context (`autkContext`, e.g. a treemap group frame), or is outside a configured
     * categorical display domain. 3. Marks are inside the
     * marks group (or the HTML container). 4. Marks are SVG shapes with a box, or HTML elements
     * (click only). 5. The highlight annotations are valid (`data-autk-highlight`). (6, the
     * segregated view on a test selection, is run by `checkPlot`.)
     */
    private checkDrawing(omitted: ReadonlySet<AutkDatum>): ContractViolation[] {
        const violations: ContractViolation[] = [];
        this.drawingTruncated = false;
        const report = (invariant: number, message: string) => {
            if (violations.length < 20) violations.push({ invariant, message });
            else this.drawingTruncated = true;
        };
        const group = this.marksGroup.node();
        const html = this._html;
        const brushes = this._enabledEvents.some(event => event === PlotEvent.BRUSH || event === PlotEvent.BRUSH_X || event === PlotEvent.BRUSH_Y);
        const rows = new Set<object>(this._data);
        const marked = new Set<object>();

        d3.select(this._div).selectAll<Element, unknown>('.autkMark').each(function (d, index) {
            const tag = `<${this.tagName.toLowerCase()}> mark ${index}`;
            if (d == null || typeof d !== 'object' || !rows.has(d)) {
                const bound = d == null ? 'no datum'
                    : typeof d !== 'object' ? `a ${typeof d}, not one of the rows it received (bind the rows themselves)`
                    : 'an object that is not a rendered row (a copy?)';
                report(1, `${tag} binds ${bound}`);
            } else {
                marked.add(d);
            }
            if (!group?.contains(this) && !html?.contains(this)) report(3, `${tag} is outside the marks group and the HTML container`);
            if (this instanceof SVGElement) {
                if (!SHAPE_TAGS.includes(this.tagName.toLowerCase())) report(4, `${tag} is not an SVG shape with a bounding box (${SHAPE_TAGS.join(', ')})`);
                else if (invalidGeometry(this)) report(4, `${tag} has NaN in its geometry (${invalidGeometry(this)})`);
            } else if (!(this instanceof HTMLElement)) {
                report(4, `${tag} is neither an SVG shape nor an HTML element`);
            } else if (brushes) {
                report(4, `${tag} is HTML: HTML marks support click and hover, not brush`);
            }
            const highlight = this.getAttribute('data-autk-highlight');
            if (highlight !== null && !MARK_HIGHLIGHTS.includes(highlight)) {
                report(5, `${tag} has data-autk-highlight="${highlight}" (expected ${MARK_HIGHLIGHTS.join(' or ')})`);
            }
        });

        // Rows drawn only as context, such as the frame of a treemap group.
        const context = new Set<object>();
        d3.select(this._div).selectAll<Element, unknown>('.autkContext').each(function (d, index) {
            if (d != null && typeof d === 'object' && rows.has(d)) context.add(d);
            // A context element with NaN geometry is not drawn, so its row does not appear.
            const broken = this instanceof SVGElement ? invalidGeometry(this) : null;
            if (broken) report(2, `<${this.tagName.toLowerCase()}> context ${index} has NaN in its geometry (${broken}): its row is not drawn`);
        });
        this._data.forEach((row, index) => {
            // A row produced by no feature (a zero density) has nothing to select or highlight.
            const empty = Array.isArray(row.autkIds) && row.autkIds.length === 0;
            if (!marked.has(row) && !context.has(row) && !empty && !omitted.has(row)) {
                report(2, `row ${index} (${this.rowIdOf(row) ?? '?'}) has no mark: it can be neither selected nor highlighted `
                    + '(draw it as autkMark, or as autkContext if it is only context)');
            }
        });
        return violations;
    }

    /**
     * Applies a test selection and checks that every selected part is drawn (invariant 6).
     *
     * @returns Violations of invariant 6, or `null` when no part can be tested.
     */
    checkParts(): ContractViolation[] | null {
        const half = this._sourceFeatures.map((_f, i) => i).filter(i => i % 2 === 0);
        const shares = this._sourceFeatures.map((_f, feature) => ({ feature, selectedUnits: 1, totalUnits: 2 }));
        this.setSelection(half, shares);
        // Only rows drawn as marks show a part; context rows do not.
        const marked = new Set<unknown>();
        // A mark annotated `data-autk-highlight="none"` asks for no part.
        d3.select(this._div).selectAll('.autkMark:not([data-autk-highlight="none"])').each(d => { marked.add(d); });
        const expected = new Set(this.segregatedParts().filter(p => marked.has(p.datum)).map(p => p.mark));
        const drawn = new Set(Array.from(this._div.querySelectorAll('.autkPartial, .autkMark[data-autk-filled]'))
            .map(element => element.getAttribute('data-autk-provenance')));
        const misplaced = Array.from(this._div.querySelectorAll('.autkPartial')).filter(e => !this.marksGroup.node()?.contains(e));
        this.setSelection([]);
        if (expected.size === 0) return null;

        const violations: ContractViolation[] = [];
        const missing = Array.from(expected).filter(mark => !drawn.has(mark));
        if (missing.length > 0) {
            violations.push({
                invariant: 6,
                message: `${missing.length} of ${expected.size} selected parts are not drawn (e.g. ${missing[0]}); `
                    + 'partial elements need class autkPartial and data-autk-provenance',
            });
        }
        if (misplaced.length > 0) violations.push({ invariant: 6, message: `${misplaced.length} partial elements are outside the marks group` });
        return violations;
    }
}

/** Whether a path is filled (its fill set, and not `none`). */
function isFilled(path: SVGPathElement): boolean {
    const fill = path.style.fill || path.getAttribute('fill');
    return !!fill && fill !== 'none';
}

/** Geometry attributes a browser cannot draw when they hold NaN. */
const GEOMETRY = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'd', 'points', 'transform'];

/** First geometry attribute holding NaN, or `null` (D3 writes "NaN" for an undefined coordinate). */
function invalidGeometry(element: Element): string | null {
    return GEOMETRY.find(name => /NaN/.test(element.getAttribute(name) ?? '')) ?? null;
}

/**
 * Draws a plot definition on sample data and checks it against the drawing
 * contract, reporting which invariant each violation breaks.
 *
 * A host outside the document is attached off screen while the check runs:
 * a browser measures no geometry outside the document, and the highlight is
 * inferred from that geometry. It is detached again after.
 *
 * @param definition Plot to check.
 * @param div Host element for the check drawing (it is left drawn).
 * @param config Plot configuration (collection, attributes, transform, ...).
 * @returns Violations by invariant (invariant `0` when `draw` throws or the plot refuses the
 * config), and the highlight resolved for each mark family.
 * @example
 * const report = checkPlot(definition, document.createElement('div'), {
 *   collection: geojson,
 *   attributes: { axis: ['category', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 * });
 * report.violations.forEach(v => console.warn(`invariant ${v.invariant}: ${v.message}`));
 */
export function checkPlot(definition: PlotDefinition, div: HTMLElement, config: Omit<PlotConfig, 'div'>): ContractReport & { designs: HighlightDesign[] } {
    if (div.isConnected || typeof document === 'undefined' || !document.body) return checkConnected(definition, div, config);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
    probe.append(div);
    document.body.append(probe);
    try {
        return checkConnected(definition, div, config);
    } finally {
        div.remove();
        probe.remove();
    }
}

/** `checkPlot` on a host in the document. */
function checkConnected(definition: PlotDefinition, div: HTMLElement, config: Omit<PlotConfig, 'div'>): ContractReport & { designs: HighlightDesign[] } {
    enforcing = false;
    let plot: RegisteredPlot;
    try {
        plot = new RegisteredPlot({ ...config, div }, definition);
    } catch (error) {
        return { violations: [{ invariant: 0, message: (error as Error).message }], skipped: [1, 2, 3, 4, 5, 6], designs: [] };
    } finally {
        enforcing = true;
    }
    const violations = [...plot.drawingViolations];
    const skipped: number[] = [];
    // The test selection needs marks that bind rows inside the group.
    if (violations.some(v => v.invariant <= 4)) {
        skipped.push(6);
    } else {
        let parts: ContractViolation[] | null;
        try {
            parts = plot.checkParts();
        } catch (error) {
            parts = [{ invariant: 6, message: `drawing the parts threw: ${(error as Error).message}` }];
        }
        if (parts === null) skipped.push(6);
        else violations.push(...parts);
    }
    return { violations, skipped, ...(plot.drawingTruncated ? { truncated: true } : {}), designs: plot.highlightDesigns };
}
