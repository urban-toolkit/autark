/// <reference types="@webgpu/types" />

import { 
    ColorMapInterpolator, 
    LayerGeometryType, 
    LayerType, 
    RenderPipeline, 
    ThematicAggregationLevel
} from './constants';

import { 
    ICameraData,
    ILayerData,
    ILayerInfo,
    ILayerRenderInfo,
    ILayerThematic
} from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { LayerManager } from './layer-manager';
import { Triangulator } from './triangulator';

import { FeatureCollection } from 'geojson';

export class UtkMap {
    protected _camera!: Camera;
    protected _renderer!: Renderer;
    protected _keyEvents!: KeyEvents;
    protected _mouseEvents!: MouseEvents;
    protected _layerManager!: LayerManager;

    protected _canvas!: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this._camera = new Camera();
        this._renderer = new Renderer(canvas);
        this._keyEvents = new KeyEvents(this);
        this._mouseEvents = new MouseEvents(this);
        this._layerManager = new LayerManager();
    }

    get camera(): Camera {
        return this._camera;
    }

    get renderer(): Renderer {
        return this._renderer;
    }

    get layerManager(): LayerManager {
        return this._layerManager;
    }

    async init() {
        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();

        this.render();
    }

    loadLayerGeoJson(geojson: FeatureCollection, layerName: string, typeLayer: LayerType , typeGeometry: LayerGeometryType = LayerGeometryType.TRIGMESH_LAYER) {
        // check if is a building layer
        const isBuilding = (typeGeometry === LayerGeometryType.BUILDINGS_LAYER);

        // TODO: Compute from layer data
        const cameraData = {
            "origin": [-8239012.438994927, 4941135.512524911, 1],
            "direction": {
                "eye": [0, 0, 3000],
                "lookAt": [0, 0, 0],
                "up": [0, 1, 0]
            }
        }

        if(isBuilding) {
            // TODO
            return;
        }
        else {
            const layerInfo: ILayerInfo = {
                id: `${layerName}`,
                zIndex: this.layerManager.length + 1,
                typeGeometry: typeGeometry,
                typeLayer: typeLayer,
            };
    
            const layerRenderInfo = {
                pipeline: isBuilding ? RenderPipeline.BUILDING_FLAT : RenderPipeline.TRIANGLE_FLAT,
                colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
                isColorMap: false,
                isPicking: false,
            };

            const mesh = Triangulator.createTrianglesLayerMesh(geojson, cameraData.origin);

            const layerData = {
                geometry: mesh,
                thematic: [{
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [Math.random()],
                }],
            };

            this.createLayer(layerInfo, layerRenderInfo, layerData);
        }
    }

    createCamera(params: ICameraData) {
        this._camera = new Camera(params);
    }

    createLayer(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);

        if (layer) {
            layer.createPipeline(this._renderer, this._camera);
        }
    }

    updateRenderInfo(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo) {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.setLayerRenderInfo(layerRenderInfo);
        }
    }

    updateLayerData(layerInfo: ILayerInfo, layerData: ILayerData): void {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            // load data
            layer.loadGeometry(layerData.geometry);
            layer.loadThematic(layerData.thematic);
        }
    }

    updateLayerThematic(layerInfo: ILayerInfo, layerThematic: ILayerThematic[]): void {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            layer.loadThematic(layerThematic);
        }
    }

    draw(fps: number = 60) {
        let previousDelta = 0;

        const update = (currentDelta: number) => {
            requestAnimationFrame(update);
            const delta = currentDelta - previousDelta;

            if (fps && delta < 1000 / fps) {
                return;
            }

            this.render();
            previousDelta = currentDelta;
        }

        requestAnimationFrame(update);
    }

    private render() {
        // Updates the camera
        this._camera.update();

        // Starts render
        this._renderer.start();

        // Render each layer
        this._layerManager.layers.forEach((layer) => {
            layer.renderPass(this._camera);
        });

        // Finish render
        this._renderer.finish();
    }
}
