import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class SpatialJoin {
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
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
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

        await this.db.spatialJoin({
            tableRootName: 'table_osm_roads',
            tableJoinName: 'parking',
            spatialPredicate: 'NEAR',
            nearDistance: 500,
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

        let geojson = await this.db.getLayer('table_osm_roads');
        console.log({ geojson });

        const geojsonCompute = new GeojsonCompute();
        geojson = await geojsonCompute.computeFunctionIntoProperties({
            geojson,
            variableMapping: {
                x: 'sjoin.count.parking',
            },
            outputColumnName: 'result',
            wglsFunction: `
                x
            `,
        });

        console.log({ geojson });


        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);
            await this.map.init(await this.db.getOsmBoundingBox());

            await this.loadLayers();
            await this.updateThematicData(geojson);

            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, layerData.type as LayerType, geojson);

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;

            return properties?.compute.result || 0;
        };

        this.map.updateGeoJsonLayerThematic('table_osm_roads', getFnv, geojson);
    }
}

async function main() {
    const example = new SpatialJoin();
    await example.run();
}
main();
