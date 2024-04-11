/// <reference types="@webgpu/types" />

import { LayerGeometryType, LayerPhysicalType, RenderStyle, ThematicAggregationLevel } from './constants';
import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from './interfaces';

import Renderer from './renderer';
import LayerManager from './layer-manager';
import { DataApi } from './data-api';
import { MapStyle } from './map-style';

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
            typePhysical: LayerPhysicalType.WATER_LAYER,
            renderStyle: RenderStyle.TRIANGLE_FLAT
        }

        const layerData = {
            geometry: [{
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0
                ]),
                indices: new Uint16Array([
                    0, 1, 2
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0,
                    0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0,  0.5, 0.0
                ]),
                indices: new Uint16Array([
                    0, 1, 2,
                    3, 4, 5
                ])
            },
            {
                position: new Float32Array([
                    0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0
                ]),
                indices: new Uint16Array([
                    0, 1, 2
                ])
            }],
            thematic: [{
                aggregation: ThematicAggregationLevel.AGGREGATION_POINT,
                values: new Float32Array([
                    1.0, 0.5, 0.0
                ]),
            },
            {
                aggregation: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
                values: new Float32Array([
                    1.0, 0.0
                ]),
            },
            {
                aggregation: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                values: new Float32Array([
                    0.75
                ]),
            }]
        }

        this.loadLayer(layerInfo, layerData);
    }

    loadLayer(layerInfo: ILayerInfo, layerData: ILayerData) {
        const layer = this._layers.addLayer(layerInfo, layerData);

        if (layer) {
            layer.buildPipeline(this._renderer);
        }
    }

    updateLayer(layerInfo: ILayerInfo, layerData: ILayerData): void {
        const layer = this._layers.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.loadGeometry(layerData.geometry);
            layer.loadThematic(layerData.thematic);
            layer.buildPipeline(this._renderer);
        }
    }

    updateLayerThematic(layerInfo: ILayerInfo, layerThematic: ILayerThematic[]): void {
        const layer = this._layers.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.loadThematic(layerThematic);
            layer.buildPipeline(this._renderer);
        }
    }

    render() {
        // Starts the render
        this._renderer.beginEncoder()

        // Add layers to render pass
        this._layers.layers.forEach(layer => {
            layer.setRenderPass();
        });

        // Ends the render
        this._renderer.endEncoder();

        // Refresh canvas
        requestAnimationFrame(this.render.bind(this));
    };
}