/**
 * @fileoverview Density chart: a kernel density estimate of a numeric attribute.
 *
 * Provides a D3-based density chart with the following features:
 * - **Smooth curve**: The estimated density of the `density` preset, filled
 *   under the curve; with a group column, one curve per group in grey shades
 * - **Point marks**: Grid points along the curve are the marks; a horizontal
 *   brush selects an interval of values
 * - **Fractional coverage**: Each feature spreads its kernel over the points
 *   near its value with real weights. Selecting an interval covers each feature
 *   by the part of its kernel mass inside it, sent as fractional shares
 * - **Segregated view**: A selection from another view draws the density of the
 *   selected features alone, which always lies under the total curve
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'density',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area'] },
 *   transform: { preset: 'density' },
 *   labels: { axis: ['area', 'density'], title: 'Distribution of areas' },
 *   events: [PlotEvent.BRUSH_X]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import { markId } from '../provenance';

import type { DensityPointRow } from '../transforms';

/** Radius of a grid point mark in pixels. */
const POINT_RADIUS = 2.5;

/**
 * Density chart of the `density` preset.
 */
export class Densitychart extends PlotBaseInteractive {

    /** Linear scale of the numeric column. */
    protected mapX!: d3.ScaleLinear<number, number>;
    /** Linear scale of the density. */
    protected mapY!: d3.ScaleLinear<number, number>;
    /** Groups, in curve order. */
    protected groups: string[] = [];

    /**
     * Creates a density chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `density` transform.
     * @throws If the transform is missing or is not `density`.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { config.tickFormats = ['~s', '']; }
        if (!config.transform || config.transform.preset !== 'density') {
            throw new Error('Density chart requires a density transform preset.');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, axes, curves, and grid point marks.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const points = this._data as unknown as DensityPointRow[];
        this.groups = Array.from(new Set(points.map(p => p.group)));

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

        // ---- Scales
        const [lo, hi] = d3.extent(points, p => p.x) as [number | undefined, number | undefined];
        this.mapX = d3.scaleLinear().domain([lo ?? 0, hi ?? 1]).range([0, width]);
        this.mapY = d3.scaleLinear().domain([0, (d3.max(points, p => p.value) || 1) * 1.05]).range([height, 0]);

        // ---- Axes: densities are relative, so the y axis shows no numbers
        const xAxis = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxis.call(d3.axisBottom(this.mapX).ticks(6).tickFormat(d3.format(this._tickFormats[0] || '~s')));
        xAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 12)
            .style('fill', '#000')
            .text(d => d);

        const yAxis = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        yAxis.call(d3.axisLeft(this.mapY).ticks(0).tickSizeOuter(0));
        yAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1] ?? 'density']).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -8)
            .attr('x', 0)
            .style('fill', '#000')
            .text(d => d);

        // ---- Curves and points
        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGPathElement, string>('.autk-density-curve')
            .data(this.groups).join('path')
            .attr('class', 'autk-density-curve')
            .attr('d', g => this.areaPath(points.filter(p => p.group === g).map(p => [p.x, p.value])))
            .style('fill', g => this.shadeOf(g))
            .style('fill-opacity', 0.45)
            .style('stroke', g => this.shadeOf(g))
            .style('stroke-width', 1.5)
            .style('pointer-events', 'none');

        cGroup.selectAll<SVGCircleElement, DensityPointRow>('.autkMark')
            .data(points).join('circle')
            .attr('class', 'autkMark')
            .attr('cx', p => this.mapX(p.x))
            .attr('cy', p => this.mapY(p.value))
            .attr('r', POINT_RADIUS)
            .style('fill', p => this.getMarkColor(p))
            .style('cursor', 'pointer')
            .selectAll('title').data(p => [p]).join('title')
            .text(p => `${p.label}: ${p.autkIds.length} ${p.autkIds.length === 1 ? 'feature' : 'features'} within one bandwidth`);

        this.configureSignalListeners();
    }

    /**
     * Colors unselected points by the shade of their group's curve.
     *
     * @param d Bound datum of a point.
     * @returns The highlight color when selected, the group shade otherwise.
     */
    protected override getMarkColor(d: unknown): string {
        if (this.isMarkHighlighted(d)) return this.highlightColor;
        return this.shadeOf((d as DensityPointRow).group);
    }

    /**
     * Points reduce real-weighted contributions of many features, so they show partial contributions.
     *
     * @returns Always `true`; the chart requires the `density` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws, for each curve, the density of the selected features alone: the
     * sum of their kernel weights at every point. It is a part of the total,
     * so it always lies under the total curve.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || !this.mapX || !this.mapY) return;

        const parts = this.segregatedParts();
        const byMark = new Map(parts.map(p => [p.mark, p]));
        const points = this._data as unknown as DensityPointRow[];
        const subsetOf = (g: string): [number, number][] => points
            .filter(p => p.group === g)
            .map(p => {
                const rowId = this.rowIdOf(p);
                return [p.x, (rowId ? byMark.get(markId(rowId))?.part.value : undefined) ?? 0];
            });
        const touched = parts.length === 0 ? [] : this.groups.filter(g => parts.some(p => (p.datum as unknown as DensityPointRow).group === g));

        group.selectAll<SVGPathElement, string>('.autkPartialArea')
            .data(touched, g => g)
            .join(enter => enter.insert('path', '.autkMark'))
            .attr('class', 'autkPartialArea')
            .attr('d', g => this.areaPath(subsetOf(g)))
            .style('fill', this.highlightColor)
            .style('fill-opacity', 0.6)
            .style('stroke', PlotStyle.provenanceStroke)
            .style('stroke-width', 1.5)
            .style('pointer-events', 'none');

        group.selectAll<SVGCircleElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join('circle')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('cx', p => this.mapX((p.datum as unknown as DensityPointRow).x))
            .attr('cy', p => this.mapY(p.part.value ?? 0))
            .attr('r', POINT_RADIUS)
            .style('fill', this.highlightColor)
            .style('stroke', PlotStyle.provenanceStroke)
            .style('pointer-events', 'none');
    }

    /** Smooth filled curve through `[x, density]` points, down to zero. */
    private areaPath(points: [number, number][]): string {
        return d3.area<[number, number]>()
            .x(p => this.mapX(p[0]))
            .y0(this.mapY(0))
            .y1(p => this.mapY(p[1]))
            .curve(d3.curveMonotoneX)(points) ?? '';
    }

    /** Grey shade of a group's curve. */
    private shadeOf(group: string): string {
        return PlotStyle.shade(Math.max(0, this.groups.indexOf(group)), this.groups.length);
    }
}
