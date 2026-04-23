/**
 * @fileoverview Heat matrix chart for visualizing a numeric dimension across two categorical axes.
 *
 * Provides a D3-based heat matrix implementation with the following features:
 * - **Grid rendering**: Each unique (x, y) category pair maps to a filled rectangle
 * - **Color encoding**: A third numeric attribute is mapped to a colormap interpolator
 * - **Selection and linked views**: Uses source feature ids for click/brush interactions across components
 * - **Transform required**: Data must be aggregated via the `binning-2d` transform preset before rendering
 *
 * @example
 * const plot = new AutkChart(plotDiv, {
 *   type: 'heatmatrix',
 *   collection: geojson,
 *   attributes: { axis: ['day', 'hour'], color: '@transform' },
 *   transform: {
 *     preset: 'binning-2d',
 *     options: { reducer: 'sum' }
 *   },
 *   labels: { axis: ['Day', 'Hour'], title: 'Activity Heatmap' },
 *   colorMapInterpolator: ColorMapInterpolator.SEQ_BLUES
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '../types-core';

import type { ChartConfig } from '../api';

import { ChartBase } from '../chart-base';
import { ChartEvent } from '../types-events';

import type { Binning2dCellRow } from '../transforms';

/**
 * Heat matrix chart mapping two categorical dimensions to a grid of colored rectangles.
 *
 * Requires the `binning-2d` transform preset. `ChartBase` resolves that transform
 * into rendered rows with `x`/`y` axis bindings and a `value` color binding,
 * producing one row per unique (x, y) cell.
 */
export class Heatmatrix extends ChartBase {

    /**
     * Creates a heat matrix instance and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `binning-2d` transform preset.
     * @throws If the transform preset is missing or not `'binning-2d'`.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.tickFormats === undefined) { config.tickFormats = ['', '']; }

        if (!config.transform || config.transform.preset !== 'binning-2d') {
            throw new Error('Heatmatrix requires a binning-2d transform preset.');
        }

        super(config);
        this.draw();
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

        // ---- Scales — derive sorted domains from xOrder/yOrder carried by the transform
        const xValues = Array.from(
            new Map((this._data as Binning2dCellRow[]).map(d => [d.x, d.xOrder])).entries()
        ).sort((a, b) => a[1] - b[1]).map(([label]) => label);
        const yValues = Array.from(
            new Map((this._data as Binning2dCellRow[]).map(d => [d.y, d.yOrder])).entries()
        ).sort((a, b) => a[1] - b[1]).map(([label]) => label);

        const mapX = d3.scaleBand().domain(xValues).range([0, width]).padding(0.05);
        const mapY = d3.scaleBand().domain(yValues).range([0, height]).padding(0.05);

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
            .data([this._axisLabels[0]]).join('text')
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
            .data([this._axisLabels[1]]).join('text')
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
            .data(this._data)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', d => mapX(d ? String(valueAtPath(d, this.renderAxisAttributes[0])) : '') ?? 0)
            .attr('y', d => mapY(d ? String(valueAtPath(d, this.renderAxisAttributes[1])) : '') ?? 0)
            .attr('width',  mapX.bandwidth())
            .attr('height', mapY.bandwidth())
            .style('fill', d => this.getMarkColor(d))
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

}
