/**
 * @fileoverview Pie and donut charts of one grouped attribute.
 *
 * Provides a D3-based pie chart with the following features:
 * - **Part-of-whole rendering**: One slice per category or bin, sized by its reduced value
 * - **Donut variant**: The same chart with a hole of configurable size
 * - **Selection and linked views**: Clicking a slice selects all source features of its group
 * - **Segregated view**: A slice selected elsewhere fills only the part produced by the
 *   selection, as an inner slice whose area is the selected fraction
 * - **Transform required**: Data must be grouped with the `binning-1d` preset and an
 *   additive reducer (count or sum), since slices must add up to the whole
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'donut',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 *   labels: { title: 'Regions by land use' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { ResolvedPlotTransform } from '../plot-base-data';
import { registeredTransform } from '../transforms/registry';
import type { ExecutedPlotTransform } from '../transforms';
import type { SegregatedPart } from '../plot-base-interactive';

/** Minimum slice angle, in radians, for its label to be drawn inside it. */
const MIN_LABEL_ANGLE = 0.3;

/**
 * Pie chart, or donut chart when `innerRatio > 0`.
 */
export class Piechart extends PlotBaseInteractive {

    /** Hole radius as a fraction of the outer radius (`0` for a pie). */
    protected innerRatio: number;
    /** Outer radius in pixels. */
    protected outerRadius = 0;
    /** Start and end angles of each rendered row. */
    protected arcs: Map<object, d3.PieArcDatum<AutkDatum>> = new Map();

    /**
     * Creates a pie or donut chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `binning-1d` transform with count or sum.
     * @param innerRatio Hole radius as a fraction of the outer radius, in `[0, 1)`.
     * @throws If the transform is missing, is not `binning-1d`, or uses a non-additive reducer.
     */
    constructor(config: PlotConfig, innerRatio = 0) {
        if (config.events === undefined) { config.events = []; }
        const registered = config.transform?.preset === 'registered' && registeredTransform(config.transform.name).shape === 'category-value';
        if (!config.transform || (config.transform.preset !== 'binning-1d' && !registered)) {
            throw new Error('Pie and donut charts require a binning-1d transform preset.');
        }
        const reducer = config.transform.preset === 'binning-1d' ? config.transform.options?.reducer ?? 'count' : 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Pie and donut charts require an additive reducer (count or sum).');
        }

        super(config);
        this.innerRatio = innerRatio;
        this.draw();
    }

    /**
     * Rejects registered transforms whose rows are not additive: slices must
     * add up to the whole.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns The default resolution of the base class.
     * @throws If a registered transform reduces with avg, min, or max.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        if (result.preset === 'registered') {
            const reducer = result.provenance.reducer ?? 'count';
            if (reducer !== 'count' && reducer !== 'sum') {
                throw new Error('Pie and donut charts require an additive reducer (count or sum).');
            }
        }
        return super.resolveTransformResult(result);
    }

    /**
     * Renders the title, slices, and slice labels.
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

        // ---- Slices, in data order, starting at 12 o'clock
        const [labelAttr, valueAttr] = this.renderAxisAttributes;
        const rows = this._data;
        const pie = d3.pie<AutkDatum>()
            .sort(null)
            .value(d => Math.max(0, Number(valueAtPath(d, valueAttr)) || 0));
        this.arcs = new Map(pie(rows).map(arc => [arc.data as object, arc]));
        this.outerRadius = Math.max(1, Math.min(width, height) / 2 - 2);

        const arc = d3.arc<d3.PieArcDatum<AutkDatum>>()
            .innerRadius(this.outerRadius * this.innerRatio)
            .outerRadius(this.outerRadius);
        const arcOf = (d: AutkDatum) => this.arcs.get(d as object)!;

        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left + width / 2}, ${this._margins.top + height / 2})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('x', -width / 2).attr('y', -height / 2)
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGPathElement, AutkDatum>('.autkMark')
            .data(rows).join('path')
            .attr('class', 'autkMark')
            .attr('d', d => arc(arcOf(d)))
            .style('fill', d => this.getMarkColor(d))
            .style('stroke', '#ffffff')
            .style('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .selectAll('title').data(d => [d]).join('title')
            .text(d => `${valueAtPath(d, labelAttr)}: ${d3.format('~s')(Number(valueAtPath(d, valueAttr)) || 0)}`);

        // ---- Labels inside slices wide enough to hold them (never intercept clicks)
        const labelArc = d3.arc<d3.PieArcDatum<AutkDatum>>()
            .innerRadius(this.outerRadius * (this.innerRatio > 0 ? (1 + this.innerRatio) / 2 : 0.6))
            .outerRadius(this.outerRadius * (this.innerRatio > 0 ? (1 + this.innerRatio) / 2 : 0.6));
        cGroup.selectAll<SVGTextElement, AutkDatum>('.autk-pie-label')
            .data(rows.filter(d => arcOf(d).endAngle - arcOf(d).startAngle >= MIN_LABEL_ANGLE)).join('text')
            .attr('class', 'autk-pie-label')
            .attr('transform', d => `translate(${labelArc.centroid(arcOf(d))})`)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '11px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(d => String(valueAtPath(d, labelAttr)));

        this.configureSignalListeners();
    }

    /**
     * Slices have a label (`axis[0]`) and a rankable value (`axis[1]`), so they
     * support top-k; the gathered row becomes one more slice.
     *
     * @returns Always `true`.
     */
    protected override supportsTopK(): boolean {
        return true;
    }

    /**
     * Slices aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the chart requires an additive `binning-1d` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the part of each slice produced by the selected features.
     *
     * The inner slice keeps the angles of its slice and grows from the hole
     * outward, with a radius chosen so its area is the selected fraction of
     * the slice area: `r² = r₀² + f · (R² − r₀²)`.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || this.arcs.size === 0) return;

        const inner = this.outerRadius * this.innerRatio;
        const radiusOf = (p: SegregatedPart) =>
            Math.sqrt(inner * inner + p.fraction * (this.outerRadius * this.outerRadius - inner * inner));
        const pathOf = (p: SegregatedPart) => d3.arc<d3.PieArcDatum<AutkDatum>>()
            .innerRadius(inner)
            .outerRadius(radiusOf(p))(this.arcs.get(p.datum as object)!);

        group.selectAll<SVGPathElement, SegregatedPart>('.autkPartial')
            .data(this.segregatedParts().filter(p => this.arcs.has(p.datum as object)), p => p.mark)
            .join(enter => enter.insert('path', '.autk-pie-label'))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('d', pathOf)
            .style('fill', this.highlightColor)
            .style('stroke', '#ffffff')
            .style('stroke-width', 1)
            .style('pointer-events', 'none');
    }
}
