/**
 * @fileoverview Chord diagram of the co-occurrence of two categorical attributes.
 *
 * Provides a D3-based chord diagram with the following features:
 * - **Two halves**: The categories of the first attribute lie on the left half
 *   of a circle, those of the second on the right half, each as an arc sized
 *   by its reduced value
 * - **Ribbons**: Each pair of categories that occur together in some feature
 *   is a ribbon between their arcs, as wide as the pair's reduced value
 * - **Marks**: Arcs and ribbons are both interactive, like Sankey nodes and links
 * - **Segregated view**: A selection from another view fills the selected
 *   part of each ribbon (a narrower ribbon at both ends) and of each arc
 * - **Transform required**: Data must be built with the `flows` preset over
 *   exactly two columns and an additive reducer (count or sum)
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'chord',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'cdta2020'] },
 *   transform: { preset: 'flows' },
 *   labels: { title: 'Land use × district' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';

import type { FlowLinkRow, FlowNodeRow, FlowRow } from '../transforms';

/** Thickness of a category arc in pixels. */
const ARC_WIDTH = 10;
/** Angle between arcs of the same half, in radians. */
const PAD_ANGLE = 0.03;
/** Empty angle at the top and bottom of the circle, between the halves, in radians. */
const POLE_GAP = 0.12;
/** Fill opacity of ribbons that are not highlighted. */
const RIBBON_OPACITY = 0.45;

/** Angular range in radians, clockwise from 12 o'clock. */
type Range = { start: number; end: number };
/** Laid-out geometry of an arc or a ribbon. */
type ChordBox = { kind: 'node'; range: Range } | { kind: 'link'; source: Range; target: Range };

/**
 * Chord diagram of the `flows` preset over two columns.
 */
export class Chord extends PlotBaseInteractive {

    /** Laid-out geometry of each rendered row. */
    protected layout: Map<object, ChordBox> = new Map();
    /** Inner radius of the arcs, where ribbons end. */
    protected innerRadius = 0;

    /**
     * Creates a chord diagram and performs the initial draw.
     *
     * @param config Plot configuration. Must include a two-column `flows` transform with an additive reducer.
     * @throws If the transform is missing, is not `flows`, has not two columns, or is not additive.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (!config.transform || config.transform.preset !== 'flows') {
            throw new Error('Chord requires a flows transform preset.');
        }
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length !== 2) {
            throw new Error('Chord requires exactly two categorical columns.');
        }
        const reducer = config.transform.options?.reducer ?? 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Chord requires an additive reducer (count or sum).');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, ribbons, arcs, and arc labels.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        if (!svg.node()) throw new Error('SVG element could not be created.');

        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title
        svg.selectAll<SVGTextElement, string>('#plotTitle')
            .data(this._title ? [this._title] : []).join('text')
            .attr('id', 'plotTitle')
            .attr('class', 'plot-title')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);

        // Room around the circle for the arc labels.
        this.innerRadius = Math.max(10, Math.min(width, height) / 2 - ARC_WIDTH - 30);
        this.layoutChords();
        const rows = this._data as FlowRow[];
        const nodes = rows.filter((r): r is FlowNodeRow => r.kind === 'node');
        const links = rows.filter((r): r is FlowLinkRow => r.kind === 'link');

        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left + width / 2}, ${this._margins.top + height / 2})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('x', -width / 2).attr('y', -height / 2)
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        // ---- Marks: ribbons under arcs
        const marks = cGroup.selectAll<SVGPathElement, FlowRow>('.autkMark')
            .data([...links, ...nodes] as FlowRow[], d => d.key)
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', d => this.pathOf(this.layout.get(d)!, 1))
            .style('stroke', d => d.kind === 'node' ? '#2f2f2f' : 'none')
            .style('stroke-width', 0.5)
            .style('cursor', 'pointer');
        marks.selectAll('title').data(d => [d]).join('title')
            .text(d => `${d.label}\n${d.value} (${d.count} ${d.count === 1 ? 'feature' : 'features'})`);

        // ---- Arc labels outside the circle (never intercept clicks)
        const labelRadius = this.innerRadius + ARC_WIDTH + 4;
        cGroup.selectAll<SVGTextElement, FlowNodeRow>('.autk-chord-label')
            .data(nodes.filter(n => {
                const box = this.layout.get(n) as Extract<ChordBox, { kind: 'node' }>;
                return box.range.end - box.range.start > 0.02;
            }), d => d.key).join('text')
            .attr('class', 'autk-chord-label')
            // Radial labels: each reads outward from its arc, so neighbors never overlap.
            .attr('transform', n => {
                const { range } = this.layout.get(n) as Extract<ChordBox, { kind: 'node' }>;
                const degrees = ((range.start + range.end) / 2) * 180 / Math.PI;
                const flip = degrees > 180 ? ' rotate(180)' : '';
                return `rotate(${degrees - 90}) translate(${labelRadius}, 0)${flip}`;
            })
            .attr('dy', '0.35em')
            .attr('text-anchor', n => {
                const { range } = this.layout.get(n) as Extract<ChordBox, { kind: 'node' }>;
                return (range.start + range.end) / 2 > Math.PI ? 'end' : 'start';
            })
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(n => n.label);

        this.applyMarkStyles(marks as unknown as d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>);
        this.configureSignalListeners();
    }

    /**
     * Lays the first column's arcs on the left half and the second column's on
     * the right half, then routes each ribbon through a sub-range of both arcs,
     * ordered by the position of its other end to reduce crossings.
     */
    protected layoutChords(): void {
        const rows = this._data as FlowRow[];
        const nodes = rows.filter((r): r is FlowNodeRow => r.kind === 'node');
        const links = rows.filter((r): r is FlowLinkRow => r.kind === 'link');
        this.layout = new Map();

        const byKey = new Map(nodes.map(n => [n.key, n]));
        const columns = [0, 1].map(column => nodes.filter(n => n.column === column));
        const scale = d3.min(columns, column => {
            const total = d3.sum(column, n => Math.max(0, n.value));
            const room = Math.PI - 2 * POLE_GAP - PAD_ANGLE * Math.max(0, column.length - 1);
            return total > 0 ? Math.max(0, room) / total : Infinity;
        }) ?? 0;
        const k = Number.isFinite(scale) ? scale : 0;

        columns.forEach((column, index) => {
            // Second column: top to bottom on the right; first column: bottom to top on the left.
            let angle = (index === 1 ? 0 : Math.PI) + POLE_GAP;
            for (const node of column) {
                const span = Math.max(0, node.value) * k;
                this.layout.set(node, { kind: 'node', range: { start: angle, end: angle + span } });
                angle += span + PAD_ANGLE;
            }
        });

        const rangeOf = (key: string) => (this.layout.get(byKey.get(key)!) as Extract<ChordBox, { kind: 'node' }>).range;
        const middle = (r: Range) => (r.start + r.end) / 2;
        const used = new Map<string, number>();
        const take = (key: string, span: number): Range => {
            const start = rangeOf(key).start + (used.get(key) ?? 0);
            used.set(key, (used.get(key) ?? 0) + span);
            return { start, end: start + span };
        };
        // Source sides in the order of their targets, then target sides in the order of their sources.
        const bySource = [...links].sort((a, b) => middle(rangeOf(a.source)) - middle(rangeOf(b.source))
            || middle(rangeOf(b.target)) - middle(rangeOf(a.target)));
        const sources = new Map(bySource.map(link => [link, take(link.source, Math.max(0, link.value) * k)]));
        const byTarget = [...links].sort((a, b) => middle(rangeOf(a.target)) - middle(rangeOf(b.target))
            || middle(rangeOf(b.source)) - middle(rangeOf(a.source)));
        for (const link of byTarget) {
            this.layout.set(link, { kind: 'link', source: sources.get(link)!, target: take(link.target, Math.max(0, link.value) * k) });
        }
    }

