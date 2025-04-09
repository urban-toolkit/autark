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

    get boundingBox(): IBoundingBox {
        return this._layerManager.boundingBox;
    }

    get origin(): number[] {
        // return [
        //     (this._layerManager.boundingBox.minLat + this._layerManager.boundingBox.maxLat) / 2,
        //     (this._layerManager.boundingBox.minLon + this._layerManager.boundingBox.maxLon) / 2,
        //     0
        // ];
        return [
            -8239012.438994927,
            4941135.512524911,
            0
        ];
    }

    async init() {
        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();

        this.render();
    }

    loadGeoJsonLayer(geojson: FeatureCollection, typeLayer: LayerType) {
        switch (typeLayer) {
            case LayerType.OSM_SURFACE:
            case LayerType.OSM_WATER:
            case LayerType.OSM_PARKS:
            case LayerType.CUSTOM_2DLAYER:
                this.createFeatures2DLayerFromGeojson(geojson, typeLayer, LayerGeometryType.FEATURES_2D);
            break;

            case LayerType.OSM_COASTLINE:
                this.createCoastlineLayerFromGeojson(geojson, typeLayer, LayerGeometryType.FEATURES_2D);
            break;

            case LayerType.OSM_ROADS:
                this.createRoadsLayerFromGeojson(geojson, typeLayer, LayerGeometryType.FEATURES_2D);
            break

            case LayerType.OSM_BUILDINGS:
                this.createBuildingsLayerFromGeojson(geojson, typeLayer, LayerGeometryType.FEATURES_3D);
            break

            default:
                console.error(`Geojson data has an unknown layer type: ${typeLayer}.`);
            break;
        }
    }

    updateCamera(params: ICameraData) {
        this._camera = new Camera(params);
    }

    updateBoundingBox(bbox: IBoundingBox) {
        this._layerManager.boundingBox = bbox
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

    private createFeatures2DLayerFromGeojson(geojson: FeatureCollection, typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorFeatures2D.buildMesh(geojson, this.origin);
        if(layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature 2D Layer mesh');
            return;
        }

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

    private createCoastlineLayerFromGeojson(geojson: FeatureCollection, typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorCoastline.buildMesh(geojson, this.origin);
        if(layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Coastline Layer mesh');
            return;
        }

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


    private createRoadsLayerFromGeojson(geojson: FeatureCollection, typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorRoads.buildMesh(geojson, this.origin);
        if(layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Roads Layer mesh');
            return;
        }

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

    private createBuildingsLayerFromGeojson(geojson: FeatureCollection, typeLayer: LayerType, typeGeometry: LayerGeometryType) {
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

        const layerMesh = TriangulatorBuildings.buildMesh(geojson, this.origin);
        if(layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Building Layer mesh');
            return;
        }

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
