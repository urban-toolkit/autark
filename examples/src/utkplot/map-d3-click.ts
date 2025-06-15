import * as d3 from "d3";

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'utkdb';

import { UtkPlot, PlotEvent, UtkPlotD3, D3PlotBuilder } from 'utkplot';

import {
    UtkMap, LayerType, ILayerThematic, ThematicAggregationLevel, MapEvent
} from 'utkmap';

export class MapD3 {
    protected db!: SpatialDb;
    protected map!: UtkMap;
    protected plot!: UtkPlot

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: 'http://localhost:5173/data/lower-mn.osm.pbf',
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'coastline',
                    'parks',
                    'water',
                    // 'roads',
                    // 'buildings',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialJoin({
            tableRootName: 'neighborhoods',
            tableJoinName: 'noise',
            spatialPredicate: 'INTERSECT',
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

        if (canvas && plotBdy) {
            canvas.width = canvas.height = canvas.parentElement?.clientHeight || 800;

            this.map = new UtkMap(canvas);
            await this.map.init(await this.db.getOsmBoundingBox());

            await this.loadLayers();
            await this.loadLayerData();

            this.map.updateRenderInfoOpacity('neighborhoods', 0.75);
            this.map.draw();

            const d3DataKey = 'ntaname';
            this.plot = new UtkPlotD3(plotBdy, this.d3Builder(), d3DataKey, [PlotEvent.CLICK]);

            await this.loadPlotData();

            this.updatePlotListeners();
            this.updateMapListeners(d3DataKey);

            this.plot.draw();
        }

