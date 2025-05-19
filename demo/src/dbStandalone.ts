import { LayerType } from 'utkmap';
import { SpatialDb } from 'utkdb';

export class DbStandalone {
  protected projection: string;
  protected db: SpatialDb;

  constructor(projection: string = 'EPSG:3395') {
    this.db = new SpatialDb();
    this.projection = projection;
  }

  public async init() {
    // DB Initialization
    await this.db.init();
  }

  public async loadOsm(
    pbfFileUrl: string = 'http://localhost:5173/data/lower-mn.osm.pbf',
    osmLayers: LayerType[] = [
      LayerType.OSM_COASTLINE,
      LayerType.OSM_PARKS,
      LayerType.OSM_WATER,
      LayerType.OSM_ROADS,
      LayerType.OSM_BUILDINGS,
    ],
    osmTable: string = 'table_osm',
  ) {
    // Loading osm layers
    await this.db.loadOsm({
      pbfFileUrl: pbfFileUrl,
      outputTableName: osmTable,
      autoLoadLayers: {
        coordinateFormat: this.projection,
        layers: osmLayers as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
        dropOsmTable: true,
      },
    });
  }

  public async loadCustomLayer(
    geoJsonUrl = 'http://localhost:5173/data/mnt_neighs.geojson',
    geojsonTable = 'neighborhoods',
  ) {
    await this.db.loadCustomLayer({
      geojsonFileUrl: geoJsonUrl,
      outputTableName: geojsonTable,
      coordinateFormat: this.projection,
    });
  }

  public loadOsmBoundingBox() {
    return this.db.getOsmBoundingBox();
  }

  public async loadCsv(csvFileUrl = 'http://localhost:5173/data/noise_sample.csv', csvTable = 'noise') {
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

  public async spatialJoin(
    tableRootName: string = 'neighborhoods',
    tableJoinName: string = 'noise',
  ) {
    await this.db.spatialJoin({
      tableRootName: tableRootName,
      tableJoinName: tableJoinName,
      spatialPredicate: 'INTERSECT',
      output: {
        type: 'MODIFY_ROOT',
        },      
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
  }

  public async logTables() {
    console.log(`Tables in the database:`);
    console.log('---------------------');
    console.log(this.db.tables);
  }

  public async logLayer(layerName: string) {
    const geojson = await this.db.getLayer(layerName);

    console.log(`${layerName} layer:`);
    console.log('---------------------');
    console.log(geojson);
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
