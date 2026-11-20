/**
 * @fileoverview Scatter plot visualization for two-dimensional numeric data.
 *
 * Provides a D3-based scatter plot implementation with the following features:
 * - **Point-based rendering**: Projects two numeric attributes as x/y marks
 * - **Two-axis mapping**: Numeric domains mapped to linear x/y scales
 * - **Selection and linked views**: Uses source feature ids for click/brush interactions across components
 *
 * @example
 * // Basic scatter plot
 * const plot = new Scatterplot({
 *   div: plotDiv,
 *   collection: geojson,
 *   attributes: { axis: ['population', 'income'] },
 *   labels: { axis: ['Population', 'Income'], title: 'Population vs Income' }
 * });
 *
 * @example
 * // Scatter plot with interaction events
 * const plot = new Scatterplot({
 *   div: plotDiv,
 *   collection: geojson,
 *   attributes: { axis: ['x', 'y'] },
 *   events: [PlotEvent.CLICK, PlotEvent.BRUSH]
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { BrushExtent } from '../types-events';

import { PlotBaseInteractive } from '../plot-base-interactive';

/**
 * Two-dimensional scatter plot with optional click/brush interactions.
 *
 * Expects exactly two numeric attributes, interpreted as x and y dimensions.
 *
 * The plot delegates interaction mechanics (click/brush selection, highlight
 * styling, and selection event emission) to the shared PlotD3 base class.
 */
export class Scatterplot extends PlotBaseInteractive {

    /** Linear scale mapping the x-attribute domain to pixel coordinates. */
    protected mapX!: d3.ScaleLinear<number, number>;
    /** Linear scale mapping the y-attribute domain to pixel coordinates. */
    protected mapY!: d3.ScaleLinear<number, number>;

    /**
     * Creates a scatter plot instance and performs the initial draw.
     *
     * @param config Plot configuration containing two attributes and optional events.
     * @throws If fewer than two active axis bindings are available.
     */
    constructor(config: PlotConfig) {
        if(config.events === undefined) { config.events = []; }
        super(config);

        if (this.renderAxisAttributes.length < 2) {
            throw new Error('Scatterplot requires two dimensions.');
        }

        this.draw();
    }

    /** The brushed box in data units (the scales run from data to pixels, so they are inverted). */
    protected override brushExtent([x0, y0, x1, y1]: [number, number, number, number], axes: 'x' | 'y' | 'xy'): BrushExtent | undefined {
        if (!this.mapX || !this.mapY) { return undefined; }
        const sorted = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);
        return {
            ...(axes !== 'y' ? { x: sorted(this.mapX.invert(x0), this.mapX.invert(x1)) } : {}),
            ...(axes !== 'x' ? { y: sorted(this.mapY.invert(y0), this.mapY.invert(y1)) } : {}),
        };
    }

    /**
     * Renders plot scaffolding, axes, and point marks.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const [xAttribute, yAttribute] = this.renderAxisAttributes;

        const svg = d3
            .select(this._div)
            .selectAll('svg.autk-plot')
            .data([0])
            .join('svg')
            .attr('class', 'autk-plot')
            .style('width', `${this._width}px`)
            .style('height', `${this._height}px`)
            .style('visibility', 'visible');

        const node = svg.node();

        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        svg.attr('width', this._width).attr('height', this._height);

        // ---- Plot size
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title (optional)
        svg
            .selectAll<SVGTextElement, string>('.plot-title')
            .data([this._title])
            .join('text')
            .attr('class', 'plot-title')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .style('visibility', 'visible')
            .text((d) => d);

        // ---- Scales
        const xExtent = <[number, number]>d3.extent(this._data, (d) => d ? Number(valueAtPath(d, xAttribute)) || 0 : 0);
        this.mapX = d3.scaleLinear().domain(xExtent).range([0, width]);

        const yExtent = <[number, number]>d3.extent(this._data, (d) => d ? Number(valueAtPath(d, yAttribute)) || 0 : 0);
        this.mapY = d3.scaleLinear().domain(yExtent).range([height, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(this.mapX).tickSizeInner(-height).tickFormat(this.tickFormat(0));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.x.axis')
            .data([0])
            .join('g')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);
        xAxisSelection.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');

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

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(this.tickFormat(1));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.y.axis')
            .data([0])
            .join('g')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);
        yAxisSelection.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');

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
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => this.mapX(d ? Number(valueAtPath(d, xAttribute)) || 0 : 0))
            .attr('cy', (d) => this.mapY(d ? Number(valueAtPath(d, yAttribute)) || 0 : 0))
            .attr('r', 5)
            .style('fill', d => this.getMarkColor(d))
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }
}
