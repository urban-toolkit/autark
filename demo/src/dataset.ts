import { FeatureCollection } from 'geojson';

import { 
    ICameraData, 
    ILayerData, 
    ILayerInfo, 
    ILayerRenderInfo 
} from 'utkmap';

import {
    LayerType,
    LayerGeometryType,
    RenderPipeline,
} from 'utkmap';

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

        // PBF data loading
        await this.db.loadPbf({
            pbfFileUrl: this.pbfFileUrl,
            tableName: this.tableName
        });

        // Filter layers from PBF file
        for (const obj of this.layerTypes) {
            await this.db.loadLayer({
                tableName: this.tableName,
                coordinateFormat: this.projection,
                layer: obj.toString() as 'surface' | 'coastlines' | 'parks' | 'water' | 'roads' | 'buildings',
            });
        }
    }

    async exportLayers(): Promise<{ name: string, data: FeatureCollection }[]> {
        const data = [];

        for (const layerName of this.layerTypes) {
            const json = await this.db.getLayerGeoJSON(`${this.tableName}_${layerName}`);
            data.push({ name: layerName, data: JSON.parse(json) });
        }

        return data;
    }
}