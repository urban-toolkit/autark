import { SpatialDb } from 'utkdb';
import { UtkMap, LayerType, ILayerThematic, ThematicAggregationLevel, IBoundingBox } from 'utkmap';

import { Example } from '../example';
import { GeoJsonProperties } from 'geojson';

export class SpatialJoinVis extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    protected canvas!: HTMLCanvasElement;

    constructor() {
        super();
    }

    public buildHtmlNodes() {
        const app = document.querySelector('#app') as HTMLElement | null;

        this.canvas = document.createElement('canvas');
        const div = document.createElement('div');

        if (!app || !div || !this.canvas) { return; }

        this.canvas.width = this.canvas.height = this.canvas.parentElement?.clientHeight || 800;

        div.style.display = 'flex';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'center';
        div.style.width = '800px';

        div.innerHTML = '<h2>spatial-join-vis.ts</h2>';

        if (app) {
            app.appendChild(div);
            app.appendChild(this.canvas);
        }
    }

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        // CHECK: Compute the bomding box even if there is no osm data
        const boundingBox: IBoundingBox = { 
            minLon: 4940354.793551397,
            minLat: -8239795.593876557,
            maxLon: 4942534.993601108,
            maxLat: -8237537.099519547
        }

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
        await this.map.init(boundingBox);

        await this.loadLayers();
        await this.updateThematicData();

        this.map.draw();
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
}