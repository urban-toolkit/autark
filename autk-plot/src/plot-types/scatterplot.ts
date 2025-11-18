import { GeoJsonProperties } from "geojson";
import * as d3 from "d3";

// import { AutkPlot } from "../main";

export class Scatterplot {

    protected mapX!: d3.ScaleLinear<number, number>;
    protected mapY!: d3.ScaleLinear<number, number>;

    constructor(div: HTMLElement, data: GeoJsonProperties[]) {
        this.draw(div, data);
    }

    protected draw(
        div: HTMLElement,
        data: GeoJsonProperties[]
    ) {
        const margins = { left: 40, right: 25, top: 10, bottom: 35 };

        const svg = d3
            .select(div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `calc(${div.offsetWidth}px - 4px)`)
            .style('height', '500px')
            .style('visibility', 'visible');

        const node = svg.node();

        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        // ---- Tamanho do Gráfico
        const width = div.offsetWidth - margins.left - margins.right;
        const height = 500 - margins.top - margins.bottom;

        // ---- Escalas
        const xExtent = <[number, number]>d3.extent(data, (d) => +d?.shape_area || 0);
        this.mapX = d3.scaleLinear().domain(xExtent).range([0, width]);

        const yExtent = <[number, number]>d3.extent(data, (d) => +d?.shape_leng || 0);
        this.mapY = d3.scaleLinear().domain(yExtent).range([height, 0]);

        // ---- Eixos
        const xAxis = d3.axisBottom(this.mapX).tickSizeInner(-height).tickFormat(d3.format('.2s'));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${margins.left}, ${500 - margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);

        // Add X axis label:
        xAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text('shape_area');

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(d3.format('.2s'));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${margins.left}, ${margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

        // Y axis label:
        yAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margins.left / 2 - 7)
            .attr('x', -margins.top)
            .style('visibility', 'visible')
            .text('shape_leng');

        const cGroup = svg
            .selectAll('.autkBrushable')
            .data([0])
            .join('g')
            .attr('class', 'autkBrushable')
            .attr('transform', `translate(${margins.left}, ${margins.top})`);

        cGroup
            .selectAll('.autkMark')
            .data(data)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => this.mapX(+d?.shape_area || 0))
            .attr('cy', (d) => this.mapY(+d?.shape_leng || 0))
            .attr('r', 6)
            .style('fill', 'lightgray')
            .style('visibility', 'visible');
    }

}