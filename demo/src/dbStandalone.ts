import { LayerType } from 'utkmap';
import { SpatialDb } from 'utkdb';

export class DbStandalone {
    private projection: string;
    private db: SpatialDb;

    constructor(projection: string = 'EPSG:3395') {
        this.db = new SpatialDb();
        this.projection = projection;
    }

    async initDb() {
        // DB Initialization
        await this.db.init();
    }

    async osmLoadTest(pbfFileUrl: string = 'http://localhost:5173/data/lower-mn.osm.pbf', osmLayers: LayerType[] = [LayerType.OSM_COASTLINE, LayerType.OSM_PARKS, LayerType.OSM_WATER, LayerType.OSM_ROADS, LayerType.OSM_BUILDINGS], osmTable: string = 'table_osm') {
        // Loading osm layers
        await this.db.loadOsm({
            pbfFileUrl: pbfFileUrl,
            outputTableName: osmTable,
            autoLoadLayers: {
                coordinateFormat: this.projection,
                layers: osmLayers as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
            },
        });
    }

    async customLayerLoadTest(geoJsonUrl = 'http://localhost:5173/data/mnt_neighs.geojson', geojsonTable = 'geojson_table') {
        await this.db.loadCustomLayer({
            geojsonFileUrl: geoJsonUrl,
            outputTableName: geojsonTable,
            coordinateFormat: this.projection,
        });
    }

    async csvLoadTest(csvFileUrl = 'http://localhost:5173/data/noise_sample.csv', csvTable = 'csv_table') {
        await this.db.loadCsv({
            csvFileUrl: csvFileUrl,
            outputTableName: csvTable,
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: this.projection,
            },
        });
    }

    async spatialJoinTest(tableRootName: string = 'geojson_table', tableJoinName: string = 'csv_table', outputTableName: string = 'join_layer') {  
        await this.customLayerLoadTest();
        await this.csvLoadTest();

        await this.db.spatialJoin({
            tableRootName: tableRootName,
            tableJoinName: tableJoinName,
            spatialPredicate: 'INTERSECT',
            outputTableName: outputTableName,
            joinType: 'INNER',
            groupBy: {
                selectColumns: [
                    {
                        tableName: tableJoinName,
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        const geojsonAfterJoin = await this.db.getLayer(outputTableName);
        console.log('geojsonAfterJoin: ', geojsonAfterJoin);
    }
}


/*
--- Join neighborhood with parks ---
console.log('start load custom layer');
await this.db.loadCustomLayer({
geojsonFileUrl: 'http://localhost:5173/data-ignore/manhattan_neighborhood.geojson',
outputTableName: 'geojson_table',
coordinateFormat: this.projection,
});
console.log('end load custom layer');
console.log('tables: ', this.db.tables);

console.log('start spatial join');
const query = this.db.createQuery('geojson_table').spatialJoin({
tableRootName: 'geojson_table',
tableJoinName: `${this.tableName}_parks`,
spatialPredicate: 'INTERSECT',
});

await this.db.loadQuery(query, 'my_new_layer');
console.log('end spatial join');
console.log('tables: ', this.db.tables);

const geojsonAfterJoin = await this.db.getLayer('my_new_layer');
console.log('geojsonAfterJoin: ', geojsonAfterJoin);
*/
