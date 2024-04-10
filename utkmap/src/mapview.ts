/// <reference types="@webgpu/types" />

import { LayerGeometryType, LayerPhysicalType, RenderStyle, ThematicAggregationLevel } from './constants';
import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from './interfaces';

import Renderer from './renderer';
import LayerManager from './layer-manager';
import { DataApi } from './data-api';

export class UtkMap implements DataApi {
    protected _layers: LayerManager;
    protected _renderer: Renderer;

    constructor(canvas: HTMLCanvasElement) {
        this._renderer = new Renderer(canvas);
        this._layers = new LayerManager();
    }

    async init() {
        await this._renderer.init();

        const layerInfo = {
            id: 'roads.osm',
            typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
            typePhysical: LayerPhysicalType.SURFACE_LAYER,
            renderStyle: RenderStyle.INDEX_FLAT
        }

        const layerData = {
            geometry: [{
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ]),
                thematic: new Float32Array(3),
                indices: new Uint16Array([
                    0, 1, 2
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0
                ]),
                thematic: new Float32Array(3),
                indices: new Uint16Array([
                    0, 1, 2
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0
                ]),
                thematic: new Float32Array(3),
                indices: new Uint16Array([
                    0, 1, 2
                ])
            }],
            thematic: [{
                aggregation: ThematicAggregationLevel.AGGREGATION_POINT,
                values: new Float32Array([
                    1.0, 0.5, 0.5
                ]),
            },
            {
                aggregation: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                values: new Float32Array([
                    1.0
                ]),
            },
            {
                aggregation: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                values: new Float32Array([
                    1.0
                ]),
            }]
        }


        this.loadLayer(layerInfo, layerData);
    }

    loadLayer(layerInfo: ILayerInfo, layerData: ILayerData) {
        const layer = this._layers.addLayer(layerInfo, layerData);

        if (layer) {
            layer.buildRenderPass(this._renderer);
        }
    }

    updateLayerGeometry(layerGeometry: ILayerGeometry): void {
        throw new Error('Method not implemented.');
    }

    updateLayerThematic(layerThematic: ILayerThematic): void {
        throw new Error('Method not implemented.');
    }

    render() {
        // Starts the render
        this._renderer.beginRender()

        // Add layers to render pass
        const ls = this._layers.layers.forEach(layer => {
            layer.setRenderPass();
        });;

        // Ends the render
        this._renderer.endRender();

        // Refresh canvas
        requestAnimationFrame(this.render.bind(this));
    };
}