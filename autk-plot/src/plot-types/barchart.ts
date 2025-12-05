import * as d3 from "d3";

import { PlotD3 } from "../plot-d3";
import { PlotConfig } from "../types";
import { PlotStyle } from "../plot-style";
import { PlotEvent } from "../constants";

export class Barchart extends PlotD3 {

    protected mapX!: d3.ScaleBand<string>;
    protected mapY!: d3.ScaleLinear<number, number>;

    constructor(config: PlotConfig) {
        if(config.events === undefined) { config.events = [PlotEvent.CLICK]; }
        super(config);

        this.draw();
    }

    public async draw(): Promise<void> {
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
        const xDomain = this.data.map((d) => {
            const val = d ? d[this._axis[0]] : 'unknown';
            return String(val);
        });
        this.mapX = d3.scaleBand().domain(xDomain).range([0, width]).padding(0.25);

        const yExtent = <[number, number]>d3.extent(this.data, (d) => d ? +d[this._axis[1]] || 0 : 0);
        this.mapY = d3.scaleLinear().domain([0, yExtent[1]]).range([height, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(this.mapX).tickSizeOuter(0);

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

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(d3.format('.2s'));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

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

        // ---- Bars
        const cGroup = svg
            .selectAll('.autkBrushable')
            .data([0])
            .join('g')
            .attr('class', 'autkBrushable autkMarksGroup')
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
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', (d) => {
                const val = d ? d[this._axis[0]] : 'unknown';
                return this.mapX(String(val)) || 0;
            })
            .attr('y', (d) => this.mapY(d ? +d[this._axis[1]] || 0 : 0))
            .attr('height', (d) => height - this.mapY(d ? +d[this._axis[1]] || 0 : 0))
            .attr('width', this.mapX.bandwidth())
            .style('fill', PlotStyle.default)
            .style('stroke', '#2f2f2f')
            .style('visibility', 'visible');

        this.configureSignalListeners();
    }

}
