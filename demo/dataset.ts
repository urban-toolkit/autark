import { ICameraData, ILayerData, ILayerInfo, ILayerRenderInfo } from "utkmap/src/interfaces"
import { LayerGeometryType, LayerPhysicalType, RenderPipeline, ColorMapInterpolator, ThematicAggregationLevel } from "utkmap/src/constants"

import { DataLoader } from './data-loader';

abstract class UtkData {
    protected _layerInfo!: ILayerInfo;
    protected _layerData!: ILayerData;
    protected _layerRenderInfo!: ILayerRenderInfo;
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
            origin: [0, 0, 0],
            direction: {
                up: [0, 1, 0],
                lookAt: [0, 0, 0],
                eye: [0, 0, 0.5]
            }
        }

        this._layerInfo = {
            id: 'roads.osm',
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.WATER_LAYER,
        }

        this._layerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: true,
            isPicking: false
        }

        this._layerData = {
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
        }
    }
}

export class UtkPyParser extends UtkData {
    protected _pathGram: string;
    protected _pathJson: string;
    protected _pathCoords: string;
    protected _pathIds: string;

    constructor(path: string = 'manhattan', file: string = 'parks') {
        super();

        this._pathGram = `./${path}/grammar.json`

        const base = `./${path}/${file}`;
        this._pathJson = `${base}.json`;
        this._pathCoords = `${base}_coordinates.data`;
        this._pathIds = `${base}_indices.data`;
    }

    async loadData() {
        const gramData: any = await DataLoader.getJsonData(this._pathGram);
        const camera = gramData['components'][0]['map']['camera']
        this._cameraData = {
            origin: camera.position,
            direction: {
                up: camera.direction.up,
                eye: camera.direction.right,
                lookAt: camera.direction.lookAt,
            }
        }
        this._cameraData.origin[2] = 0;
        this._cameraData.direction.eye[2] = 1000;
        console.log(this._cameraData);

        const jsonData = <any>await DataLoader.getJsonData(this._pathJson);
        const coordsData = Array.from(<Float64Array>await DataLoader.getBinaryData(this._pathCoords, 'd'));
        const idsData = Array.from(<Uint32Array>await DataLoader.getBinaryData(this._pathIds, 'I'));

        this._layerInfo = {
            id: `parks.osm`,
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.PARKS_LAYER,
        }

        this._layerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPicking: false
        }

        this._layerData = {
            geometry: [],
            thematic: []
        }

        const components = jsonData['data'];
        for (const comps of components) {
            const cStartCount = comps.geometry.coordinates;
            const iStartCount = comps.geometry.indices;

            const geo = {
                position: coordsData.slice(cStartCount[0], cStartCount[0] + cStartCount[1]).map((el, id) => {
                    return (el - this.cameraData.origin[id%3]) * 0.001;
                }),
                indices: idsData.slice(iStartCount[0], iStartCount[0] + iStartCount[1])
            }

            this._layerData.geometry.push(geo);
        }
    }
}