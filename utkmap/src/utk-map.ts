/// <reference types="@webgpu/types" />

import { Feature, FeatureCollection, Polygon } from 'geojson';

import {
    ColorMapInterpolator,
    LayerGeometryType,
    LayerType,
    LayerZIndex,
    MapEvent,
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
import { MapEvents } from './map-events';
import { LayerManager } from './layer-manager';

import { TriangulatorFeatures } from './triangulator-features';
import { TriangulatorBuildings } from './triangulator-buildings';
import { TriangulatorRoads } from './triangulator-roads';
import { TriangulatorCoastline } from './triangulator-coastline';

export class UtkMap {
    protected _camera!: Camera;
    protected _renderer!: Renderer;
    protected _keyEvents!: KeyEvents;
    protected _mouseEvents!: MouseEvents;
    protected _mapEvents!: MapEvents;
    protected _layerManager!: LayerManager;

    protected _canvas!: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement, autoResize = true) {
        this._canvas = canvas;
        this._camera = new Camera();
        this._renderer = new Renderer(canvas);
        this._keyEvents = new KeyEvents(this);
        this._mouseEvents = new MouseEvents(this);
        this._mapEvents = new MapEvents([MapEvent.PICK]);
        this._layerManager = new LayerManager();

        if (autoResize) {
            window.addEventListener('resize', this.handleResize.bind(this));
        }
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

    get mapEvents(): MapEvents {
        return this._mapEvents;
    }

    async init(bbox: IBoundingBox) {
        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();
        this.handleResize();

        this.render();

        this.updateBoundingBoxAndOrigin(bbox);
    }

    loadGeoJsonLayer(layerName: string, typeLayer: LayerType, geojson: FeatureCollection) {
        switch (typeLayer) {
            case LayerType.OSM_SURFACE:
            case LayerType.OSM_WATER:
            case LayerType.OSM_PARKS:
                this.createFeaturesLayerFromGeojson(layerName, typeLayer, geojson);
                break;

            case LayerType.OSM_COASTLINE:
                this.createCoastlineLayerFromGeojson(layerName, geojson);
                break;

            case LayerType.OSM_ROADS:
                this.createRoadsLayerFromGeojson(layerName, geojson);
                break

            case LayerType.OSM_BUILDINGS:
                this.createBuildingsLayerFromGeojson(layerName, geojson);
                break

            case LayerType.CUSTOM_LAYER:
                this.createCustomLayerFromGeojson(layerName, geojson);
            break;

            default:
                console.error(`Geojson data of layer ${layerName} has an unknown layer type: ${typeLayer}.`);
                break;
        }
    }

    resize(width: number, height: number) {
        this._canvas.width = width * (window.devicePixelRatio || 1);
        this._canvas.height = height * (window.devicePixelRatio || 1);

        this._camera.setViewportResolution(width, height);
        this._camera.update();
        this._renderer.resize(width, height);
    }

    updateCamera(params: ICameraData) {
        this._camera = new Camera(params);
    }

    updateBoundingBoxAndOrigin(bbox: IBoundingBox) {
        this._layerManager.updateBoundingBoxAndOrigin(bbox);
    }

    updateLayerThematic(layerName: string, layerThematic: ILayerThematic[]) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            // load data
            layer.loadThematic(layerThematic);
            layer.makeLayerDataInfoDirty();
        }
    }

    updateLayerGeometry(layerName: string, layerGeometry: ILayerGeometry[]) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            // load data
            layer.loadGeometry(layerGeometry);
            layer.makeLayerDataInfoDirty();
        }
    }

    updateRenderInfo(layerName: string, layerRenderInfo: ILayerRenderInfo) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            layer.setLayerRenderInfo(layerRenderInfo);
            layer.makeLayerRenderInfoDirty();
        }
    }
    
    updateRenderInfoOpacity(layerName: string, opacity: number) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            // load data
            layer.layerRenderInfo.opacity = opacity;
            layer.makeLayerRenderInfoDirty();
        }
    }

    updateRenderInfoIsColorMap(layerName: string, isColorMap: boolean) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            const layerRenderInfo = layer.layerRenderInfo;
            layerRenderInfo.isColorMap = isColorMap;

            layer.setLayerRenderInfo(layerRenderInfo);
        }
    }

    updateRenderInfoSkip(layerName: string, isSkip: boolean) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            const layerRenderInfo = layer.layerRenderInfo;
            layerRenderInfo.isSkip = isSkip;

            layer.setLayerRenderInfo(layerRenderInfo);
        }
    }

    updateRenderInfoPick(layerName: string, isPick: boolean) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            const layerRenderInfo = layer.layerRenderInfo;
            layerRenderInfo.isPick = isPick;

            layer.setLayerRenderInfo(layerRenderInfo);

            if(isPick === false) {
                layer.setHighlighted([]);
            }
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

    private handleResize() {
        const width = this._canvas.width;
        const height = this._canvas.height;

        this.resize(width, height);
    }

    private render() {
        // Updates the camera
        this._camera.update();

        // Normal render pass for each layer
        this._renderer.start();
        this._layerManager.layers.forEach((layer) => {
            if(!layer.layerRenderInfo.isSkip) {
                layer.renderPass(this._camera);
            }
        });
        this._renderer.finish();

        // Picking render pass for each layer
        this._renderer.startPickingRenderPass();
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                layer.renderPickingPass(this._camera);
            }
        });
        this._renderer.finish();

        // Getting id: TEMP
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                const [x, y] = layer.layerRenderInfo.pickedComps;
                layer.getPickedId(x, y).then(id => {
                    console.log(`Picked id ${id} on layer ${layer.layerInfo.id}`);
                    if(id >= 0){
                        layer.setHighlighted([id]);
                        this._mapEvents.emit('picked', [`${id}`], layer.layerInfo.id);
                    }
                    layer.layerRenderInfo.pickedComps = undefined;
                });
            }
        });

    }

    private createFeaturesLayerFromGeojson(layerName: string, typeLayer: LayerType, geojson: FeatureCollection) {
        let zIndex = -1;

        switch (typeLayer) {
            case LayerType.OSM_WATER: zIndex = LayerZIndex.OSM_WATER; break;
            case LayerType.OSM_PARKS: zIndex = LayerZIndex.OSM_PARKS; break;
            default: zIndex = 0.5 + 0.01 * this.layerManager.length; break;
        }

        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: zIndex,
            typeGeometry: LayerGeometryType.FEATURES_2D,
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            // Using a color map interpolator for 2D features is not necessary, but it can be used for thematic layers.
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorFeatures.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature 2D Layer mesh');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map(() => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [0]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createCoastlineLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.OSM_COASTLINE,
            typeGeometry: LayerGeometryType.FEATURES_2D,
            typeLayer: LayerType.OSM_COASTLINE,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPick: false,
            isSkip: false,
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

    private createRoadsLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.OSM_ROADS,
            typeGeometry: LayerGeometryType.FEATURES_2D,
            typeLayer: LayerType.OSM_ROADS,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorRoads.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Roads Layer.');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map(() => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [0]
                }
            })
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    private createBuildingsLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.OSM_BUILDINGS,
            typeGeometry: LayerGeometryType.FEATURES_3D,
            typeLayer: LayerType.OSM_BUILDINGS,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_SSAO,
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorBuildings.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Building Layer.');
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

    private createCustomLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const zIndex = 0.5 + 0.01 * this.layerManager.length;

        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: zIndex,
            typeGeometry: LayerGeometryType.BORDERS_2D,
            typeLayer: LayerType.CUSTOM_LAYER
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            // Using a color map interpolator for 2D features is not necessary, but it can be used for thematic layers.
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_BLUES,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorFeatures.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature Layer.');
            return;
        }
        const layerBorder = TriangulatorFeatures.buildBorder(geojson, this.origin);
        if (layerBorder.length === 0) {
            console.error('Invalid Feature Layer border.');
            return;
        }

        const layerData = {
            border: layerBorder,
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map(() => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [0]
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