    /**
     * Colors arcs with the shared mark color and ribbons translucently unless highlighted.
     *
     * @param svgs Selection containing the arc and ribbon marks.
     */
    protected override applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        svgs.style('fill', (d: unknown) => this.getMarkColor(d))
            .style('fill-opacity', (d: unknown) => (d as FlowRow).kind === 'link' && !this.isMarkHighlighted(d) ? RIBBON_OPACITY : 1);
    }

    /**
     * Arcs and ribbons aggregate many features, so they show partial contributions.
     *
     * @returns Always `true`.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the selected part of each mark: a narrower ribbon starting at the
     * same edge of both arcs, and the leading fraction of each arc.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const parts = this.segregatedParts().filter(p => this.layout.has(p.datum as object));
        const boxOf = (p: SegregatedPart) => this.layout.get(p.datum as object)!;
        const ordered = [...parts.filter(p => boxOf(p).kind === 'link'), ...parts.filter(p => boxOf(p).kind === 'node')];

        const partials = group.selectAll<SVGPathElement, SegregatedPart>('.autkPartial')
            .data(ordered, p => p.mark)
            .join('path')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('d', p => this.pathOf(boxOf(p), p.fraction))
            .style('fill', this.highlightColor)
            .style('fill-opacity', 0.9)
            .style('pointer-events', 'none');

        // Layers: ribbons, ribbon parts, arcs, arc parts, labels.
        group.selectAll<SVGPathElement, FlowRow>('.autkMark').filter(d => d.kind === 'node').raise();
        partials.filter(p => boxOf(p).kind === 'node').raise();
        group.selectAll('.autk-chord-label').raise();
    }

    /** Path of an arc or a ribbon, keeping the leading `fraction` of its angular ranges. */
    private pathOf(box: ChordBox, fraction: number): string {
        const cut = (r: Range): Range => ({ start: r.start, end: r.start + (r.end - r.start) * fraction });
        if (box.kind === 'node') {
            const range = cut(box.range);
            return d3.arc()({ startAngle: range.start, endAngle: range.end, innerRadius: this.innerRadius, outerRadius: this.innerRadius + ARC_WIDTH }) ?? '';
        }
        const source = cut(box.source);
        const target = cut(box.target);
        const ribbon = d3.ribbon<unknown, { startAngle: number; endAngle: number; radius: number }>();
        return (ribbon({
            source: { startAngle: source.start, endAngle: source.end, radius: this.innerRadius },
            target: { startAngle: target.start, endAngle: target.end, radius: this.innerRadius },
        }) as unknown as string) ?? '';
    }
}
