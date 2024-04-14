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
                eye: [0, 0, 1000],
                lookAt: [0, 0, 0]
            }
        }

        this._layerInfo = {
            id: 'roads.osm',
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.WATER_LAYER,
        }

        this._layerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOD_BLUES,
            isColorMap: true,
            isPicking: false
        }

        this._layerData = {
            geometry: [{
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ]),
                indices: new Uint32Array([
                    0, 1, 2
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0,
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ]),
                indices: new Uint32Array([
                    0, 1, 2,
                    3, 4, 5
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0
                ]),
                indices: new Uint32Array([
                    0, 1, 2
                ])
            }],

            thematic: [{
                level: ThematicAggregationLevel.AGGREGATION_POINT,
                values: new Float32Array([
                    1.0, 0.5, 0.0
                ]),
            },
            {
                level: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                values: new Float32Array([
                    1.0, 0.0
                ]),
            },
            {
                level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                values: new Float32Array([
                    0.75
                ]),
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

        const jsonData = <any>await DataLoader.getJsonData(this._pathJson);
        const coordsData = Array.from(<Float32Array>await DataLoader.getBinaryData(this._pathCoords, 'f'));
        const idsData = Array.from(<Uint32Array>await DataLoader.getBinaryData(this._pathIds, 'I'));

        this._layerInfo = {
            id: `parks.osm`,
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.PARKS_LAYER,
        }

        this._layerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOD_BLUES,
            isColorMap: true,
            isPicking: false
        }

        this._layerData = {
            geometry: [],
            thematic: []
        }

        const components = jsonData['data'];
        console.log(components);
        for (const comps of components) {
            const cStartCount = comps.geometry.coordinates;
            const iStartCount = comps.geometry.indices;

            const geo = {
                position: new Float32Array(coordsData.slice(cStartCount[0], cStartCount[0] + cStartCount[1])),
                indices: new Uint32Array(idsData.slice(iStartCount[0], iStartCount[0] + iStartCount[1]))
            }

            this._layerData.geometry.push(geo);
        }
    }
}