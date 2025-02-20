/// <reference types="@webgpu/types" />

import { FeatureCollection } from 'geojson';

import { 
    ColorMapInterpolator, 
    LayerGeometryType, 
    LayerType, 
    RenderPipeline, 
    ThematicAggregationLevel
} from './constants';

import { 
    ICameraData,
    ILayerComponent,
    ILayerData,
    ILayerGeometry,
    ILayerInfo,
    ILayerRenderInfo,
    ILayerThematic
} from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { LayerManager } from './layer-manager';

import { TriangulatorFeatures2D } from './triangulator-features2D';
import { TriangulatorBuildings } from './triangulator-buildings';
import { TriangulatorRoads } from './triangulator-roads';

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
            case LayerType.OSM_SURFACE:
            case LayerType.OSM_COASTLINE:
            case LayerType.OSM_WATER:
            case LayerType.OSM_PARKS:
                this.createFeatures2DLayerFromGeojson(geojson, origin, typeLayer, LayerGeometryType.FEATURES_2D);
            break;

            case LayerType.OSM_ROADS:
                this.createRoadsLayerFromGeojson(geojson, origin, typeLayer, LayerGeometryType.FEATURES_2D);
            break

            case LayerType.OSM_BUILDINGS:
                this.createBuildingsLayerFromGeojson(geojson, origin, typeLayer, LayerGeometryType.FEATURES_3D);
            break

            default:
                console.error(`Geojson data has an unknown layer type: ${typeLayer}.`);
            break;
        }
    }

    updateCamera(params: ICameraData) {
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
            layer.loadData(layerData);
        }
    }

    updateLayerGeometry(layerInfo: ILayerInfo, layerGeometry: ILayerGeometry[]) {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            // load data
            layer.loadGeometry(layerGeometry);
        }
    }

    updateLayerComponent(layerInfo: ILayerInfo, layerComponent: ILayerComponent[]) {
        const layer = this._layerManager.searchByLayerInfo(layerInfo);

        if (layer) {
            // load data
            layer.loadComponent(layerComponent);
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

    private createFeatures2DLayerFromGeojson(geojson: FeatureCollection, origin: number[], typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorFeatures2D.buildMesh(geojson, origin);

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e:ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createRoadsLayerFromGeojson(geojson: FeatureCollection, origin: number[], typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorRoads.buildMesh(geojson, origin);

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e:ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createBuildingsLayerFromGeojson(geojson: FeatureCollection, origin: number[], typeLayer: LayerType, typeGeometry: LayerGeometryType) {
        const layerInfo: ILayerInfo = {
            id: `${typeLayer.toString()}`,
            zIndex: this.layerManager.length + 1,
            typeGeometry: typeGeometry,
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_SSAO,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPicking: false,
        };

        const layerMesh = TriangulatorBuildings.buildMesh(geojson, origin);

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e:ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }
}
