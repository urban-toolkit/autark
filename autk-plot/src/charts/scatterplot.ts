import * as d3 from "d3";

import { ChartD3 } from "../chart-d3";
import type { ChartConfig } from "../api";
import { ChartStyle } from "../chart-style";
import { ChartEvent } from "../events-types";
import { valueAtPath } from "autk-core";

/**
 * Two-dimensional scatter plot with optional click/brush interactions.
 *
 * Expects two numeric attributes: x and y.
 */
export class Scatterplot extends ChartD3   {

    protected mapX!: d3.ScaleLinear<number, number>;
    protected mapY!: d3.ScaleLinear<number, number>;

    /**
     * Creates a scatter plot instance and performs the initial draw.
     * @param config Plot configuration containing two attributes and optional events.
     */
    constructor(config: ChartConfig) {
        if(config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        super(config);

        if (this._attributes.length < 2) {
            throw new Error('Scatterplot requires two dimensions. Provide `attributes: [x, y]` or `labels.axis: [x, y]`.');
        }

        this.draw();
    }

    /**
     * Renders chart scaffolding, axes, and point marks.
     * @returns Promise resolved when SVG nodes are synchronized.
     */
    public async render(): Promise<void> {
        const svg = d3
            .select(this._div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `${this._width}`)
            .style('height', `${this._height || '500px'}`)
            .style('visibility', 'visible');

        const node = svg.node();

        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        svg.attr('width', this._width).attr('height', this._height);

        // ---- Tamanho do Gráfico
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title (optional)
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

        // ---- Escalas
        const xExtent = <[number, number]>d3.extent(this.data, (d) => d ? Number(valueAtPath(d, this._attributes[0])) || 0 : 0);
        this.mapX = d3.scaleLinear().domain(xExtent).range([0, width]);

        const yExtent = <[number, number]>d3.extent(this.data, (d) => d ? Number(valueAtPath(d, this._attributes[1])) || 0 : 0);
        this.mapY = d3.scaleLinear().domain(yExtent).range([height, 0]);

        // ---- Eixos
        const xAxis = d3.axisBottom(this.mapX).tickSizeInner(-height).tickFormat(d3.format(this._tickFormats[0]));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);
        xAxisSelection.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');

        // Add X axis label:
        xAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text(this._axis[0]);

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
        yAxisSelection.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');

        // Y axis label:
        yAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('visibility', 'visible')
            .text(this._axis[1]);

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
            .data(this.data)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => this.mapX(d ? Number(valueAtPath(d, this._attributes[0])) || 0 : 0))
            .attr('cy', (d) => this.mapY(d ? Number(valueAtPath(d, this._attributes[1])) || 0 : 0))
            .attr('r', 3)
            .style('fill', ChartStyle.default)
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }
}