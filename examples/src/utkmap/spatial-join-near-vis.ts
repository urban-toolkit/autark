import { SpatialDb } from 'utkdb';
import { UtkMap, LayerType, ILayerThematic, ThematicAggregationLevel } from 'utkmap';

import { Example } from '../example';
import { GeoJsonProperties } from 'geojson';

export class SpatialJoinNearVis extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    protected canvas!: HTMLCanvasElement;

    constructor() {
        super();
    }

    public buildHtml() {
        const app = document.querySelector('#app') as HTMLElement | null;

        this.canvas = document.createElement('canvas');
        const div = document.createElement('div');

        if (!app || !div || !this.canvas) { return; }

        this.canvas.width = this.canvas.height = this.canvas.parentElement?.clientHeight || 800;

        div.style.display = 'flex';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'center';
        div.style.width = '800px';

        div.innerHTML = '<h2>spatial-join-near-vis.ts</h2>';

        if (app) {
            app.appendChild(div);
            app.appendChild(this.canvas);
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
                    'roads'
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
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
            tableRootName: 'table_osm_roads',
            tableJoinName: 'noise',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
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

        this.map.draw();
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

    protected async updateThematicData() {
        const thematicData: ILayerThematic[] = [];

        const geojson = await this.db.getLayer('table_osm_roads');

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

        this.map.updateLayerThematic('table_osm_roads', thematicData);
    }
}