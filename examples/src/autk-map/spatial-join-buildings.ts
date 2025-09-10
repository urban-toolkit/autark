import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

import { Feature, GeoJsonProperties } from 'geojson';

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

        const layer = 'table_osm_buildings';
        const groupById = true;

        await this.db.spatialJoin({
            tableRootName: layer,
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
            await this.updateThematicData(layer, groupById);

            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.getLayerTables()) {

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }

    protected async updateThematicData(layer: string = 'table_osm_buildings', groupById: boolean = false) {
        const geojson = await this.db.getLayer(layer);

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return properties?.sjoin.count.noise || 0;
        };

        this.map.updateGeoJsonLayerThematic(layer, getFnv, geojson, groupById);
    }
}

async function main() {
    const example = new SpatialJoinNear();
    await example.run();
}
main();