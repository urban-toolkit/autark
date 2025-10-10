// TODO: filter CSV data based on the osm data polygon.

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonVis {
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
                layers: ['surface', 'parks', 'water', 'roads'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/parking.csv',
            outputTableName: 'parking',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        const boundingBox = await this.db.getOsmBoundingBox();
        await this.db.loadGridLayer({
            boundingBox: boundingBox,
            outputTableName: 'table_grid',
            rows: 30,
            columns: 30
        });

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
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, layerData.type as LayerType, geojson);

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
    }

    protected async updateThematicData() {
        const geojson = await this.db.getLayer('table_grid');

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return properties?.sjoin.count.parking || 0;
        };

        this.map.updateGeoJsonLayerThematic('table_grid', geojson, getFnv);
    }
}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
