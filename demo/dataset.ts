import { ICameraData, ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo } from "utkmap/src/interfaces"
import { LayerGeometryType, LayerPhysicalType, RenderPipeline, ColorMapInterpolator, ThematicAggregationLevel } from "utkmap/src/constants"

import { DataLoader } from './data-loader';

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

    abstract loadData(): void;

}

export class ToyExample extends UtkData {

    async loadData() {
        this._cameraData = {
            origin: [0, 0, 1],
            direction: {
                up: [0, 1, 0],
                lookAt: [0, 0, 0],
                eye: [0, 0, 1]
            }
        }

        this._layerInfo.push({
            id: 'toy.example',
            zIndex: 0,
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.WATER_LAYER,
        });

        this._layerRenderInfo.push({
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: true,
            isPicking: false
        });

        this._layerData.push({
            geometry: [{
                position: [
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ].map((d, i) => {
                    return d - this.cameraData.origin[i % 3];
                }),
                indices: [
                    0, 1, 2
                ]
            },
            {
                position: [
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0,
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ].map((d, i) => {
                    return d - this.cameraData.origin[i % 3];
                }),
                indices: [
                    0, 1, 2,
                    3, 4, 5
                ]
            },
            {
                position: [
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0
                ].map((d, i) => {
                    return d - this.cameraData.origin[i % 3];
                }),
                indices: [
                    0, 1, 2
                ]
            }],

            thematic: [{
                level: ThematicAggregationLevel.AGGREGATION_POINT,
                values: [
                    1.0, 0.5, 0.0
                ],
            },
            {
                level: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                values: [
                    1.0, 0.0
                ],
            },
            {
                level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                values: [
                    0.75
                ],
            }]
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

    getPhysicalType(layer: string): LayerPhysicalType {
        switch (layer) {
            case 'parks': return LayerPhysicalType.PARKS_LAYER;
            case 'water': return LayerPhysicalType.WATER_LAYER;
            case 'roads': return LayerPhysicalType.ROADS_LAYER;
            case 'surface': return LayerPhysicalType.SURFACE_LAYER;
        }

        return LayerPhysicalType.LAND_LAYER;
    }

    async loadData() {
        const grammarData: any = await DataLoader.getJsonData(`${this._dataFolder}/grammar.json`);

        const camera = grammarData['components'][0]['map']['camera']
        this._cameraData = {
            origin: camera.position,
            direction: {
                up: camera.direction.up,
                eye: camera.direction.right,
                lookAt: camera.direction.lookAt,
            }
        }

        for (let lId = 0; lId < this._layers.length; lId++) {
            const layer = this._layers[lId];

            // load layer json data
            const layerJson  =  <any>await DataLoader.getJsonData(`${this._dataFolder}/${layer}.json`);
            // load layer binary data
            const layerCoord = Array.from(<Float64Array>await DataLoader.getBinaryData(`${this._dataFolder}/${layer}_coordinates.data`, 'd'));
            const layerIndex = Array.from(<Uint32Array>await DataLoader.getBinaryData(`${this._dataFolder}/${layer}_indices.data`, 'I'));
    
            this._layerInfo.push({
                id: `${layer}.utkpy`,
                zIndex: lId,
                typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
                typePhysical: this.getPhysicalType(layer)
            });
    
            this._layerRenderInfo.push({
                pipeline: RenderPipeline.TRIANGLE_FLAT,
                colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
                isColorMap: false,
                isPicking: false
            });
    
            const layerData: ILayerData = {
                geometry: [],
                thematic: []
            }
    
            const components = layerJson['data'];
            for (const comps of components) {
                const cStartCount = comps.geometry.coordinates;
                const iStartCount = comps.geometry.indices;
    
                const geometry: ILayerGeometry = {
                    position: layerCoord.slice(cStartCount[0], cStartCount[0] + cStartCount[1]).map((el, id) => {
                        return el - this.cameraData.origin[id%3];
                    }),
                    indices: layerIndex.slice(iStartCount[0], iStartCount[0] + iStartCount[1])
                }
    
                layerData.geometry.push(geometry);
                layerData.thematic.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [
                        Math.random()
                    ],
                })
            }
            this._layerData.push(layerData)
        }
   }
}