/**
 * @fileoverview Plots registered by the user: ordinary D3 code plus SVG annotations.
 *
 * A registered plot only draws. Its rows come from the configured transform
 * (or are the features themselves), and every other behavior is generic and
 * driven by annotations, the same ones the built-in plots use:
 * - **Marks**: selectable elements carry the class `autkMark`, with a
 *   rendered row as their D3 datum (`.data(rows).join(...)`)
 * - **Marks group**: marks are drawn inside `group` (`.autkMarksGroup`), where
 *   click and brush look for them; brush boxes follow element transforms.
 *   HTML marks (table rows, divs) go in the `html` container under the SVG;
 *   they are selected by click, colored by background, and filled to their part
 * - **Context**: a row drawn but not selectable (a treemap group frame) binds
 *   an element with the class `autkContext`; every row is a mark or context
 * - **Color**: mark color (gray, highlight, `attributes.color`) is applied by
 *   the plot on the mark element, on `fill` or `stroke`
 * - **Segregated view**: without code, a copy of each mark shows the selected
 *   part. By default (`auto`), the rule comes from the design space in
 *   `partial-design.ts`: the channel that encodes the value (length, sweep,
 *   stroke width, position, area) is inferred from the marks, and the part
 *   follows it; a path with the class `autkSeries` (the line or area through
 *   the points) is redrawn through the moved points. `data-autk-part` forces a
 *   rule: `shrink` (scaled by √f about the box center or
 *   `data-autk-origin="x,y"`, area exactly f), `fill-y` / `fill-x` (clipped
 *   from the bottom / left), or `none`. A `drawPart` function replaces them.
 *
 * `checkPlot` checks the annotations on sample data, and every draw repeats
 * the checks, so a malformed drawing is refused instead of misbehaving.
 *
 * @example
 * registerPlot({
 *   name: 'dots',
 *   draw({ group, rows, width, height, value }) {
 *     const x = d3.scaleLinear(d3.extent(rows, r => +value(r, 0)), [0, width]);
 *     group.selectAll('circle').data(rows).join('circle')
 *       .attr('class', 'autkMark')
 *       .attr('cx', r => x(+value(r, 0))).attr('cy', height / 2).attr('r', 4);
 *   },
 * });
 * new AutkPlot(div, { type: 'registered', plot: 'dots', collection, attributes: { axis: ['shape_area'] } });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';
import type { ContractReport, ContractViolation } from '../provenance/validate';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { featureId } from '../provenance';
import { PlotEvent } from '../types-events';

import { centerOf, drawAutoPart, htmlFill, inferPartialDesign, markKindOf, ratioOf, seriesPath } from './partial-design';
import type { AutoPartContext, MarkKind, PartialDesign } from './partial-design';

/** What a registered plot's `draw` receives. */
export type PlotDrawContext = {
    /** Root SVG of the plot, already sized; the title is drawn by the plot. */
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** Marks group, translated by the margins; draw every mark inside it. */
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
};

/** A user plot: D3 drawing code and, optionally, its own segregated view. */
export type PlotDefinition = {
    /** Name used in `{ type: 'registered', plot: name }`. */
    name: string;
    /** Draws the marks for the rendered rows. Called on every draw. */
    draw: (context: PlotDrawContext) => void;
    /** Draws the selected part of marks; give each element the class `autkPartial`. */
    drawPart?: (context: PlotPartContext) => void;
    /** Mark property the plot colors. Defaults to `fill`. */
    color?: 'fill' | 'stroke';
    /** Row field the marks encode, for the design inference. Defaults to the second axis field, or `value`. */
    value?: string;
};

/** Segregated view rules of `data-autk-part`. */
const PART_RULES = ['auto', 'shrink', 'fill-y', 'fill-x', 'none'];

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
    if (registry.has(definition.name)) throw new Error(`A plot is already registered as "${definition.name}".`);
    if (typeof definition.draw !== 'function') throw new Error(`Plot "${definition.name}": draw must be a function.`);
    if (definition.drawPart !== undefined && typeof definition.drawPart !== 'function') {
        throw new Error(`Plot "${definition.name}": drawPart must be a function.`);
    }
    registry.set(definition.name, definition);
}

