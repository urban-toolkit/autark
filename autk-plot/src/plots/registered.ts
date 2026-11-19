/**
 * Plot registration: D3 drawing code plus SVG annotations.
 *
 * Built-in and user plots are registered with `registerPlot` and drawn by `RegisteredPlot`. A
 * plot only draws its rows; selection, color, linking, and the segregated view are generic and
 * driven by annotations. Marks carry the class `autkMark` and bind a rendered row, inside `group`
 * (or the `html` container); a row drawn but not selectable binds an `autkContext` element. The
 * part of each mark follows the design inferred in `partial-design.ts`, unless `data-autk-part`
 * forces a rule (`shrink`, `fill-y`, `fill-x`, `none`) or `drawPart` replaces it. `checkPlot`
 * checks the annotations on sample data, and every draw repeats the checks.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig, PlotTransformConfig, TransformReducer } from '../api';
import type { ResolvedPlotTransform } from '../plot-base-data';
import type { ExecutedPlotTransform } from '../transforms';
import type { AutkDatum } from '../types-plot';
import type { ContractReport, ContractViolation } from '../provenance/validate';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import { featureId } from '../provenance';
import { PlotEvent } from '../types-events';

import { freezeDefinition, registeredTransform, transformOf } from '../transforms/registry';

import { centerOf, drawAutoPart, htmlFill, inferPartialDesign, markKindOf, outline, ratioOf, seriesPath, withDeclaredDesigns } from './partial-design';
import type { AutoPartContext, DeclaredDesign, MarkKind, PartialDesign } from './partial-design';

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
    /** Value of a row on axis `index` (default 0). */
    value: (row: AutkDatum, index?: number) => unknown;
    /** Current color of a row's mark. */
    color: (row: AutkDatum) => string;
    /** Inner width and height, without margins. */
    width: number;
    height: number;
    /**
     * Draws a bottom axis under the drawing area, labeled with `labels.axis[0]`.
     * Configure the D3 axis as usual; ticks drawn across the plot (a negative
     * `tickSizeInner`) take the grid color. The returned group can be styled further.
     */
    axisX: <Domain extends d3.AxisDomain>(axis: d3.Axis<Domain>) => d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Draws a left axis beside the drawing area, labeled with `labels.axis[1]`. */
    axisY: <Domain extends d3.AxisDomain>(axis: d3.Axis<Domain>) => d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Number format of axis `index` from `tickFormats`, or `fallback` when none is set. */
    format: (index: number, fallback?: string) => (value: d3.NumberValue) => string;
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

/** What a registered plot's `drawPart` receives. */
export type PlotPartContext = {
    /** Marks group; previous partial elements were already removed. */
    group: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Selected part of each row: its datum, mark id, and fraction in `[0, 1]`. */
    parts: SegregatedPart[];
    /** Mark elements of a row. */
    marksOf: (row: AutkDatum) => SVGGraphicsElement[];
    /** Color of the selected part. */
    color: string;
    /** Draws the automatic parts (as without `drawPart`), for a plot that adds to them. */
    drawAuto: () => void;
};

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
     * design parameters known only while drawing (e.g. the scale of `members`),
     * which complete `design`, and the series drawn through the marks.
     */
    draw: (context: PlotDrawContext) => void | { design?: Partial<Record<MarkKind, DeclaredDesign>>; series?: PlotSeries[] };
    /** Draws the selected part of marks; give each element the class `autkPartial`. */
    drawPart?: (context: PlotPartContext) => void;
    /** Mark property the plot colors. Defaults to `fill`. */
    color?: 'fill' | 'stroke';
    /** Row field the marks encode, for the design inference. Defaults to the second axis field, or `value`. */
    value?: string;
    /**
     * Segregated view design of each mark family, when the plot knows its
     * channel (e.g. `{ rect: { rule: 'length', axis: 'y', anchor: 'end' } }`).
     * Families left out are inferred from the geometry.
     */
    design?: Partial<Record<MarkKind, DeclaredDesign>>;
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
    /** Checks the configuration before drawing; throws to refuse it. */
    validate?: (config: PlotConfig) => void;
};

/** Built-in plot names: always registered, never replaced nor removed. */
const builtIns = new Set<string>();

