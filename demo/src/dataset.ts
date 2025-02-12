/* eslint-disable @typescript-eslint/no-explicit-any */

import { 
    ICameraData, 
    ILayerData, 
    ILayerGeometry, 
    ILayerInfo, 
    ILayerRenderInfo 
} from 'utkmap';

import {
    LayerType,
    LayerGeometryType,
    RenderPipeline as RenderPipelineType,
    ColorMapInterpolator,
    ThematicAggregationLevel,
} from 'utkmap';

import { SpatialDb } from 'utkdb';

import { DataLoader } from './data-loader';

import { FeatureCollection } from 'geojson';

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
                return LayerGeometryType.TRIGMESH_LAYER;
            case 'water':
                return LayerGeometryType.TRIGMESH_LAYER;
            case 'roads':
                return LayerGeometryType.TRIGMESH_LAYER;
            case 'surface':
                return LayerGeometryType.TRIGMESH_LAYER;
            case 'buildings':
                return LayerGeometryType.BUILDINGS_LAYER;
        }

        return LayerGeometryType.TRIGMESH_LAYER;
    }

    getPhysicalType(layer: string): LayerType {
        switch (layer) {
            case 'parks':
                return LayerType.PHYSICAL_PARKS;
            case 'water':
                return LayerType.PHYSICAL_WATER;
            case 'roads':
                return LayerType.PHYSICAL_ROADS;
            case 'surface':
                return LayerType.PHYSICAL_SURFACE;
            case 'buildings':
                return LayerType.PHYSICAL_BUILDINGS;
        }

        return LayerType.PHYSICAL_SURFACE;
    }

    getPipelineType(layer: string): RenderPipelineType {
        switch (layer) {
            case 'parks':
                return RenderPipelineType.TRIANGLE_FLAT;
            case 'water':
                return RenderPipelineType.TRIANGLE_FLAT;
            case 'roads':
                return RenderPipelineType.TRIANGLE_FLAT;
            case 'surface':
                return RenderPipelineType.TRIANGLE_FLAT;
            case 'buildings':
                return RenderPipelineType.BUILDING_FLAT;
        }

        return RenderPipelineType.TRIANGLE_FLAT;
    }

    abstract loadData(): void;
}

export class ToyExample extends UtkData {
    async loadData() {
        this._cameraData = {
            origin: [0, 0, 1],
            direction: {
                up: [0, 1, 0],
                lookAt: [0, 0, 0],
                eye: [0, 0, 1],
            },
        };

        this._layerInfo.push({
            id: 'toy.example',
            zIndex: 0,
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typeLayer: LayerType.PHYSICAL_WATER,
        });

        this._layerRenderInfo.push({
            pipeline: RenderPipelineType.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: true,
            isPicking: false,
        });

        this._layerData.push({
            geometry: [
                {
                    // one park
                    position: [0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0].map((d, i) => {
                        // coordinates (lat, log, z=0)
                        return d - this.cameraData.origin[i % 3];
                    }),
                    indices: [0, 1, 2], // triangles
                },
                {
                    position: [0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, 0.5, 0.0].map(
                        (d, i) => {
                            return d - this.cameraData.origin[i % 3];
                        },
                    ),
                    indices: [0, 1, 2, 3, 4, 5],
                },
                {
                    position: [0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0].map((d, i) => {
                        return d - this.cameraData.origin[i % 3];
                    }),
                    indices: [0, 1, 2],
                },
            ],

            thematic: [
                {
                    level: ThematicAggregationLevel.AGGREGATION_POINT,
                    values: [1.0, 0.5, 0.0],
                },
                {
                    level: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                    values: [1.0, 0.0],
                },
                {
                    // use this to color the whole park
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [0.75],
                },
            ],
        });
    }
}

export class UtkPyData extends UtkData {
    protected _layers: string[];
    protected _dataFolder: string;

    constructor(dataFolder: string = './manhattan', layers: string[] = ['parks', 'water', 'surface', 'roads']) {
        super();

        this._layers = layers;
        this._dataFolder = dataFolder;
    }

    async loadData() {
        const grammarData: any = await DataLoader.getJsonData(`${this._dataFolder}/grammar.json`);

        const camera = grammarData['components'][0]['map']['camera'];
        this._cameraData = {
            origin: camera.position,
            direction: {
                up: camera.direction.up,
                eye: camera.direction.right,
                lookAt: camera.direction.lookAt,
            },
        };

        for (let lId = 0; lId < this._layers.length; lId++) {
            const layer = this._layers[lId];

            // load layer json data
            const layerJson = await DataLoader.getJsonData(`${this._dataFolder}/${layer}.json`);

            // load layer binary data
            const layerCoord = Array.from(
                <Float64Array>await DataLoader.getBinaryData(`${this._dataFolder}/${layer}_coordinates.data`, 'd'),
            );
            const layerIndex = Array.from(
                <Uint32Array>await DataLoader.getBinaryData(`${this._dataFolder}/${layer}_indices.data`, 'I'),
            );

            this._layerInfo.push({
                id: `${layer}.utkpy`,
                zIndex: lId,
                typeGeometry: this.getGeometryType(layer),
                typeLayer: this.getPhysicalType(layer),
            });

            this._layerRenderInfo.push({
                pipeline: this.getPipelineType(layer),
                colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
                isColorMap: false,
                isPicking: false,
            });

            const layerData: ILayerData = {
                geometry: [],
                thematic: [],
            };

            if( layerJson === null || typeof layerJson !== "object" || !('data' in layerJson) ) {
                return;
            }

            const components = layerJson.data;
            if( components === null || !Array.isArray(components) ) {
                return;
            }

            for (const comps of components) {
                const cStartCount = comps.geometry.coordinates;
                const iStartCount = comps.geometry.indices;

                const geometry: ILayerGeometry = {
                    position: layerCoord.slice(cStartCount[0], cStartCount[0] + cStartCount[1]).map((el, id) => {
                        return el - this.cameraData.origin[id % 3];
                    }),
                    indices: layerIndex.slice(iStartCount[0], iStartCount[0] + iStartCount[1]),
                };

                layerData.geometry.push(geometry);
                layerData.thematic.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [Math.random()],
                });
            }
            this._layerData.push(layerData);
        }
    }
}

export class UtkDbExample extends UtkData {
    private pbfFileUrl: string;
    private tableName: string;
    private layerNames: string[];
    private projection: string;

    private db: SpatialDb;

    constructor(pbfFileUrl: string, tableName: string, layerNames: string[], projection: string = 'EPSG:3395') {
        super();

        this.db = new SpatialDb();

        this.pbfFileUrl = pbfFileUrl;
        this.tableName = tableName;
        this.layerNames = layerNames;
        this.projection = projection;
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
        for (const layerName of this.layerNames) {
            await this.db.loadLayer({
                tableName: this.tableName,
                coordinateFormat: this.projection,
                layer: layerName as 'surface' | 'parks' | 'water' | 'roads' | 'buildings',
            });
        }
    }

    async exportLayers(): Promise<{ name: string, data: FeatureCollection }[]> {
        const data = [];

        for (const layerName of this.layerNames) {
            const json = await this.db.getLayerGeoJSON(`${this.tableName}_${layerName}`);
            data.push({ name: layerName, data: JSON.parse(json) });
        }

        return data;
    }
}