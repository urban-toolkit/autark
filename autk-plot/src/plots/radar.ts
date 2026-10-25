/**
 * @fileoverview Radar chart of several measures per category.
 *
 * Provides a D3-based radar chart with the following features:
 * - **One axis per measure**: Measures are rescaled to `[0, 1]` by the `fold`
 *   preset so they share the radial axis
 * - **One polygon per category**: Its vertices are the reduced measures of the
 *   category (average by default); categories are told apart by grey shades
 * - **Vertex marks**: Each vertex is a mark (a category and a measure)
 * - **Segregated view**: A selection from another view draws, for each touched
 *   category, the polygon of the selected features alone. An average of a
 *   subset is not a part of the whole, so it is drawn as its own polygon
 * - **Transform required**: Data must be built with the `fold` preset
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'radar',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'shape_area', 'shape_leng', 'events_count'] },
 *   transform: { preset: 'fold' },
 *   labels: { title: 'Profile of each land use' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import type { ResolvedPlotTransform } from '../plot-base-data';
import { PlotStyle } from '../plot-style';

import type { ExecutedPlotTransform, FoldCellRow } from '../transforms';

/** Radius of a vertex mark in pixels. */
const VERTEX_RADIUS = 4;

/**
 * Radar chart of the `fold` preset: one polygon per category.
 */
export class Radar extends PlotBaseInteractive {

    /** Measure names, in axis order. */
    protected measures: string[] = [];
    /** Categories, in polygon order. */
    protected categories: string[] = [];
    /** Radius of the outer ring in pixels. */
    protected radius = 0;
    /** Value at the outer ring. */
    protected maxValue = 1;

    /**
     * Creates a radar chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `fold` transform.
     * @throws If the transform is missing or is not `fold`.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (!config.transform || config.transform.preset !== 'fold') {
            throw new Error('Radar requires a fold transform preset.');
        }

        super(config);
        this.draw();
    }

    /**
     * Keeps the measure names of the transform for the axes.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns The default resolution of the base class.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        if (result.preset === 'fold') this.measures = result.measures;
        return super.resolveTransformResult(result);
    }

    /**
     * Renders the title, rings, measure axes, category polygons, and vertices.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const cells = this._data as unknown as FoldCellRow[];
        this.categories = Array.from(new Set(cells.map(c => c.category)));
        const normalized = this._transformConfig?.preset === 'fold' ? this._transformConfig.options?.normalize !== false : true;
        this.maxValue = normalized ? 1 : Math.max(1e-9, d3.max(cells, c => c.value) ?? 1);

        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        if (!svg.node()) throw new Error('SVG element could not be created.');

        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;
        // Room around the circle for the measure names.
        this.radius = Math.max(10, Math.min(width, height) / 2 - 22);

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

        // ---- Legend of category shades, top left
        const legend = svg.selectAll<SVGGElement, string>('.autk-radar-legend')
            .data(this.categories).join('g')
            .attr('class', 'autk-radar-legend')
            .attr('transform', (_c, i) => `translate(${this._margins.left}, ${this._margins.top + 8 + i * 14})`);
        legend.selectAll('rect').data(c => [c]).join('rect')
            .attr('width', 10).attr('height', 10).attr('y', -9)
            .style('fill', c => this.shadeOf(c));
        legend.selectAll('text').data(c => [c]).join('text')
            .attr('x', 14)
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .text(c => c);

        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left + width / 2}, ${this._margins.top + height / 2})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('x', -width / 2).attr('y', -height / 2)
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        // ---- Rings and measure axes
        cGroup.selectAll<SVGCircleElement, number>('.autk-radar-ring')
            .data([0.25, 0.5, 0.75, 1]).join('circle')
            .attr('class', 'autk-radar-ring')
            .attr('r', t => t * this.radius)
            .style('fill', 'none')
            .style('stroke', '#e0e0e0');
        cGroup.selectAll<SVGLineElement, string>('.autk-radar-axis')
            .data(this.measures).join('line')
            .attr('class', 'autk-radar-axis')
            .attr('x2', (_m, i) => this.pointAt(i, this.maxValue)[0])
            .attr('y2', (_m, i) => this.pointAt(i, this.maxValue)[1])
            .style('stroke', '#d0d7de');
        cGroup.selectAll<SVGTextElement, string>('.autk-radar-measure')
            .data(this.measures).join('text')
            .attr('class', 'autk-radar-measure')
            .attr('x', (_m, i) => this.pointAt(i, this.maxValue * 1.12)[0])
            .attr('y', (_m, i) => this.pointAt(i, this.maxValue * 1.12)[1])
            .attr('dy', '0.35em')
            .attr('text-anchor', (_m, i) => {
                const x = this.pointAt(i, 1)[0];
                return Math.abs(x) < 1 ? 'middle' : x > 0 ? 'start' : 'end';
            })
            .style('font-size', '10px')
            .style('fill', '#57606a')
            .text(m => m);

        // ---- Category polygons (never intercept clicks), then vertex marks
        cGroup.selectAll<SVGPathElement, string>('.autk-radar-polygon')
            .data(this.categories).join('path')
            .attr('class', 'autk-radar-polygon')
            .attr('d', c => this.polygonOf(cells.filter(cell => cell.category === c).map(cell => [cell.measureIndex, cell.value])))
            .style('fill', c => this.shadeOf(c))
            .style('fill-opacity', 0.15)
            .style('stroke', c => this.shadeOf(c))
            .style('stroke-width', 1.5)
            .style('pointer-events', 'none');

        cGroup.selectAll<SVGCircleElement, FoldCellRow>('.autkMark')
            .data(cells).join('circle')
            .attr('class', 'autkMark')
            .attr('cx', c => this.pointAt(c.measureIndex, c.value)[0])
            .attr('cy', c => this.pointAt(c.measureIndex, c.value)[1])
            .attr('r', VERTEX_RADIUS)
            .style('fill', c => this.getMarkColor(c))
            .style('stroke', '#ffffff')
            .style('cursor', 'pointer')
            .selectAll('title').data(c => [c]).join('title')
            .text(c => `${c.label}: ${d3.format('.2~f')(c.value)}`);

        this.configureSignalListeners();
    }

    /**
     * Colors unselected vertices by the shade of their category.
     *
     * @param d Bound datum of a vertex.
     * @returns The highlight color when selected, the category shade otherwise.
     */
    protected override getMarkColor(d: unknown): string {
        if (this.isMarkHighlighted(d)) return this.highlightColor;
        return this.shadeOf((d as FoldCellRow).category);
    }

