/**
 * @fileoverview Bar chart visualization supporting both categorical and binned modes.
 *
 * Provides a D3-based bar chart implementation with the following features:
 * - **Dual rendering modes**: Categorical bars and one-dimensional binned output from transformed data
 * - **Two-axis mapping**: Category/bin labels on x and numeric values on y
 * - **Selection and linked views**: Uses source feature ids for click/brush interactions across components
 *
 * The chart maintains a stable mapping between rendered bins and original source features,
 * allowing selections to remain consistent across transformations.
 *
 * @example
 * // Binned mode with map-plot linking
 * const plot = new AutkChart(plotDiv, {
 *   type: 'barchart',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', '@transform'] },
 *   transform: {
 *     preset: 'binning-1d',
 *     options: { bins: 8 }
 *   },
 *   labels: { axis: ['area range', 'count'], title: 'Distribution' },
 *   events: [ChartEvent.CLICK]
 * });
 *
 * @example
 * // Categorical mode
 * const plot = new AutkChart(plotDiv, {
 *   type: 'barchart',
 *   collection: features,
 *   attributes: { axis: ['category', 'value'] },
 *   labels: { axis: ['category', 'value'] }
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '../types-core';

import type { ChartConfig } from '../api';

import { ChartBase } from '../chart-base';

import { ChartEvent } from '../types-events';

/**
 * Bar chart implementation supporting categorical values and binned mode.
 *
 * In binned mode, rendered bins are mapped back to original source feature
 * indices so interaction payloads remain stable across transformations.
 */
export class Barchart extends ChartBase {

    /** Band scale mapping category/bin labels to pixel positions. */
    protected mapX!: d3.ScaleBand<string>;
    /** Linear scale mapping bar heights (numeric values) to pixel coordinates. */
    protected mapY!: d3.ScaleLinear<number, number>;

    /**
     * Creates a bar chart instance and performs the initial draw.
     * @param config Plot configuration with categorical axes or binning settings.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.tickFormats === undefined) { 
            config.tickFormats = ['~s', '~s']; 
        }
        if (config.transform) {
            if (config.transform.preset !== 'binning-1d') {
                throw new Error('Barchart only supports the binning-1d transform preset.');
            }

            const axis = config.labels?.axis ?? ['label', 'value'];
            const title = config.labels?.title ?? 'Distribution';
            config.labels = { axis, title };
        }
        super(config);

        this.draw();
    }

    /**
     * Renders chart scaffolding, axes, and bar marks.
     */
    render(): void {
        const svg = d3
            .select(this._div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `${this._width}px`)
            .style('height', `${this._height}px`)
            .style('visibility', 'visible');

        const node = svg.node();

        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        svg.attr('width', this._width).attr('height', this._height);

        // ---- Chart size
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title (optional)
        if (this._title && this._title.length > 0) {
            svg
                .selectAll<SVGTextElement, string>('#plotTitle')
                .data([this._title])
                .join('text')
                .attr('id', 'plotTitle')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + width / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text((d) => d);
        }

        // ---- Scales
        const xDomain = this._data.map((d) => {
            const val = d ? valueAtPath(d, this.renderAxisAttributes[0]) : 'unknown';
            return String(val);
        });
        this.mapX = d3.scaleBand().domain(xDomain).range([0, width]).padding(0.25);

        const yExtent = <[number, number]>d3.extent(this._data, (d) => d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0);
        this.mapY = d3.scaleLinear().domain([0, Math.max(yExtent[1], 1)]).range([height, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(this.mapX).tickSizeOuter(0).tickFormat((d) => {
            const value = String(d);
            const numericValue = Number(value);
            return Number.isFinite(numericValue) && value.trim() !== ''
                ? d3.format(this._tickFormats[0] || '~s')(numericValue)
                : value;
        });

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');

        xAxisSelection
            .call(xAxis)
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '-.40em')
            .attr('transform', 'rotate(-90)');

        xAxisSelection
            .selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]])
            .join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text((d) => d);

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(d3.format(this._tickFormats[1]));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

        yAxisSelection
            .selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1]])
            .join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('visibility', 'visible')
            .text((d) => d);

        // ---- Bars
        const cGroup = svg
            .selectAll('.autkBrush')
            .data([0])
            .join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup
            .selectAll('.autkClear')
            .data([0])
            .join('rect')
            .attr('class', 'autkClear')
            .attr('width', width)
            .attr('height', height)
            .style('fill', 'white')
            .style('opacity', 0)
            .style('visibility', 'visible');

        cGroup
            .selectAll('.autkMark')
            .data(this._data)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', (d) => {
                const val = d ? valueAtPath(d, this.renderAxisAttributes[0]) : 'unknown';
                return this.mapX(String(val)) || 0;
            })
            .attr('y', (d) => this.mapY(d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0))
            .attr('height', (d) => height - this.mapY(d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0))
            .attr('width', this.mapX.bandwidth())
            .style('fill', d => this.getMarkColor(d))
            .style('stroke', '#2f2f2f')
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

}