/** Segregated view rules of `data-autk-part`. */
const PART_RULES = ['auto', 'shrink', 'fill-y', 'fill-x', 'none'];

/** Space between an axis label and the tick labels of its axis, in pixels. */
const AXIS_LABEL_GAP = 10;

/** SVG elements with a bounding box, which click, brush, and the part rules can measure. */
const SHAPE_TAGS = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image', 'use', 'g'];

const registry = new Map<string, PlotDefinition>();

/**
 * Registers a plot so `{ type: 'registered', plot: name }` draws with it.
 *
 * @param definition Plot to register.
 * @throws If the name is empty or taken, or `draw` is not a function.
 */
export function registerPlot(definition: PlotDefinition): void {
    if (!definition || typeof definition.name !== 'string' || definition.name.trim() === '') {
        throw new Error('A registered plot needs a non-empty name.');
    }
    if (registry.has(definition.name) || definition.name === 'registered') {
        throw new Error(`A plot is already registered as "${definition.name}".`);
    }
    if (typeof definition.draw !== 'function') throw new Error(`Plot "${definition.name}": draw must be a function.`);
    if (definition.drawPart !== undefined && typeof definition.drawPart !== 'function') {
        throw new Error(`Plot "${definition.name}": drawPart must be a function.`);
    }
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
    if (builtIns.has(name)) throw new Error(`"${name}" is a built-in plot and cannot be unregistered.`);
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
    if (config.topK && definition.topK === false) throw new Error('PlotBaseData: topK is not supported by this plot type.');
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
    if (!definition) throw new Error(`No plot is registered as "${name}".`);
    return definition;
}

/** Whether draws refuse a drawing that breaks the contract; `checkPlot` turns it off to report. */
let enforcing = true;

