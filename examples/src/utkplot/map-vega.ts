import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'utkdb';
import { PlotEvent, UtkPlot, UtkPlotVega } from 'utkplot';
import {
    UtkMap, LayerType, ILayerThematic, ThematicAggregationLevel,MapEvent
} from 'utkmap';

export class MapVega {
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

            this.plot = new UtkPlotVega(plotBdy, this.vegaSpec());

            await this.loadPlotData();
            
            this.updatePlotListeners();
            this.updateMapListeners();

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
        this.plot.loadData(data);
    }

    protected updatePlotListeners(layerId: string = 'neighborhoods') {
        this.plot.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[] | string[]) => {
            const layer = this.map.layerManager.searchByLayerId(layerId);

            if (layer) {
                layer.layerRenderInfo.isPick = true;

                layer.clearHighlightedIds();
                layer.setHighlightedIds(selection as number[]);

                const highlightedIds = layer.highlightedIds;
                console.log("Map updated. Selected regions:");
                console.log({ highlightedIds });
            }
        });
    }

    protected async updateMapListeners() {
        this.map.mapEvents.addEventListener(MapEvent.PICK, (selection) => {
            const state = this.plot.view.getState();

            if (!state.data[`click_store`] || selection.length === 0) {
                state.data[`click_store`] = [];
            }

            state.data[`click_store`] = selection.map((id: number | string) => ({ "_vgsid_": id, "unit": "" }));
            this.plot.view.setState(state);

            console.log("Plot updated. Selected regions:");
            console.log({ state });

            this.plot.view.run();
        });
    }

    protected vegaSpec() {
        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
            description: 'A simple bar chart with embedded data.',
            data: {
                values: [],
            },
            selection: {
                "click": { 
                    "type": "multi",
                    "toggle": "event.altKey"
                }
            },
            width: 450,
            height: 450,
            background: "rgba(255, 255, 255, 0.85)",
            view: { "fill": "rgba(255, 255, 255, 0.85)" },
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

    protected floatingPlot() {
        let newX = 0, newY = 0, startX = 0, startY = 0;

        const plot = document.querySelector('#plot') as HTMLDivElement;
        const bar  = document.querySelector('#plotBar') as HTMLDivElement;

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
    const example = new MapVega();
    await example.run();
}
main();