import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel } from 'autk-map';

import { GeoJsonProperties } from 'geojson';

export class SpatialJoinNear {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise.csv',
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialJoin({
            tableRootName: 'table_osm_buildings_agg',
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

        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);
            await this.map.init(await this.db.getOsmBoundingBox());

            await this.loadLayers();
            await this.updateThematicData();

            this.map.draw();
        }
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

        const geojson = await this.db.getLayer('table_osm_buildings_agg');

        if (geojson) {
            for (const feature of geojson.features) {
                const properties = feature.properties as GeoJsonProperties;

                if (!properties) {
                    continue;
                }

                const val = properties.sjoin.count.noise || 0;

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

        this.map.updateLayerThematic('table_osm_buildings', thematicData);
    }
}

async function main() {
    const example = new SpatialJoinNear();
    await example.run();
}
main();