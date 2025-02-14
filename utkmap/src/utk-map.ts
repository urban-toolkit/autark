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

    loadGeoJsonLayer(geojson: FeatureCollection, origin: number[], typeLayer: LayerType) {

        switch (typeLayer) {
            case LayerType.OSM_WATER:
            case LayerType.OSM_PARKS:
                this.createTrianglesLayerFromGeojson(geojson, origin, typeLayer, LayerGeometryType.TRIGMESH_LAYER)
            break;
        
            default:
                break;
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

    private createTrianglesLayerFromGeojson(geojson: FeatureCollection, origin: number[], typeLayer: LayerType, typeGeometry: LayerGeometryType) {
        const layerInfo: ILayerInfo = {
            id: `${typeLayer.toString()}`,
            zIndex: this.layerManager.length + 1,
            typeGeometry: typeGeometry,
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPicking: false,
        };

        const mesh = Triangulator.createTrianglesLayerMesh(geojson, origin);

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
