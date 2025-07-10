import * as d3 from 'd3';
import { GeoJsonProperties } from 'geojson';

export class PcChart {
    protected _scaleX!: d3.ScalePoint<string>;
    protected _scaleY!: Record<string, d3.ScaleLinear<number, number>>;

    public build<SVGPathElement>(
        div: HTMLElement,
        data: GeoJsonProperties[],
    ): [SVGGElement[], SVGPathElement[]] {
        const margens = { left: 40, right: 25, top: 30, bottom: 35 };

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

        // ---- Chart size
        const width = div.offsetWidth - margens.left - margens.right;
        const height = 500 - margens.top - margens.bottom;

        const firstItem = data[0]?.sjoin?.count ?? {};
        const dimensions = Object.keys(firstItem);
        console.log("Dimensions:", dimensions);

        // ---- Y axis Scales
        this._scaleY = {};
        for (const i in dimensions) {
            const name = dimensions[i]
            const extent = d3.extent(data, function (d) { return d ? +d?.sjoin?.count[name] : 0; }) as [number, number];

            console.log(`Extent for ${name}:`, extent);

            this._scaleY[name] = d3.scaleLinear()
                .domain(extent)
                .range([height, 0])
        }

        // Build the X scale
        this._scaleX = d3.scalePoint()
            .range([0, width])
            .padding(1)
            .domain(dimensions);

        const path = (d: GeoJsonProperties) => {
            const points: [number, number][] = dimensions.map((name: string) => {
                const x = this._scaleX(name);
                const sx = x !== undefined ? x : 0;

                const vy = d ? +d?.sjoin?.count[name] : 0;
                const sy = this._scaleY[name](vy);

                return [sx, sy];
            });

            return d3.line()(points);
        }

        // ---- Paths
        const selection = svg.selectAll('#plotGroup').data([0]);
        const cGroup = selection.join('g')
            .attr('id', 'plotGroup');

        const svgs = cGroup
            .selectAll(".neighPath")
            .data(data)
            .join("path")
            .attr("d", path)
            .attr("class", "neighPath")
            .style("fill", "none")
            .style("stroke", "#bfbfbf")
            .style("stroke-width", "2px")
            .style("opacity", 0.5)

        d3.select('#plotGroup')
            .attr('transform', `translate(${margens.left}, ${margens.top})`);

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>(".axisY")
            .data(dimensions)
            .join("g")
            .attr("class", "axisY")
            .attr('transform', (d) => { 
                const x = this._scaleX(d);
                const sx = x !== undefined ? x : 0;

                return `translate(${margens.left + sx}, ${margens.top})`; 
            });

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        yAxisSelection
            .each(function (name) {
                const axis = d3.axisLeft(self._scaleY[name]);
                d3.select(this).call(axis);
            })
            .append("text")
            .style("text-anchor", "middle")
            .attr("y", -9)
            .text(function (d) { return d; })
            .style("fill", "black")


        return [yAxisSelection.nodes() as SVGGElement[], svgs.nodes() as SVGPathElement[]];
    }
}
