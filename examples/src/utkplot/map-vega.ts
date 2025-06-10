import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'utkdb';
import { UtkPlot, UtkPlotVega } from 'utkplot';
import {
    UtkMap, LayerType, ILayerThematic, ThematicAggregationLevel
} from 'utkmap';

import { Example } from '../example';

export class MapVega extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;
    protected plot!: UtkPlot

    protected canvas!: HTMLCanvasElement;
    
    protected plotDiv!: HTMLDivElement;
    protected plotBdy!: HTMLDivElement;
    protected plotBar!: HTMLDivElement;

    constructor() {
        super();
    }

    public buildHtmlNodes() {
        const app = document.querySelector('#app') as HTMLElement | null;

        this.canvas = document.createElement('canvas');

        this.plotDiv = document.createElement('div');
        this.plotBar = document.createElement('div');
        this.plotBdy = document.createElement('div');

        const titleDiv = document.createElement('div');

        if (!app || !titleDiv || !this.canvas) { return; }

        this.canvas.width = this.canvas.height = 1024;

        titleDiv.style.display = 'flex';
        titleDiv.style.flexDirection = 'row';
        titleDiv.style.justifyContent = 'center';
        titleDiv.style.width = '1024px';
        titleDiv.innerHTML = '<h2>map-vega.ts</h2>';

        this.plotDiv.style.position = 'fixed';
        this.plotDiv.style.zIndex = '10';
        this.plotDiv.style.backgroundColor = 'rgb(255, 255, 255)';
        this.plotDiv.style.opacity = '0.75';
        this.plotDiv.style.width = '500px';
        this.plotDiv.id = 'plotDiv';

        this.plotBar.style.width = '100%';
        this.plotBar.style.height = '30px';

        this.plotBdy.style.width = '100%';
        this.floatingDiv();

        if (app) {
            this.plotDiv.appendChild(this.plotBar);
            this.plotDiv.appendChild(this.plotBdy);

            app.appendChild(titleDiv);
            app.appendChild(this.canvas);
            app.appendChild(this.plotDiv);
        }
    }

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
                    'roads',
                    'buildings',
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

        this.map = new UtkMap(this.canvas);
        await this.map.init(await this.db.getOsmBoundingBox());

        await this.loadLayers();
        await this.updateThematicData();

        this.map.updateLayerOpacity('neighborhoods', 0.75);
        this.map.draw();

        this.plot = new UtkPlotVega(this.plotBdy, this.getVegaSpec());

        await this.loadPlotData();
        await this.updatePlotCallback();

        this.plot.draw();

        this.plotBar.style.backgroundColor = '#bfbfbf';
        this.plotDiv.style.border = '1px solid #d3d3d3';
    }

    public print(): void { }

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

    protected async updateThematicData() {
        const thematicData: ILayerThematic[] = [];

        const geojson = await this.db.getLayer('neighborhoods');

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

    protected getVegaSpec() {
        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
            description: 'A simple bar chart with embedded data.',
            data: {
                values: [],
            },
            selection: {
                "click": { "type": "single" }
            },
            width: 450,
            height: 450,
            background: "rgba(255, 255, 255, 0.75)",
            view: { "fill": "rgba(255, 255, 255, 0.75)" },
            mark: 'bar',
            encoding: {
                x: { field: 'ntaname', type: 'ordinal' },
                y: { field: 'sjoin.count', type: 'quantitative' },
                color: {
                    condition: {
                        selection: "click",
                        value: "#5dade2"
                    },
                    "value": "lightgray"
                }
            },
        };
    }

    protected async loadPlotData() {
        const data = (await this.db.getLayer('neighborhoods')).features.map((f: Feature) => {
            return f.properties;
        });
        this.plot.loadData(data);
    }

    protected async updatePlotCallback() {
        this.plot.mapCallback = (selection: number[]) => {
            const layer = this.map.layerManager.searchByLayerId('neighborhoods');

            if (layer) {
                layer.layerRenderInfo.isPick = true;

                layer.clearHighlighted();
                layer.setHighlighted(selection);

                console.log("Selection updated:", selection);
            }
        }
    }

    protected async floatingDiv() {
        let newX = 0, newY = 0, startX = 0, startY = 0;

        const floatingDiv = this.plotDiv;
        this.plotBar.addEventListener('mousedown', mouseDown)

        function mouseDown(e: MouseEvent) {
            startX = e.clientX
            startY = e.clientY

            document.addEventListener('mousemove', mouseMove)
            document.addEventListener('mouseup', mouseUp)
        }

        function mouseMove(e:MouseEvent) {
            newX = startX - e.clientX
            newY = startY - e.clientY

            startX = e.clientX
            startY = e.clientY

            floatingDiv.style.top = (floatingDiv.offsetTop - newY) + 'px';
            floatingDiv.style.left = (floatingDiv.offsetLeft - newX) + 'px';

            e.preventDefault();
            e.stopPropagation();
        }

        function mouseUp() {
            document.removeEventListener('mousemove', mouseMove)
        }
    }
}