/**
 * Removes a registered plot.
 *
 * @returns Whether a plot was registered under the name.
 */
export function unregisterPlot(name: string): boolean {
    return registry.delete(name);
}

/**
 * Looks up a registered plot.
 *
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
    /** Marks group of the current drawing (kept by reference: every plot's SVG has id `plot`). */
    private _group: SVGGElement | null = null;
    /** Container of HTML marks of the current drawing. */
    private _html: HTMLDivElement | null = null;
    /** Segregated view design of each mark family, inferred at every draw. */
    partialDesigns: PartialDesign[] = [];

    /**
     * Creates the plot and performs the initial draw.
     *
     * @param config Plot configuration.
     * @param definition Registered plot that draws the marks.
     * @throws If the drawing breaks the contract (see `checkPlot`).
     */
    constructor(config: PlotConfig, definition: PlotDefinition) {
        if (config.events === undefined) { config.events = []; }
        super(config);
        this.definition = definition;
        this._colorProperty = definition.color ?? 'fill';
        this.draw();
    }

    /** Marks group of the current drawing. */
    private get marksGroup(): d3.Selection<SVGGElement, unknown, null, undefined> {
        return d3.select(this._group as SVGGElement);
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
            .style('width', `${this._width}px`).style('height', `${this._height}px`);
        svg.selectAll('*').remove();
        const html = d3.select(this._div).selectChildren<HTMLDivElement, number>('div.autk-registered-html')
            .data([0]).join('div')
            .attr('class', 'autk-registered-html')
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
        group.append('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        const fields = this.renderAxisAttributes;
        this.definition.draw({
            svg: d3.select(svg.node()!),
            group: d3.select(group.node()!),
            html: d3.select(html.node()!),
            rows: this._data,
            fields,
            value: (row, index = 0) => valueAtPath(row, fields[index]),
            color: row => this.getMarkColor(row),
            width,
            height,
        });

        // A drawing made only of HTML keeps just the title band of the SVG.
        if (group.selectChildren(':not(.autkClear)').empty() && html.selectChildren().size() > 0) {
            svg.attr('height', this._margins.top).style('height', `${this._margins.top}px`);
        }
        this.applyMarkStyles(d3.select(this._div).selectAll<d3.BaseType, unknown>('.autkMark'));
        const valueField = this.definition.value ?? fields[1] ?? 'value';
        const valueOf = (row: AutkDatum) => {
            const value = Number(valueAtPath(row, valueField));
            return Number.isFinite(value) ? value : Number((row as Record<string, unknown>).value);
        };
        this.partialDesigns = inferPartialDesign(
            Array.from(this._div.querySelectorAll('.autkMark')),
            valueOf,
            this.aggregatesRows,
            this._colorProperty,
        );
        // The clear area stays under the marks, wherever the user code drew them.
        group.select<SVGRectElement>('.autkClear').lower();
        this.configureSignalListeners();

        this.drawingViolations = this.checkDrawing();
        if (enforcing && this.drawingViolations.length > 0) {
            const shown = this.drawingViolations.slice(0, 3).map(v => `(${v.invariant}) ${v.message}`).join('; ');
            throw new Error(`Plot "${this.definition.name}" breaks the drawing contract: ${shown}`);
        }
    }

    /** SVG marks are colored on fill or stroke; HTML marks on their background. */
    protected override applyMarkStyles(marks: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        super.applyMarkStyles(marks.filter((_d, i, nodes) => nodes[i] instanceof SVGElement));
        marks.filter((_d, i, nodes) => !(nodes[i] instanceof SVGElement))
            .style('background-color', d => (this.isMarkHighlighted(d) ? this.highlightColor : this.renderColorAttribute ? this.getMarkColor(d) : 'transparent'));
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
        group.selectAll('.autkPartial, .autkPartialClips').remove();
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
            this.definition.drawPart({ group, parts, marksOf: row => marks.get(row) ?? [], color: this.highlightColor });
            group.selectAll('.autkPartial').style('pointer-events', 'none');
            return;
        }

        const clips = group.append('defs').attr('class', 'autkPartialClips');
        const designs = new Map(this.partialDesigns.map(design => [design.kind, design]));
        const context: AutoPartContext = {
            color: this.highlightColor,
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
        for (const part of parts) {
            for (const mark of marks.get(part.datum) ?? []) this.copyPart(mark, part, clips, designs, context);
        }
        this.drawSeries(group, marks, new Map(parts.map(part => [part.datum as object, part])), designs);
    }

    /**
     * Redraws the single `autkSeries` path (line or area) through the moved
     * points of a `position` design; marks without a part sit at the baseline.
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
        const fill = series[0].getAttribute('fill') ?? series[0].style.fill;
        const filled = !!fill && fill !== 'none';
        const d = seriesPath(points, design, filled);
        if (!d) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'autkPartial autkPartialSeries');
        path.setAttribute('d', d);
        path.style.setProperty('fill', filled ? this.highlightColor : 'none');
        path.style.setProperty('stroke', this.highlightColor);
        path.style.setProperty('stroke-width', series[0].getAttribute('stroke-width') ?? (series[0].style.strokeWidth || '2'));
        path.style.setProperty('pointer-events', 'none');
        if (filled) path.style.setProperty('fill-opacity', '0.6');
        series[0].parentNode?.insertBefore(path, series[0].nextSibling);
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
        // Stroke-only marks show their part in the stroke.
        const property = kind === 'stroke' ? 'stroke' : this._colorProperty;
        for (const element of [copy, ...Array.from(copy.querySelectorAll<SVGElement>('*'))]) {
            element.style.setProperty(property, this.highlightColor);
        }

        if (design) {
            let after: Node = mark;
            for (const drawn of drawAutoPart(mark, part, design, copy, context)) {
                mark.parentNode?.insertBefore(drawn, after.nextSibling);
                after = drawn;
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
     * 1. Every mark binds a rendered row. 2. Every rendered row has a mark,
     * or is drawn as context (`autkContext`, e.g. a treemap group frame).
     * 3. Marks are inside the marks group (or the HTML container). 4. Marks are
 * SVG shapes with a box, or HTML elements (click only).
     * 5. `data-autk-part` and `data-autk-origin` are valid.
     * (6, the segregated view on a test selection, is run by `checkPlot`.)
     */
    private checkDrawing(): ContractViolation[] {
        const violations: ContractViolation[] = [];
        const report = (invariant: number, message: string) => {
            if (violations.length < 20) violations.push({ invariant, message });
        };
        const group = this.marksGroup.node();
        const html = this._html;
        const brushes = this._enabledEvents.some(event => event !== PlotEvent.CLICK);
        const rows = new Set<object>(this._data);
        const marked = new Set<object>();

        d3.select(this._div).selectAll<Element, unknown>('.autkMark').each(function (d, index) {
            const tag = `<${this.tagName.toLowerCase()}> mark ${index}`;
            if (d == null || typeof d !== 'object' || !rows.has(d)) {
                report(1, `${tag} binds ${d == null ? 'no datum' : 'an object that is not a rendered row (a copy?)'}`);
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
            if (!marked.has(row) && !context.has(row)) {
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
 * @param definition Plot to check.
 * @param div Host element for the check drawing (it is left drawn).
 * @param config Plot configuration (collection, attributes, transform, ...).
 * @returns Violations by invariant (invariant `0` when `draw` throws or the plot refuses the config),
 * and the segregated view design inferred for each mark family.
 */
export function checkPlot(definition: PlotDefinition, div: HTMLElement, config: Omit<PlotConfig, 'div'>): ContractReport & { designs: PartialDesign[] } {
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
    return { violations, skipped, designs: plot.partialDesigns };
}
