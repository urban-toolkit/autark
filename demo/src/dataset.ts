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
  private tableName: string;
  private layerTypes: string[];
  private projection: string;

  private db: SpatialDb;

  constructor(pbfFileUrl: string, tableName: string, layers: LayerType[], projection: string = 'EPSG:3395') {
    super();

    this.db = new SpatialDb();

    this.pbfFileUrl = pbfFileUrl;
    this.tableName = tableName;
    this.projection = projection;
    this.layerTypes = layers;
  }

  async loadData() {
    // DB Initialization
    await this.db.init();

    // Loading layers
    await this.db.loadOsm({
      pbfFileUrl: this.pbfFileUrl,
      outputTableName: this.tableName,
      autoLoadLayers: {
        coordinateFormat: this.projection,
        layers: this.layerTypes as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
      },
    });

    console.log('begin of load csv (take a while because its heavy)');
    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data-ignore/311_Service_Requests_from_2010_to_Present_20250228.csv',
      outputTableName: 'service_requests',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: this.projection,
      },
    });
    console.log('end of load csv');
    console.log('tables: ', this.db.tables);
  }

  async exportLayers(): Promise<{ name: string; data: FeatureCollection }[]> {
    const data = [];

    for (const layerName of this.layerTypes) {
      const geojson = await this.db.getLayer(`${this.tableName}_${layerName}`);
      data.push({ name: layerName, data: geojson });
    }

    return data;
  }
}