/** Ids of clip paths, unique across plots on the page. */
let clipCount = 0;

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
    /** Segregated view design of each mark family, inferred at every draw. */
    partialDesigns: PartialDesign[] = [];
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
        prepareConfig(config, definition);
        super(config);
        definition.validate?.(config);
        this.definition = definition;
        this._colorProperty = definition.color ?? 'fill';
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
        if (!adjust || this._domainSpec || !domain || typeof domain[0] !== 'number') return;
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
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        const svg = d3.select(this._div).selectChildren<SVGSVGElement, number>('svg')
            .data([0]).join('svg')
            .attr('id', 'plot')
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
                .attr('id', 'plotTitle')
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

        const fields = this.renderAxisAttributes;
        const reducer = this._provenance.reducer;
        this._baseColor = this.definition.baseColor?.(this._data);
        const drawn = this.definition.draw({
            svg: d3.select(svg.node()!),
            group: d3.select(group.node()!),
            html: d3.select(html.node()!),
            rows: this._data,
            fields,
            value: (row, index = 0) => valueAtPath(row, fields[index]),
            color: row => this.getMarkColor(row),
            width,
            height,
            axisX: axis => this.drawAxis(svg, 'x', axis, width, height),
            axisY: axis => this.drawAxis(svg, 'y', axis, width, height),
            format: (index, fallback) => d3.format(this._tickFormats[index] || fallback || ''),
            tickCount: (top, values, count) => (top < count && values.every(Number.isInteger) ? Math.max(1, Math.ceil(top)) : count),
            legend: (keys, color, direction) => drawLegend(d3.select(group.node()!), keys, color, direction, width),
            partRange: !reducer ? undefined
                : reducer === 'count' || reducer === 'sum' ? { additive: true }
                : { additive: false, extent: (d3.extent(this._provenance.contributions, unit => unit.value) as [number, number] | [undefined, undefined]).map(v => v ?? 0) as [number, number] },
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
                    .attr('id', 'plotTitle')
                    .attr('class', 'plot-title')
                    .style('text-align', 'center')
                    .style('font-weight', '600')
                    .style('margin', '0 0 6px')
                    .text(this._title);
            }
        }
        // A plot that draws its own brush areas (one per axis) brushes there, not on the whole group.
        if (!svg.selectAll('.autkBrush:not(.autkMarksGroup)').empty()) group.classed('autkBrush', false);
        this.rotateCrowdedTicks(svg.node()!);
        this.placeAxisLabels(svg.node()!);
        this.applyMarkStyles(d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark'));
        const valueField = this.definition.value ?? fields[1] ?? 'value';
        const valueOf = (row: AutkDatum) => {
            const value = Number(valueAtPath(row, valueField));
            return Number.isFinite(value) ? value : Number((row as Record<string, unknown>).value);
        };
        this.partialDesigns = withDeclaredDesigns(inferPartialDesign(
            Array.from(this._div.querySelectorAll('.autkMark')),
            valueOf,
            this.aggregatesRows,
            this._colorProperty,
        ), { ...this.definition.design, ...(drawn ? drawn.design : undefined) });
        // The clear area goes under the marks after the drawing, so the user code finds the group
        // empty: a plain `group.selectAll('rect')` never takes it for a mark.
        group.insert('rect', ':first-child')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);
        this.configureSignalListeners();

        this.drawingViolations = this.checkDrawing();
        if (enforcing && this.drawingViolations.length > 0) {
            const shown = this.drawingViolations.slice(0, 3).map(v => `(${v.invariant}) ${v.message}`).join('; ');
            throw new Error(`Plot "${this.definition.name}" breaks the drawing contract: ${shown}`);
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
    ): d3.Selection<SVGGElement, unknown, null, undefined> {
        const { left, top, bottom } = this._margins;
        const g = svg.insert('g', '.autkMarksGroup')
            .attr('id', side === 'x' ? 'axisX' : 'axisY')
            .attr('class', `${side} axis`)
            .attr('transform', side === 'x' ? `translate(${left}, ${top + height})` : `translate(${left}, ${top})`);
        g.call(axis);
        if (axis.tickSizeInner() < 0) g.selectAll('.tick line').style('stroke', PlotStyle.grid);
        const label = g.append('text')
            .attr('class', 'axis-label title')
            // An axis group has fill="none"; page styles still win over this attribute.
            .attr('fill', 'currentColor')
            // Centered on its axis; placeAxisLabels then sets it a gap away from the tick labels.
            .attr('text-anchor', 'middle')
            .text(this._axisLabels[side === 'x' ? 0 : 1] ?? '');
        if (side === 'x') label.attr('x', width / 2).attr('y', bottom / 2 + 10);
        else label.attr('transform', 'rotate(-90)').attr('y', -left / 2 - 7).attr('x', -height / 2);
        return d3.select(g.node()!) as d3.Selection<SVGGElement, unknown, null, undefined>;
    }

    /**
     * Rotates the labels of the x axis by 45° when neighbors overlap (long
     * category names), unless the plot already turned them. Text is measured
     * only in a browser; elsewhere labels stay as drawn.
     */
    private rotateCrowdedTicks(svg: SVGSVGElement): void {
        const texts = Array.from(svg.querySelectorAll<SVGTextElement>('#axisX .tick text'));
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
     */
    private placeAxisLabels(svg: SVGSVGElement): void {
        const { left, bottom } = this._margins;
        for (const side of ['x', 'y'] as const) {
            const label = svg.querySelector<SVGTextElement>(`#axis${side.toUpperCase()} > .axis-label`);
            if (!label?.textContent) continue;
            const own = label.getBoundingClientRect();
            const ticks = Array.from(svg.querySelectorAll(`#axis${side.toUpperCase()} .tick text`))
                .map(text => text.getBoundingClientRect())
                .filter(box => box.width > 0 && box.height > 0);
            if (own.width === 0 || ticks.length === 0) continue;
            const y = Number(label.getAttribute('y'));
            if (side === 'x') {
                const below = Math.max(...ticks.map(box => box.bottom)) + AXIS_LABEL_GAP;
                label.setAttribute('y', String(Math.min(bottom - 4, y + below - own.top)));
            } else {
                const beside = Math.min(...ticks.map(box => box.left)) - AXIS_LABEL_GAP;
                label.setAttribute('y', String(Math.max(-left + own.width + 2, y - (own.right - beside))));
            }
        }
    }

    /** SVG marks are colored on fill or stroke; HTML marks on their background. */
    protected override applyMarkStyles(marks: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        super.applyMarkStyles(marks.filter((_d, i, nodes) => nodes[i] instanceof SVGElement));
        // HTML marks: a highlighted background, with text that stays readable on it.
        marks.filter((_d, i, nodes) => !(nodes[i] instanceof SVGElement))
            .style('background-color', d => (this.isMarkHighlighted(d) ? this.highlightColor : this.renderColorAttribute ? this.getMarkColor(d) : 'transparent'))
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

    /** Every registered plot gets the segregated view, from its annotations or `drawPart`. */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /** Rows have the label and value the top-k cut needs when the plot reads them. */
    protected override supportsTopK(): boolean {
        return true;
    }

    /**
     * Draws the selected part of each mark: with `drawPart` when given,
     * otherwise with a copy of the mark following its `data-autk-part` rule.
     */
    protected override renderSegregatedMarks(): void {
        const group = this.marksGroup;
        if (group.empty()) return;
        group.selectAll('.autkPartial, .autkPartialSeries, .autkPartialClips').remove();
        d3.select(this._div).selectAll<HTMLElement, unknown>('.autkMark[data-autk-filled]')
            .style('background-image', null).attr('data-autk-filled', null).attr('data-autk-units', null);

        const parts = this.segregatedParts();
        if (parts.length === 0) return;

        const marks = new Map<object, SVGGraphicsElement[]>();
        d3.select(this._div).selectAll<SVGGraphicsElement, unknown>('.autkMark').each(function (d) {
            if (d == null || typeof d !== 'object') return;
            if (!marks.has(d)) marks.set(d, []);
            marks.get(d)!.push(this);
        });

        if (this.definition.drawPart) {
            this.definition.drawPart({
                group, parts, marksOf: row => marks.get(row) ?? [], color: this.highlightColor,
                drawAuto: () => this.drawAutoParts(group, parts, marks),
            });
            group.selectAll('.autkPartial').style('pointer-events', 'none');
            return;
        }
        this.drawAutoParts(group, parts, marks);
    }

    /** Draws the part of every mark with its automatic (or `data-autk-part`) rule. */
    private drawAutoParts(
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        parts: SegregatedPart[],
        marks: Map<object, SVGGraphicsElement[]>,
    ): void {
        const clips = group.append('defs').attr('class', 'autkPartialClips');
        const designs = new Map(this.partialDesigns.map(design => [design.kind, design]));
        const context: AutoPartContext = {
            color: this.highlightColor,
            outline: PlotStyle.provenanceStroke,
            clips: { append: (id, build) => build(clips.append('clipPath').attr('id', id).node()!) },
            selected: new Set(this.selection),
            membersOf: part => {
                const rowId = this.rowIdOf(part.datum);
                const selected = new Set(this.selection.map(featureId));
                return this._provenance.contributions
                    .filter(unit => unit.target === rowId && selected.has(unit.source))
                    .map(unit => ({ feature: Number(unit.source.slice('feature:'.length)), value: unit.value }));
            },
        };
        this._moved = [];
        for (const part of parts) {
            for (const mark of marks.get(part.datum) ?? []) this.copyPart(mark, part, clips, designs, context);
        }
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
        const firstPoint = Array.from(parent?.children ?? []).find(child => child.classList.contains('autkMark') && markKindOf(child, this._colorProperty) === 'point');
        parent?.insertBefore(path, firstPoint ?? series.nextSibling);
    }

    /**
     * Redraws the single `autkSeries` path (line or area) through the moved
     * points of a `position` design, for a plot that returns no series: marks
     * without a part sit at the baseline. An area is drawn only when parts add up.
     */
    private drawSeries(
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        marks: Map<object, SVGGraphicsElement[]>,
        partOf: Map<object, SegregatedPart>,
        designs: Map<MarkKind, PartialDesign>,
    ): void {
        const series = group.selectAll<SVGPathElement, unknown>('.autkSeries').nodes();
        const design = designs.get('point');
        if (series.length !== 1 || design?.rule !== 'position') return;

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
     * Inserts, after the mark, a copy that shows only its selected part.
     */
    private copyPart(
        mark: SVGGraphicsElement,
        part: SegregatedPart,
        clips: d3.Selection<SVGDefsElement, unknown, null, undefined>,
        designs: Map<MarkKind, PartialDesign>,
        context: AutoPartContext,
    ): void {
        const rule = mark.getAttribute('data-autk-part') ?? 'auto';
        if (rule === 'none') return;
        const kind = markKindOf(mark, this._colorProperty);
        const design = rule === 'auto' ? designs.get(kind) : undefined;
        if (rule === 'auto' && !design) return;

        // An HTML mark is filled to its part, from the anchor of the rule.
        if (kind === 'html') {
            const forced = { rule: rule === 'fill-y' || rule === 'fill-x' ? 'length' as const : 'glyph' as const, axis: rule === 'fill-y' ? 'y' as const : 'x' as const, anchor: rule === 'fill-y' ? 'end' as const : 'start' as const };
            const used = design ?? forced;
            const host = mark as unknown as HTMLElement;
            host.style.setProperty('background-image', htmlFill(used, ratioOf(part, used.rule), this.highlightColor));
            host.setAttribute('data-autk-filled', String(part.fraction));
            host.setAttribute('data-autk-units', `${part.part.selectedUnits}/${part.part.totalUnits}`);
            return;
        }

        const copy = mark.cloneNode(true) as SVGGraphicsElement;
        copy.querySelectorAll('title').forEach(title => title.remove());
        copy.removeAttribute('id');
        copy.setAttribute('class', 'autkPartial');
        copy.setAttribute('data-autk-provenance', part.mark);
        copy.setAttribute('data-autk-units', `${part.part.selectedUnits}/${part.part.totalUnits}`);
        copy.style.setProperty('pointer-events', 'none');
        // The part is the highlighted share of the mark: it looks like a highlighted mark.
        const style = this.definition.markStyle;
        if (style) for (const [name, value] of Object.entries(style(part.datum, true))) copy.style.setProperty(name, String(value));
        // Stroke-only marks show their part in the stroke.
        const property = kind === 'stroke' ? 'stroke' : this._colorProperty;
        for (const element of [copy, ...Array.from(copy.querySelectorAll<SVGElement>('*'))]) {
            element.style.setProperty(property, this.highlightColor);
        }

        // A subset statistic drawn inside a mark whose color encodes the value
        // takes the color of the statistic, and the outline of the selection,
        // since a data color alone does not tell it from the marks around it.
        const statistic = design && (design.rule === 'glyph' || design.rule === 'area') ? this.statisticColor(part) : null;
        if (statistic) {
            copy.style.setProperty(property, statistic);
            outline(copy, context.outline);
        }

        if (design) {
            let after: Node = mark;
            for (const drawn of drawAutoPart(mark, part, design, copy, context, statistic !== null)) {
                mark.parentNode?.insertBefore(drawn, after.nextSibling);
                after = drawn;
                // Moved points and traced lines are drawn over the marks they cross.
                if (design.rule === 'position' || design.rule === 'trace') this._moved.push(drawn);
            }
            return;
        }

        const box = mark.getBBox();
        const own = mark.getAttribute('transform') ?? '';
        if (rule === 'shrink') {
            const [ox, oy] = originOf(mark, box);
            const s = Math.sqrt(part.fraction);
            copy.setAttribute('transform', `${own} translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`.trim());
        } else {
            const id = `autk-part-${++clipCount}`;
            const f = part.fraction;
            clips.append('clipPath').attr('id', id).append('rect')
                .attr('x', box.x)
                .attr('y', rule === 'fill-y' ? box.y + box.height * (1 - f) : box.y)
                .attr('width', rule === 'fill-x' ? box.width * f : box.width)
                .attr('height', rule === 'fill-y' ? box.height * f : box.height);
            copy.setAttribute('clip-path', `url(#${id})`);
        }
        mark.parentNode?.insertBefore(copy, mark.nextSibling);
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
        const toNode = group && typeof node.getScreenCTM === 'function' && typeof group.getScreenCTM === 'function'
            ? node.getScreenCTM()?.inverse().multiply(group.getScreenCTM()!)
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
     * or is drawn as context (`autkContext`, e.g. a treemap group frame). 3. Marks are inside the
     * marks group (or the HTML container). 4. Marks are SVG shapes with a box, or HTML elements
     * (click only). 5. `data-autk-part` and `data-autk-origin` are valid. (6, the segregated view
     * on a test selection, is run by `checkPlot`.)
     */
    private checkDrawing(): ContractViolation[] {
        const violations: ContractViolation[] = [];
        this.drawingTruncated = false;
        const report = (invariant: number, message: string) => {
            if (violations.length < 20) violations.push({ invariant, message });
            else this.drawingTruncated = true;
        };
        const group = this.marksGroup.node();
        const html = this._html;
        const brushes = this._enabledEvents.some(event => event !== PlotEvent.CLICK);
        const rows = new Set<object>(this._data);
        const marked = new Set<object>();

        d3.select(this._div).selectAll<Element, unknown>('.autkMark').each(function (d, index) {
            const tag = `<${this.tagName.toLowerCase()}> mark ${index}`;
            if (d == null || typeof d !== 'object' || !rows.has(d)) {
                report(1, `${tag} binds ${d == null ? 'no datum' : typeof d !== 'object' ? `a ${typeof d}, not one of the rows it received (bind the rows themselves)` : 'an object that is not a rendered row (a copy?)'}`);
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
                report(4, `${tag} is HTML: HTML marks support click, not brush`);
            }
            const rule = this.getAttribute('data-autk-part');
            if (rule !== null && !PART_RULES.includes(rule)) report(5, `${tag} has data-autk-part="${rule}" (expected ${PART_RULES.join(', ')})`);
            const origin = this.getAttribute('data-autk-origin');
            if (origin !== null && parseOrigin(origin) === null) report(5, `${tag} has data-autk-origin="${origin}" (expected "x,y")`);
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
            // A row produced by no feature (a zero density) has nothing to select or paint.
            const empty = Array.isArray(row.autkIds) && row.autkIds.length === 0;
            if (!marked.has(row) && !context.has(row) && !empty) {
                report(2, `row ${index} (${this.rowIdOf(row) ?? '?'}) has no mark: it can be neither selected nor painted (draw it as autkMark, or as autkContext if it is only context)`);
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
        // A mark annotated `data-autk-part="none"` asks for no part.
        d3.select(this._div).selectAll('.autkMark:not([data-autk-part="none"])').each(d => { marked.add(d); });
        const expected = new Set(this.segregatedParts().filter(p => marked.has(p.datum)).map(p => p.mark));
        const drawn = new Set(Array.from(this._div.querySelectorAll('.autkPartial, .autkMark[data-autk-filled]')).map(e => e.getAttribute('data-autk-provenance')));
        const misplaced = Array.from(this._div.querySelectorAll('.autkPartial')).filter(e => !this.marksGroup.node()?.contains(e));
        this.setSelection([]);
        if (expected.size === 0) return null;

        const violations: ContractViolation[] = [];
        const missing = Array.from(expected).filter(mark => !drawn.has(mark));
        if (missing.length > 0) violations.push({ invariant: 6, message: `${missing.length} of ${expected.size} selected parts are not drawn (e.g. ${missing[0]}); partial elements need class autkPartial and data-autk-provenance` });
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

/** Parses `data-autk-origin="x,y"`. */
function parseOrigin(value: string): [number, number] | null {
    const numbers = value.split(',').map(Number);
    return numbers.length === 2 && numbers.every(Number.isFinite) ? [numbers[0], numbers[1]] : null;
}

/** Scaling origin of a mark: `data-autk-origin`, or the center of its box. */
function originOf(mark: Element, box: DOMRect): [number, number] {
    const origin = mark.getAttribute('data-autk-origin');
    return (origin && parseOrigin(origin)) || [box.x + box.width / 2, box.y + box.height / 2];
}

/**
 * Draws a plot definition on sample data and checks it against the drawing
 * contract, reporting which invariant each violation breaks.
 *
 * A host outside the document is attached off screen while the check runs:
 * a browser measures no geometry outside the document, and the design of the
 * partial view is inferred from that geometry. It is detached again after.
 *
 * @param definition Plot to check.
 * @param div Host element for the check drawing (it is left drawn).
 * @param config Plot configuration (collection, attributes, transform, ...).
 * @returns Violations by invariant (invariant `0` when `draw` throws or the plot refuses the
 * config), and the segregated view design inferred for each mark family.
 */
export function checkPlot(definition: PlotDefinition, div: HTMLElement, config: Omit<PlotConfig, 'div'>): ContractReport & { designs: PartialDesign[] } {
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
function checkConnected(definition: PlotDefinition, div: HTMLElement, config: Omit<PlotConfig, 'div'>): ContractReport & { designs: PartialDesign[] } {
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
    return { violations, skipped, ...(plot.drawingTruncated ? { truncated: true } : {}), designs: plot.partialDesigns };
}