        this.floatingPlot();
    }

    protected async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.tables) {

            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }

    protected async loadLayerData(layerId: string = 'neighborhoods') {
        const thematicData: ILayerThematic[] = [];

        const geojson = await this.db.getLayer(layerId);

        if (geojson) {
            for (const feature of geojson.features) {
                const properties = feature.properties as GeoJsonProperties;

                if (!properties) {
                    console.warn(`Feature ${feature.id} has no properties.`);
                    continue;
                }

                const val = properties.sjoin.count || 0;

                thematicData.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [val],
                });
            }

            const valMin = Math.min(...thematicData.map(d => d.values[0]));
            const valMax = Math.max(...thematicData.map(d => d.values[0]));

            for (let i = 0; i < thematicData.length; i++) {
                const val = thematicData[i].values[0];
                thematicData[i].values = [(val - valMin) / (valMax - valMin)];
            }
        }

        this.map.updateLayerThematic('neighborhoods', thematicData);
    }

    protected async loadPlotData(layerId: string = 'neighborhoods') {
        const data = (await this.db.getLayer(layerId)).features.map((f: Feature) => {
            return f.properties;
        });
        this.plot.data = data;
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[] | string[]) => {
            const layer = this.map.layerManager.searchByLayerId(layerId);

            if (layer) {
                layer.layerRenderInfo.isPick = true;

                layer.clearHighlightedIds();
                layer.setHighlightedIds(selection as number[]);
            }
        });
    }

    protected async updateMapListeners(d3DataKey: string) {
        this.map.mapEvents.addEventListener(MapEvent.PICK, (selection) => {
            // TODO Update D3.

            console.log("Plot updated.");
        });
    }

    protected d3Builder(): D3PlotBuilder {
        return this.scatterPlot;
    }

    protected scatterPlot(div: HTMLElement, d3DataKey: string, data: GeoJsonProperties[]) {
        const margens = { left: 40, right: 25, top: 10, bottom: 35 };

        const svg = d3.select(div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `calc(${div.clientWidth}px - 4px)`)
            .style('height', '500px')
            .style('visibility', 'visible');

        const node = svg.node();

        if (!svg || !node) {
            return;
        }

        // ---- Tamanho do Gráfico
        const width  = div.clientWidth - margens.left - margens.right;
        const height = 500 - margens.top - margens.bottom;

        console.log("Plot size:", { width, height });

        // ---- Escalas
        console.log("Data for scatter plot:", data);
        const xExtent = <[number, number]>d3.extent(data, d => +(d?.shape_area) || 0);
        const mapX = d3.scaleLinear().domain(xExtent).range([0, width]);

        console.log("X extent:", xExtent);

        const yExtent = <[number, number]>d3.extent(data, d => +(d?.shape_leng) || 0);
        const mapY = d3.scaleLinear().domain(yExtent).range([height, 0]);

        console.log("Y extent:", yExtent);

        // ---- Eixos
        const xAxis = d3.axisBottom(mapX)
            .tickSizeInner(-height)
            .tickFormat(d3.format(".2s"));

        const xAxisSelection = svg.selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${margens.left}, ${500 - margens.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);

        // Add X axis label:
        xAxisSelection.append("text")
            .attr('class', 'title')
            .attr("text-anchor", "end")
            .attr("x", width)
            .attr("y", margens.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text("shape_area");


        const yAxis = d3.axisLeft(mapY)
            .tickSizeInner(-width)
            .tickFormat(d3.format(".2s"));

        const yAxisSelection = svg.selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${margens.left}, ${margens.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

        // Y axis label:
        yAxisSelection.append("text")
            .attr('class', 'title')
            .attr("text-anchor", "end")
            .attr("transform", "rotate(-90)")
            .attr("y", -margens.left / 2 - 7)
            .attr("x", -margens.top)
            .style('visibility', 'visible')
            .text("shape_leng");

        // ---- Círculos
        const cGroup = svg.selectAll('#plotGroup')
            .data([0])
            .join('g')
            .attr('id', 'plotGroup')
            .attr('transform', `translate(${margens.left}, ${margens.top})`);

        cGroup.selectAll('circle')
            .data(data)
            .join('circle')
            .attr('cx', d => mapX(+(d?.shape_area) || 0))
            .attr('cy', d => mapY(+(d?.shape_leng) || 0))
            .attr('r', 6)
            .style('fill', 'lightgray')
            .style('visibility', 'visible');

        return svg;
    }

    protected floatingPlot() {
        let newX = 0, newY = 0, startX = 0, startY = 0;

        const plot = document.querySelector('#plot') as HTMLDivElement;
        const bar = document.querySelector('#plotBar') as HTMLDivElement;

        bar.addEventListener('mousedown', mouseDown)

        function mouseDown(e: MouseEvent) {
            startX = e.clientX
            startY = e.clientY

            document.addEventListener('mousemove', mouseMove)
            document.addEventListener('mouseup', mouseUp)
        }

        function mouseMove(e: MouseEvent) {
            newX = startX - e.clientX
            newY = startY - e.clientY

            startX = e.clientX
            startY = e.clientY

            plot.style.top = (plot.offsetTop - newY) + 'px';
            plot.style.left = (plot.offsetLeft - newX) + 'px';

            e.preventDefault();
            e.stopPropagation();
        }

        function mouseUp() {
            document.removeEventListener('mousemove', mouseMove)
        }

        plot.style.visibility = 'visible';
    }
}

async function main() {
    const example = new MapD3();
    await example.run();
}
main();


// export async function loadChart(data, margens = { left: 50, right: 25, top: 25, bottom: 60 }) {
//     const svg = d3.select('svg');

//     if (!svg) {
//         return;
//     }

//     // ---- Tamanho do Gráfico
//     const width = +svg.node().getBoundingClientRect().width - margens.left - margens.right;
//     const height = +svg.node().getBoundingClientRect().height - margens.top - margens.bottom;

//     // ---- Escalas
//     const distExtent = d3.extent(data, d => d.trip_distance);
//     const mapX = d3.scaleLinear().domain(distExtent).range([0, width]);

//     const tipExtent = d3.extent(data, d => d.tip_amount);
//     const mapY = d3.scaleLinear().domain(tipExtent).range([height, 0]);

//     // ---- Eixos
//     const xAxis = d3.axisBottom(mapX);
//     svg.selectAll('#axisX')
//         .data([0])
//         .join('g')
//         .attr('id', 'axisX')
//         .attr('class', 'x axis')
//         .attr('transform', `translate(${margens.left}, ${+svg.node().getBoundingClientRect().height - margens.bottom})`)
//         .call(xAxis);

//     const yAxis = d3.axisLeft(mapY);
//     svg.selectAll('#axisY')
//         .data([0])
//         .join('g')
//         .attr('id', 'axisY')
//         .attr('class', 'y axis')
//         .attr('transform', `translate(${margens.left}, ${margens.top})`)
//         .call(yAxis);

//     // ---- Círculos
//     const cGroup = svg.selectAll('#chartGroup')
//         .data([0])
//         .join('g')
//         .attr('id', 'chartGroup')
//         .attr('transform', `translate(${margens.left}, ${margens.top})`);

//     const circles = cGroup.selectAll('circle')
//         .data(data);

//     circles.enter()
//         .append('circle')
//         .attr('cx', d => mapX(d.trip_distance))
//         .attr('cy', d => mapY(d.tip_amount))
//         .attr('r', 6)
//         .style('fill', 'gray');

//     circles.exit()
//         .remove();

//     circles
//         .attr('cx', d => mapX(d.trip_distance))
//         .attr('cy', d => mapY(d.tip_amount))
//         .attr('r', 6)
//         .style('fill', 'gray');

//     // ---- Brush

//     const brush = d3.brush()
//         .filter(event => { console.log(event); return (event.metaKey || event.target.__data__.type !== "overlay") })
//         .extent([[0, 0], [width, height]])
//         .on("start brush end", brushed);

//     cGroup.append("g")
//         .attr("id", "brushGroup")
//         .attr("class", "brush")
//         .call(brush)
//         .call(g => g.select(".overlay").style("cursor", "default"));
// }