    /**
     * Cells aggregate the units of many features, so they can show partial contributions.
     *
     * @returns Always `true`; the radar requires the `fold` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the polygon of the selected features of each touched category, and
     * its vertices. Each vertex applies the cell reducer to the selected units only.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || this.radius === 0) return;

        const parts = this.segregatedParts().filter(p => p.part.value !== null);
        const cellOf = (p: SegregatedPart) => p.datum as unknown as FoldCellRow;
        const touched = Array.from(new Set(parts.map(p => cellOf(p).category)));

        group.selectAll<SVGPathElement, string>('.autkPartialLine')
            .data(touched, c => c)
            .join(enter => enter.insert('path', '.autkMark'))
            .attr('class', 'autkPartialLine')
            .attr('d', c => this.polygonOf(parts.filter(p => cellOf(p).category === c).map(p => [cellOf(p).measureIndex, p.part.value ?? 0])))
            .style('fill', this.highlightColor)
            .style('fill-opacity', 0.25)
            .style('stroke', this.highlightColor)
            .style('stroke-width', 2)
            .style('pointer-events', 'none');

        group.selectAll<SVGCircleElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join('circle')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('cx', p => this.pointAt(cellOf(p).measureIndex, p.part.value ?? 0)[0])
            .attr('cy', p => this.pointAt(cellOf(p).measureIndex, p.part.value ?? 0)[1])
            .attr('r', VERTEX_RADIUS - 0.5)
            .style('fill', this.highlightColor)
            .style('stroke', PlotStyle.provenanceStroke)
            .style('pointer-events', 'none');
    }

    /** Position of a value on the axis of a measure; the first axis points up. */
    private pointAt(measureIndex: number, value: number): [number, number] {
        const angle = (2 * Math.PI * measureIndex) / Math.max(1, this.measures.length);
        const r = (Math.max(0, value) / this.maxValue) * this.radius;
        return [Math.sin(angle) * r, -Math.cos(angle) * r];
    }

    /** Closed polygon through `[measureIndex, value]` vertices, in axis order. */
    private polygonOf(vertices: [number, number][]): string {
        const points = [...vertices].sort((a, b) => a[0] - b[0]).map(([m, v]) => this.pointAt(m, v));
        return points.length > 0 ? `M${points.map(p => p.join(',')).join('L')}Z` : '';
    }

    /** Grey shade of a category. */
    private shadeOf(category: string): string {
        return PlotStyle.shade(Math.max(0, this.categories.indexOf(category)), this.categories.length);
    }
}
