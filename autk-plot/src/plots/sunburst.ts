/**
 * @fileoverview Sunburst chart of a hierarchy of categories.
 *
 * Draws every node of the hierarchy as a ring segment, one ring per level,
 * with an angle proportional to the reduced value:
 * - **Every level is a mark**: Clicking a top-level segment selects all its
 *   features; clicking a leaf selects only the leaf's
 * - **Segregated view**: A selection from another view fills the inner part of
 *   each segment it touches, with area equal to the selected fraction
 * - **Transform required**: Data must be built with the `hierarchy` preset and
 *   an additive reducer (count or sum), so children add up to their parent
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'sunburst',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'cdta2020'] },
 *   transform: { preset: 'hierarchy' },
 *   labels: { title: 'Regions by land use and district' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';

import type { HierarchyNodeRow } from '../transforms';

import { treeOf } from './hierarchy-tree';
import type { TreeDatum } from './hierarchy-tree';

/** Radius of the empty center, as a fraction of the chart radius. */
const HOLE = 0.18;

/** Ring segment of a node: angles `[a0, a1]` in radians and radii `[b0, b1]` in pixels. */
type Span = { a0: number; a1: number; b0: number; b1: number };

/**
 * Sunburst of the `hierarchy` preset, every node as a mark.
 */
export class Sunburst extends PlotBaseInteractive {

    /** Laid-out ring segment of each row. */
    protected spans: Map<object, Span> = new Map();

    /**
     * Creates a sunburst and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `hierarchy` transform with an additive reducer.
     * @throws If the transform is missing, is not `hierarchy`, or is not additive.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (!config.transform || config.transform.preset !== 'hierarchy') {
            throw new Error('Sunburst requires a hierarchy transform preset.');
        }
        const reducer = config.transform.options?.reducer ?? 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Sunburst requires an additive reducer (count or sum).');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, ring segments, and labels of segments large enough to hold them.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as HierarchyNodeRow[];
        const depth = d3.max(rows, r => r.level + 1) ?? 1;

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

        // ---- Layout: the root is level 0 of the partition and is not drawn
        const radius = Math.min(width, height) / 2;
        const root = d3.partition<TreeDatum>().size([2 * Math.PI, depth + 1])(treeOf(rows));
        const ring = (y: number) => radius * HOLE + ((y - 1) / depth) * radius * (1 - HOLE);
        this.spans = new Map();
        root.descendants().forEach(node => {
            if (node.data.row) this.spans.set(node.data.row, { a0: node.x0, a1: node.x1, b0: ring(node.y0), b1: ring(node.y1) });
        });

        const marks = rows.filter(r => this.spans.has(r));
        const spanOf = (r: HierarchyNodeRow) => this.spans.get(r)!;

        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left + width / 2}, ${this._margins.top + height / 2})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('x', -width / 2).attr('y', -height / 2)
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGPathElement, HierarchyNodeRow>('.autkMark')
            .data(marks).join('path')
            .attr('class', 'autkMark')
            .attr('d', r => this.pathOf(spanOf(r)))
            .style('fill', r => this.getMarkColor(r))
            .style('stroke', '#ffffff')
            .style('stroke-width', 1)
            .style('cursor', 'pointer')
            .selectAll('title').data(r => [r]).join('title')
            .text(r => `${r.path.join(' · ')}: ${d3.format('~s')(r.value)}`);

        // ---- Labels of segments wide and deep enough (never intercept clicks)
        const fits = (s: Span) => (s.a1 - s.a0) * (s.b0 + s.b1) / 2 > 34 && s.b1 - s.b0 > 12;
        cGroup.selectAll<SVGTextElement, HierarchyNodeRow>('.autk-sunburst-label')
            .data(marks.filter(r => fits(spanOf(r)))).join('text')
            .attr('class', 'autk-sunburst-label')
            .attr('transform', r => {
                const s = spanOf(r);
                const angle = (s.a0 + s.a1) / 2;
                const mid = (s.b0 + s.b1) / 2;
                return `translate(${Math.sin(angle) * mid}, ${-Math.cos(angle) * mid})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(r => r.label);

        this.configureSignalListeners();
    }

    /**
     * Segments aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the sunburst requires an additive `hierarchy` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Fills the inner part of each touched segment, with area equal to the
     * selected fraction: `r² = r₀² + f · (r₁² − r₀²)`.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const parts = this.segregatedParts().filter(p => this.spans.has(p.datum as object));
        const partOf = (p: SegregatedPart): Span => {
            const s = this.spans.get(p.datum as object)!;
            return { ...s, b1: Math.sqrt(s.b0 * s.b0 + p.fraction * (s.b1 * s.b1 - s.b0 * s.b0)) };
        };

        group.selectAll<SVGPathElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join(enter => enter.insert('path', '.autk-sunburst-label'))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('d', p => this.pathOf(partOf(p)))
            .style('fill', this.highlightColor)
            .style('stroke', '#ffffff')
            .style('stroke-width', 1)
            .style('pointer-events', 'none');
    }

    /** Path of a ring segment. */
    private pathOf(s: Span): string {
        return d3.arc()({ startAngle: s.a0, endAngle: s.a1, innerRadius: s.b0, outerRadius: s.b1 }) ?? '';
    }
}
