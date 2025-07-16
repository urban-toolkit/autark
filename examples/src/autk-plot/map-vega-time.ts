import * as d3 from 'd3';

import { Feature, GeoJsonProperties } from 'geojson';
import { SpatialDb } from 'autk-db';
import { PlotEvent, PlotD3, D3PlotBuilder, AutkPlot } from 'autk-plot';
import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel } from 'autk-map';

export class TemporalVega {
    
    protected db!: SpatialDb;
    protected map!: AutkMap;
    protected plot!: AutkPlot;

    public async run(): Promise<void> {

        await this.loadAutkDb();
        await this.loadAutkMap();
        await this.loadAutkPlot();
    
    }

    protected async loadAutkDb() {

        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395',
            type: 'boundaries'
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/taxi.csv',
            outputTableName: 'taxi',
            geometryColumns: {
                latColumnName: 'pickup_latitude',
                longColumnName: 'pickup_longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialJoin({
            tableRootName: 'neighborhoods',
            tableJoinName: 'taxi',
            spatialPredicate: 'INTERSECT',
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'taxi',
                        column: 'hour',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

    }

    protected async loadAutkMap() {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;

        if (!canvas) {
            throw new Error('Canvas element not found.');
        }

        const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');

        this.map = new AutkMap(canvas);
        await this.map.init(boundingBox);

        await this.loadLayers();
        await this.loadLayerData();
        // this.updateMapListeners();

        this.map.draw();
    }

    protected async loadAutkPlot() {

        const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

        if (!plotBdy) {
            throw new Error('Plot body element not found.');
        }

        this.plot = new PlotD3(plotBdy, this.d3Spec(), [PlotEvent.BRUSH_X]);


        // mock data
        const mockData: {hour: number, count: number}[] = [
            { hour: 0, count: 0 },
            { hour: 1, count: 20 },
            { hour: 2, count: 30 },
            { hour: 3, count: 40 },
            { hour: 4, count: 50 },
            { hour: 5, count: 50 },
            { hour: 6, count: 80 },
            { hour: 7, count: 90 },
            { hour: 8, count: 20 },
        ];
        this.plot.data = mockData;

        this.updatePlotListeners();

        this.plot.draw();
        this.floatingPlot();
    }

    protected async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.tables) {

            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            console.log(geojson);
            data.push({ props: layerData, data: geojson });

        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }

    protected async loadLayerData(hour: number = 0, layerId: string = 'neighborhoods') {

        const thematicData: ILayerThematic[] = [];

        const geojson = await this.db.getLayer(layerId);

        if (geojson) {
            for (const feature of geojson.features) {
                const properties = feature.properties as GeoJsonProperties;

                if (!properties) {
                    continue;
                }

                const val = properties.sjoin.count.taxi || 0;

                thematicData.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [Math.random()],
                });
            }

            const valMin = Math.min(...thematicData.map((d) => d.values[0]));
            const valMax = Math.max(...thematicData.map((d) => d.values[0]));

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
        this.plot.plotEvents.addEventListener(PlotEvent.BRUSH_X, (selection: number[] | string[] | GeoJsonProperties[]) => {

            console.log(selection);
            // const locList: number[] = [];

            // selection.forEach((item: number | string | GeoJsonProperties) => {
            //     this.plot.data.forEach((d: GeoJsonProperties, id: number) => {
            //         if ((item as GeoJsonProperties)?.ntaname === d?.ntaname) {
            //             locList.push(id);
            //             return;
            //         }
            //     });
            // });

            // const layer = this.map.layerManager.searchByLayerId(layerId);
            // if (layer) {
            //     layer.layerRenderInfo.isPick = true;

            //     layer.clearHighlightedIds();
            //     layer.setHighlightedIds(locList as number[]);

            //     console.log('Map updated.');
            // }
        });
    }

    protected d3Spec(): D3PlotBuilder {
        return this.lineChart;
    }

    protected lineChart<SVGCircleElement>(
        div: HTMLElement,
        data: GeoJsonProperties[],
    ): [SVGGElement[], SVGCircleElement[]] {

        const margens = { left: 40, right: 25, top: 10, bottom: 35 };

        const svg = d3
            .select(div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `calc(${div.offsetWidth}px - 4px)`)
            .style('height', '500px')
            .style('visibility', 'visible');

        // Create main group
        const g = svg
            .append('g')
            .attr('transform', `translate(${margens.left}, ${margens.top})`);

        const node = svg.node();

        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        // ---- Tamanho do Gráfico
        const width = div.offsetWidth - margens.left - margens.right;
        const height = 500 - margens.top - margens.bottom;

        // ---- Escalas
        const xExtent: [number, number] = <[number, number]>d3.extent(data, (d) => +d?.hour || 0);
        const xScale: d3.ScaleLinear<number, number> = d3.scaleLinear().domain(xExtent).range([0, width]);

        const yExtent: [number, number] = <[number, number]>d3.extent(data, (d) => +d?.count || 0);
        const yScale: d3.ScaleLinear<number, number> = d3.scaleLinear().domain(yExtent).range([height, 0]);

        // ---- Eixos
        const xAxis = d3.axisBottom(xScale).tickSizeInner(-height).tickFormat(d3.format('.2s'));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${margens.left}, ${500 - margens.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);

        // Add X axis label:
        xAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', margens.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text('hour');

        const yAxis = d3.axisLeft(yScale).tickSizeInner(-width).tickFormat(d3.format('.2s'));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${margens.left}, ${margens.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

        // Y axis label:
        yAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margens.left / 2 - 7)
            .attr('x', -margens.top)
            .style('visibility', 'visible')
            .text('count');

        // Line generator
        const line: any = d3
            .line<{ hour: number; count: number }>()
            .x(d => xScale(d.hour))
            .y(d => yScale(d.count))
            .curve(d3.curveMonotoneX); // Smooth curve

        // Draw the line
        g.append('path')
            .datum(data)
            .attr('class', 'line')
            .attr('fill', 'none')
            .attr('stroke', '#69b3a2')
            .attr('stroke-width', 2)
            .attr('d', line);

        // The function must return the groups over which the brush will be applied
        // and the svg elements that will be affected by the brush.
        return [g.nodes() as SVGGElement[], svg.nodes() as SVGCircleElement[]];
    }

    protected floatingPlot() {
        let newX = 0,
            newY = 0,
            startX = 0,
            startY = 0;

        const plot = document.querySelector('#plot') as HTMLDivElement;
        const bar = document.querySelector('#plotBar') as HTMLDivElement;

        bar.addEventListener('mousedown', mouseDown);

        function mouseDown(e: MouseEvent) {
            startX = e.clientX;
            startY = e.clientY;

            document.addEventListener('mousemove', mouseMove);
            document.addEventListener('mouseup', mouseUp);
        }

        function mouseMove(e: MouseEvent) {
            newX = startX - e.clientX;
            newY = startY - e.clientY;

            startX = e.clientX;
            startY = e.clientY;

            plot.style.top = plot.offsetTop - newY + 'px';
            plot.style.left = plot.offsetLeft - newX + 'px';

            e.preventDefault();
            e.stopPropagation();
        }

        function mouseUp() {
            document.removeEventListener('mousemove', mouseMove);
        }

        plot.style.visibility = 'visible';
    }
}

async function main() {
    const example = new TemporalVega();
    await example.run();
}

main();
