/**
 * @fileoverview Heat matrix chart for visualizing a numeric dimension across two categorical axes.
 *
 * Provides a D3-based heat matrix implementation with the following features:
 * - **Grid rendering**: Each unique (x, y) category pair maps to a filled rectangle
 * - **Color encoding**: A third numeric attribute is mapped to a colormap interpolator
 * - **Selection and linked views**: Uses source feature ids for click/brush interactions across components
 * - **Transform required**: Data must be aggregated via the `heatmatrix` transform preset before rendering
 *
 * @example
 * const plot = new AutkChart(plotDiv, {
 *   type: 'heatmatrix',
 *   collection: geojson,
 *   transform: {
 *     preset: 'heatmatrix',
 *     attributes: { x: 'day', y: 'hour', value: 'count' },
 *     options: { reducer: 'sum' }
 *   },
 *   labels: { axis: ['Day', 'Hour'], title: 'Activity Heatmap' },
 *   colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_BLUES
 * });
 */

import * as d3 from 'd3';

import { valueAtPath, ColorMap } from '../core-types';

import type { AutkDatum, ChartConfig } from '../api';

import { ChartBase } from '../chart-base';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../events-types';

import { run } from '../transforms';
import type { ExecutedHeatmatrixTransform } from '../transforms';

/**
 * Heat matrix chart mapping two categorical dimensions to a grid of colored rectangles.
 *
 * Requires the `heatmatrix` transform preset. After `computeTransform` runs,
 * `this._attributes` is `['x', 'y', 'value']` and `this.data` contains one row per
 * unique (x, y) cell.
 */
export class Heatmatrix extends ChartBase {

    /**
     * Creates a heat matrix instance and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `heatmatrix` transform preset.
     * @throws If the transform preset is missing or not `'heatmatrix'`.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.tickFormats === undefined) { config.tickFormats = ['', '']; }

        if (!config.transform || config.transform.preset !== 'heatmatrix') {
            throw new Error('Heatmatrix requires a heatmatrix transform preset.');
        }

        super(config);
        this.draw();
    }

    /**
     * Aggregates all source features into per-cell rows via the `heatmatrix` preset.
     *
     * Updates `this.data` with one row per unique (x, y) pair and sets
     * `this._attributes` to `['x', 'y', 'value']`.
     */
    protected override computeTransform(): void {
        const allRows = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];

        const transformed = run(allRows, this._transformConfig!) as ExecutedHeatmatrixTransform;
        this.data = transformed.rows as any;
        this._attributes = transformed.attributes as unknown as string[];
    }

    /**
     * Renders chart scaffolding, axes, and cell marks.
     */
    public render(): void {
        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        const node = svg.node();
        if (!svg || !node) throw new Error('SVG element could not be created.');

        // ---- Chart size
        const width  = this._width  - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top  - this._margins.bottom;

        // ---- Title
        if (this._title && this._title.length > 0) {
            svg.selectAll<SVGTextElement, string>('#plotTitle')
                .data([this._title]).join('text')
                .attr('id', 'plotTitle')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + width / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text(d => d);
        }

        // ---- Scales
        const xValues = Array.from(new Set(this.data.map(d => d ? String(valueAtPath(d, this._attributes[0])) : '')));
        const yValues = Array.from(new Set(this.data.map(d => d ? String(valueAtPath(d, this._attributes[1])) : '')));

        const mapX = d3.scaleBand().domain(xValues).range([0, width]).padding(0.05);
        const mapY = d3.scaleBand().domain(yValues).range([0, height]).padding(0.05);

        // ---- Color domain (computed from data unless explicitly provided)
        const colorValues = this.data.map(d => d ? Number(valueAtPath(d, this._attributes[2])) || 0 : 0);
        const lo = this._domain?.[0] ?? Math.min(...colorValues);
        const hi = this._domain?.[1] ?? Math.max(...colorValues);

        // ---- Axes
        const xAxisSelection = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(d3.axisBottom(mapX).tickSizeOuter(0));
        xAxisSelection.selectAll<SVGTextElement, unknown>('.tick text')
            .style('text-anchor', 'end')
            .attr('dx', '-0.6em')
            .attr('dy', '0.1em')
            .attr('transform', 'rotate(-45)');
        xAxisSelection.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axis[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text(d => d);

        const yAxisSelection = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(d3.axisLeft(mapY).tickSizeOuter(0));
        yAxisSelection.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axis[1]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('visibility', 'visible')
            .text(d => d);

        // ---- Marks group
        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0)
            .style('visibility', 'visible');

        cGroup.selectAll('.autkMark')
            .data(this.data)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', d => mapX(d ? String(valueAtPath(d, this._attributes[0])) : '') ?? 0)
            .attr('y', d => mapY(d ? String(valueAtPath(d, this._attributes[1])) : '') ?? 0)
            .attr('width',  mapX.bandwidth())
            .attr('height', mapY.bandwidth())
            .style('fill', d => {
                const v = d ? Number(valueAtPath(d, this._attributes[2])) || 0 : 0;
                const { r, g, b } = ColorMap.getColor(v, this._colorMapInterpolator, [lo, hi]);
                return `rgb(${r},${g},${b})`;
            })
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

    /**
     * Applies selection styles while preserving color-mapped fills for unselected cells.
     *
     * Selected cells use `ChartStyle.highlight`; unselected cells keep their data color.
     */
    protected override applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        const colorValues = this.data.map(d => d ? Number(valueAtPath(d, this._attributes[2])) || 0 : 0);
        const lo = this._domain?.[0] ?? Math.min(...colorValues);
        const hi = this._domain?.[1] ?? Math.max(...colorValues);
        const sel = this.selection;

        svgs.style('fill', (d: unknown) => {
            if ((d as AutkDatum)?.autkIds?.some(id => sel.includes(id))) {
                return ChartStyle.highlight;
            }
            const v = d ? Number(valueAtPath(d as Record<string, unknown>, this._attributes[2])) || 0 : 0;
            const { r, g, b } = ColorMap.getColor(v, this._colorMapInterpolator, [lo, hi]);
            return `rgb(${r},${g},${b})`;
        });
    }
}
