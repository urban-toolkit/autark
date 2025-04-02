import { FeatureCollection } from 'geojson';

import { ICameraData, ILayerData, ILayerInfo, ILayerRenderInfo } from 'utkmap';

import { LayerType, LayerGeometryType, RenderPipeline } from 'utkmap';

import { SpatialDb } from 'utkdb';

abstract class UtkData {
  protected _layerInfo: ILayerInfo[] = [];
  protected _layerData: ILayerData[] = [];
  protected _layerRenderInfo: ILayerRenderInfo[] = [];
  protected _cameraData!: ICameraData;

  get layerInfo() {
    return this._layerInfo;
  }

  get layerRenderInfo() {
    return this._layerRenderInfo;
  }

  get layerData() {
    return this._layerData;
  }

  get cameraData() {
    return this._cameraData;
  }

  getGeometryType(layer: string): LayerGeometryType {
    switch (layer) {
      case 'parks':
      case 'water':
      case 'roads':
      case 'surface':
        return LayerGeometryType.FEATURES_2D;
      case 'buildings':
        return LayerGeometryType.FEATURES_3D;
    }

    return LayerGeometryType.FEATURES_2D;
  }

  getPhysicalType(layer: string): LayerType {
    switch (layer) {
      case 'parks':
        return LayerType.OSM_PARKS;
      case 'water':
        return LayerType.OSM_WATER;
      case 'roads':
        return LayerType.OSM_ROADS;
      case 'surface':
        return LayerType.OSM_SURFACE;
      case 'buildings':
        return LayerType.OSM_BUILDINGS;
    }

    return LayerType.OSM_SURFACE;
  }

  getPipelineType(layer: string): RenderPipeline {
    switch (layer) {
      case 'parks':
      case 'water':
      case 'roads':
      case 'surface':
        return RenderPipeline.TRIANGLE_FLAT;
      case 'buildings':
        return RenderPipeline.TRIANGLE_SSAO;
    }

    return RenderPipeline.TRIANGLE_FLAT;
  }

  abstract loadData(): void;
}

export class UtkDbExample extends UtkData {
  private pbfFileUrl: string;
  private projection: string;

  private osmLayer: string[];

  private osmTable: string;
  private customTable: string;

  private db: SpatialDb;

  constructor(pbfFileUrl: string, osmLayers: LayerType[], projection: string = 'EPSG:3395') {
    super();

    this.db = new SpatialDb();

    this.pbfFileUrl = pbfFileUrl;
    this.projection = projection;

    this.osmLayer = osmLayers;

    this.osmTable = 'table_osm';
    this.customTable = 'table_custom';
  }

  async loadTest() {
    
      // DB Initialization
      await this.db.init();  
    
      await this.db.loadCustomLayer({
        geojsonFileUrl: 'http://localhost:5173/data-ignore/manhattan_neighborhood.geojson',
        outputTableName: 'geojson_table',
        coordinateFormat: this.projection,
      });
      console.log('end load custom layer');
      console.log('tables: ', this.db.tables);

      console.log('Loading csv');
      await this.db.loadCsv({
        csvFileUrl: 'http://localhost:5173/data-ignore/csv_leve.csv',
        outputTableName: 'csv_table',
        geometryColumns: {
          latColumnName: 'Latitude',
          longColumnName: 'Longitude',
          coordinateFormat: this.projection,
        },
      });
      console.log('end loading csv');

      console.log('making join');

      await this.db.spatialJoin({
        tableRootName: 'geojson_table',
        tableJoinName: `csv_table`,
        spatialPredicate: 'INTERSECT',
        outputTableName: 'my_new_layer',
        joinType: 'INNER',
        groupBy: {
          selectColumns: [
            {
              tableName: 'csv_table',
              column: 'Agency Name',
              aggregateFn: 'count',
            },
          ],
        },
      });
      console.log('end join');

      const geojsonAfterJoin = await this.db.getLayer('my_new_layer');
      console.log('geojsonAfterJoin: ', geojsonAfterJoin);    
    
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
  }

  async loadData() {
    // DB Initialization
    await this.db.init();

    // Loading osm layers
    await this.db.loadOsm({
      pbfFileUrl: this.pbfFileUrl,
      outputTableName: this.osmTable,
      autoLoadLayers: {
        coordinateFormat: this.projection,
        layers: this.osmLayer as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
      },
    });

    // Loading custom layers
    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: `${this.customTable}_mnt_neighs`,
      coordinateFormat: this.projection,
    });
  }

  async exportLayers(): Promise<{ name: string; data: FeatureCollection }[]> {
    const data = [];

    // Exporting OSM layers
    for (const layerName of this.osmLayer) {
      const osmGeojson = await this.db.getLayer(`${this.osmTable}_${layerName}`);
      data.push({ name: layerName, data: osmGeojson });
    }

    // Exporting custom layers
    const layerName = `${this.customTable}_mnt_neighs`;
    const customOsmGeojson = await this.db.getLayer(layerName);
    data.push({ name: layerName, data: customOsmGeojson });

    return data;
  }
}
