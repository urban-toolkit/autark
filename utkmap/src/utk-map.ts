/// <reference types="@webgpu/types" />

import { Feature, FeatureCollection, Polygon } from 'geojson';

import {
    ColorMapInterpolator,
    LayerGeometryType,
    LayerType,
    RenderPipeline,
    ThematicAggregationLevel
} from './constants';

import {
    IBoundingBox,
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
import { TriangulatorCoastline } from './triangulator-coastline';

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

    get origin(): number[] {
        return this._layerManager.origin;
    }

    get boundingBox(): Feature<Polygon> {
        return this._layerManager.boundingBox;
    }

    async init(bbox: IBoundingBox) {
        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();

        this.render();

        this.updateBoundingBoxAndOrigin(bbox);
    }

    loadGeoJsonLayer(layerName: string, typeLayer: LayerType, geojson: FeatureCollection) {
        switch (typeLayer) {
            case LayerType.OSM_SURFACE:
            case LayerType.OSM_WATER:
            case LayerType.OSM_PARKS:
            case LayerType.CUSTOM_2DLAYER:
                this.createFeatures2DLayerFromGeojson(layerName, typeLayer, LayerGeometryType.FEATURES_2D, geojson);
                break;

            case LayerType.OSM_COASTLINE:
                this.createCoastlineLayerFromGeojson(layerName, typeLayer, LayerGeometryType.FEATURES_2D, geojson);
                break;

            case LayerType.OSM_ROADS:
                this.createRoadsLayerFromGeojson(layerName, typeLayer, LayerGeometryType.FEATURES_2D, geojson);
                break

            case LayerType.OSM_BUILDINGS:
                this.createBuildingsLayerFromGeojson(layerName, typeLayer, LayerGeometryType.FEATURES_3D, geojson);
                break

            default:
                console.error(`Geojson data of layer ${layerName} has an unknown layer type: ${typeLayer}.`);
                break;
        }
    }

    updateCamera(params: ICameraData) {
        this._camera = new Camera(params);
    }

    updateBoundingBoxAndOrigin(bbox: IBoundingBox) {
        this._layerManager.updateBoundingBoxAndOrigin(bbox);
    }

    updateRenderInfo(layerName: string, layerRenderInfo: ILayerRenderInfo) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            layer.setLayerRenderInfo(layerRenderInfo);
        }
    }

    updateLayerGeometry(layerName: string, layerGeometry: ILayerGeometry[]) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            // load data
            layer.loadGeometry(layerGeometry);
        }
    }

    updateLayerThematic(layerName: string, layerThematic: ILayerThematic[]): void {
        const layer = this._layerManager.searchByLayerId(layerName);

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

    private createFeatures2DLayerFromGeojson(layerName: string, typeLayer: LayerType, typeGeometry: LayerGeometryType, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
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

        const layerMesh = TriangulatorFeatures2D.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature 2D Layer mesh');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e: ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createCoastlineLayerFromGeojson(layerName: string, typeLayer: LayerType, typeGeometry: LayerGeometryType, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
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

        const layerMesh = TriangulatorCoastline.buildMesh(geojson, this.origin, this.boundingBox);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Coastline Layer mesh');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e: ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createRoadsLayerFromGeojson(layerName: string, typeLayer: LayerType, typeGeometry: LayerGeometryType, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
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

        const layerMesh = TriangulatorRoads.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Roads Layer mesh');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e: ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createBuildingsLayerFromGeojson(layerName: string, typeLayer: LayerType, typeGeometry: LayerGeometryType, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
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

        const layerMesh = TriangulatorBuildings.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Building Layer mesh');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map((_e: ILayerComponent, id: number) => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [id / (layerMesh[1].length - 1)]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createLayer(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);

        if (layer) {
            layer.createPipeline(this._renderer, this._camera);
        }
    }

}
