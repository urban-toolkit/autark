import { GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel } from 'autk-map';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            boundingBox: {
                minLon: -74.0217296397,
                minLat: 40.6989916231,
                maxLon: -74.0005168092,
                maxLat: 40.7131479624,
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'coastline',
                    'parks',
                    'water',
                    'roads',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        console.log('OSM data loaded');

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/parking.csv',
            outputTableName: 'parking',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        console.log('Trees data loaded');

        const boundingBox = await this.db.getOsmBoundingBox();
        await this.db.loadGridLayer({
            boundingBox: boundingBox,
            outputTableName: 'table_grid',
            rows: 30,
            columns: 30
        });

        console.log('Grid layer created');

        await this.db.spatialJoin({
            tableRootName: 'table_grid',
            tableJoinName: 'parking',
            spatialPredicate: 'NEAR',
            nearDistance: 200,
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'parking',
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        console.log('Spatial join completed');

        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init(boundingBox);
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

        const geojson = await this.db.getLayer('table_grid');

        if (geojson) {
            for (const feature of geojson.features) {
                const properties = feature.properties as GeoJsonProperties;

                if (!properties) {
                    continue;
                }

                const val = properties.sjoin.count.parking || 0;

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

        this.map.updateLayerThematic('table_grid', thematicData);
    }
}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
