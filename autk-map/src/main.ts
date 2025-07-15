/// <reference types="@webgpu/types" />

import {
    Feature,
    FeatureCollection,
    Polygon 
} from 'geojson';

import {
    ColorMapInterpolator,
    LayerGeometryType,
    LayerType,
    LayerZIndex,
    MapEvent,
    RenderPipeline,
    ThematicAggregationLevel,
} from './constants';

import {
    IBoundingBox,
    ILayerComponent,
    ILayerData,
    ILayerGeometry,
    ILayerInfo,
    ILayerRenderInfo,
    ILayerThematic,
} from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { MapEvents } from './map-events';
import { LayerManager } from './layer-manager';

import { TriangulatorFeatures } from './triangulator-features';
import { TriangulatorBuildings } from './triangulator-buildings';
import { TriangulatorLines } from './triangulator-lines';
import { TriangulatorCoastline } from './triangulator-coastline';
import { AutkMapUi } from './map-ui';
import { TriangulatorBorders } from './triangulator-borders';

/**
 * The main autark map class.
 *
 * `AutkMap` encapsulates the core logic for initializing and rendering a map on a given HTML canvas element.
 * It manages the camera, map rendering, map layers, and user interactions through keyboard, mouse, and map events.
 * 
 * 
 * @example
 * ```typescript
 * const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
 * const map = new AutkMap(canvas);
 * await map.init(boundingBox);
 * map.loadGeoJsonLayer('roads', LayerType.OSM_ROADS, geojsonData);
 * ```
 * 
 * @public
 */
export class AutkMap {
    protected _camera!: Camera;
    protected _renderer!: Renderer;
    protected _layerManager!: LayerManager;

    protected _keyEvents!: KeyEvents;
    protected _mouseEvents!: MouseEvents;
    protected _mapEvents!: MapEvents;

    protected _ui!: AutkMapUi;
    protected _canvas!: HTMLCanvasElement;

    /**
     * Creates an instance of AutkMap.
     * @param {HTMLCanvasElement} canvas The canvas element to render the map on
     * @param {boolean} [autoResize=true] Whether to automatically resize the canvas on window resize
     */
    constructor(canvas: HTMLCanvasElement, autoResize = true) {
        this._camera = new Camera();
        this._renderer = new Renderer(canvas);
        this._layerManager = new LayerManager();

        this._keyEvents = new KeyEvents(this);
        this._mouseEvents = new MouseEvents(this);
        this._mapEvents = new MapEvents([MapEvent.PICK]);

        this._ui = new AutkMapUi(this);
        this._canvas = canvas;

        if (autoResize) {
            window.addEventListener('resize', this.handleResize.bind(this));
        }
    }

    /**
     * Gets the camera instance used for rendering the map.
     * @returns {Camera} The camera instance
     */
    get camera(): Camera {
        return this._camera;
    }

    /**
     * Sets the camera instance used for rendering the map.
     * @param {Camera} camera The camera instance to set
     */
    set camera(camera: Camera) {
        this._camera = camera;
    }

    /**
     * Gets the renderer instance used for rendering the map.
     * @returns {Renderer} The renderer instance
     */
    get renderer(): Renderer {
        return this._renderer;
    }

    /**
     * Gets the layer manager instance used for managing map layers.
     * @returns {LayerManager} The layer manager instance
     */
    get layerManager(): LayerManager {
        return this._layerManager;
    }


    /**
     * Gets the map events instance used for handling map interactions.
     * @returns {MapEvents} The map events instance
     */
    get mapEvents(): MapEvents {
        return this._mapEvents;
    }


    /**
     * Gets the canvas element used for rendering the map.
     * @returns {HTMLCanvasElement} The canvas element
     */
    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /**
     * Gets the UI instance used for managing the map's user interface.
     * @returns {AutkMapUi} The UI instance
     */
    get ui(): AutkMapUi {
        return this._ui;
    }


    /**
     * Gets the origin of the map, which is the center of the bounding box.
     * @returns {number[]} The origin coordinates [x, y]
     */
    get origin(): number[] {
        return this._layerManager.origin;
    }

    /**
     * Gets the bounding box of the map.
     * @returns {Feature<Polygon>} The bounding box
     */
    get boundingBox(): Feature<Polygon> {
        return this._layerManager.boundingBox;
    }


    /**
     * Initializes the map with the given bounding box.
     * @param {IBoundingBox} bbox The bounding box to initialize the map with
     */
    async init(bbox: IBoundingBox) {
        this._layerManager.boundingBox = bbox;

        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();

        this.handleResize();
        this.render();

        this._ui.buildUi();

    }

    /**
     * Loads a GeoJSON layer into the map.
     *
     * This method creates a layer based on the provided GeoJSON data and adds it to the map's layer manager.
     * Supported OSM layer types include:
     * - OSM_COASTLINE
     * - OSM_WATER
     * - OSM_PARKS
     * - OSM_ROADS
     * - OSM_BUILDINGS
     *
     * Custom layers can also be loaded with types:
     * - CUSTOM_FEATURES_LAYER
     * - CUSTOM_LINES_LAYER
     * - CUSTOM_GRID_LAYER
     *
     * @param {string} layerName The name of the layer
     * @param {LayerType} typeLayer The type of the layer
     * @param {FeatureCollection} geojson The GeoJSON data to load
     */
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
                break;

            case LayerType.OSM_BUILDINGS:
                this.createBuildingsLayerFromGeojson(layerName, geojson);
                break;

            case LayerType.CUSTOM_FEATURES_LAYER:
                this.createCustomFeaturesLayerFromGeojson(layerName, geojson);
                break;

            case LayerType.CUSTOM_LINES_LAYER:
                this.createCustomLinesFromGeojson(layerName, geojson);
                break;

            case LayerType.CUSTOM_GRID_LAYER:
                this.createCustomGridLayerFromGeojson(layerName, geojson);
                break;

            default:
                console.error(`Geojson data of layer ${layerName} has an unknown layer type: ${typeLayer}.`);
                break;
        }

        this._ui.updateUi();
    }

    /**
     * Updates the thematic information of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {ILayerThematic[]} layerThematic The thematic information to update
     */
    updateLayerThematic(layerName: string, layerThematic: ILayerThematic[]) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            layer.loadThematic(layerThematic);
            this.updateRenderInfoProperty(layerName, 'isColorMap', true);

            layer.makeLayerDataInfoDirty();
            layer.makeLayerRenderInfoDirty();
        }
    }

    /**
     * Updates the geometry of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {ILayerGeometry[]} layerGeometry The geometry data to update
     */
    updateLayerGeometry(layerName: string, layerGeometry: ILayerGeometry[]) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            layer.loadGeometry(layerGeometry);
            layer.makeLayerDataInfoDirty();
        }
    }

    /**
     * Updates the render information of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {keyof ILayerRenderInfo} property The property to update
     * @param {unknown} value The new value for the property
     */
    updateRenderInfoProperty(layerName: string, property: keyof ILayerRenderInfo, value: unknown) {
        const layer = this._layerManager.searchByLayerId(layerName);

        if (layer) {
            switch (property) {
                case 'opacity':
                    layer.layerRenderInfo.opacity = value as number;
                    break;
                case 'isColorMap':
                    layer.layerRenderInfo.isColorMap = value as boolean;
                    break;
                case 'isSkip':
                    layer.layerRenderInfo.isSkip = value as boolean;
                    break;
                case 'isPick':
                    layer.layerRenderInfo.isPick = value as boolean;
                    if (value === false) { layer.clearHighlightedIds(); }
                    break;
                case 'colorMapInterpolator':
                    layer.layerRenderInfo.colorMapInterpolator = value as ColorMapInterpolator;
                    break;
                case 'pickedComps':
                    layer.layerRenderInfo.pickedComps = value as number[];
                    break;
                default:
                    console.warn(`Unknown property ${property} for layer ${layerName}.`);
                    return;
            }

            layer.makeLayerRenderInfoDirty();
        }
    }

    /**
     * Starts the drawing loop.
     * @param {number} fps The frames per second to target.
     */
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
        };

        requestAnimationFrame(update);
    }


    // ---- Private methods ----


    /**
     * Handles window resize events
     */
    private handleResize() {
        const width = this._canvas.offsetWidth;
        const height = this._canvas.offsetHeight;

        this.resize(width, height);
    }

    /**
     * Resizes the canvas and updates the camera viewport.
     * @param {number} width The new width of the canvas.
     * @param {number} height The new height of the canvas.
     */
    private resize(width: number, height: number) {
        this._canvas.width = width * (window.devicePixelRatio || 1);
        this._canvas.height = height * (window.devicePixelRatio || 1);

        this._camera.setViewportResolution(width, height);
        this._camera.update();
        this._renderer.resize(width, height);
    }

    /**
     * Renders the map.
     *
     * This method updates the camera, starts the rendering process, and handles picking for each layer.
     */
    private render() {
        // Updates the camera
        this._camera.update();

        // Normal render pass for each layer
        this._renderer.start();
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip) {
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

        // Getting ids
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                const [x, y] = layer.layerRenderInfo.pickedComps;
                layer.getPickedId(x, y).then((id) => {
                    console.log(`Picked id ${id} on layer ${layer.layerInfo.id}`);
                    if (id >= 0) {
                        layer.setHighlightedIds([id]);
                        this._mapEvents.emit(MapEvent.PICK, layer.highlightedIds, layer.layerInfo.id);
                    } else {
                        layer.clearHighlightedIds();
                        this._mapEvents.emit(MapEvent.PICK, [], layer.layerInfo.id);
                    }
                    layer.layerRenderInfo.pickedComps = undefined;
                });
            }
        });
    }


    // ---- Private methods for creating layers ----


    /**
     * Creates a features layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {LayerType} typeLayer The type of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createFeaturesLayerFromGeojson(layerName: string, typeLayer: LayerType, geojson: FeatureCollection) {
        let zIndex = -1;

        switch (typeLayer) {
            case LayerType.OSM_WATER:
                zIndex = LayerZIndex.OSM_WATER;
                break;
            case LayerType.OSM_PARKS:
                zIndex = LayerZIndex.OSM_PARKS;
                break;
            default:
                zIndex = 0.5 + 0.01 * this.layerManager.length;
                break;
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
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
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
                    values: [0],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a coastline layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
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
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
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
                    values: [id / (layerMesh[1].length - 1)],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a roads layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
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
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        TriangulatorLines.offset = 300;
        const layerMesh = TriangulatorLines.buildMesh(geojson, this.origin);
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
                    values: [0],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a buildings layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
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
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
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
                    values: [id / (layerMesh[1].length - 1)],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a custom features layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createCustomFeaturesLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.CUSTOM_FEATURES_LAYER + 0.01 * this.layerManager.length,
            typeGeometry: LayerGeometryType.BORDERS_2D,
            typeLayer: LayerType.CUSTOM_FEATURES_LAYER,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            // Using a color map interpolator for 2D features is not necessary, but it can be used for thematic layers.
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorFeatures.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature Layer.');
            return;
        }
        const layerBorder = TriangulatorBorders.buildBorder(geojson, this.origin);
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
                    values: [0],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates custom lines from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createCustomLinesFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.CUSTOM_LINES_LAYER + 0.01 * this.layerManager.length,
            typeGeometry: LayerGeometryType.FEATURES_2D,
            typeLayer: LayerType.CUSTOM_LINES_LAYER,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_FLAT,
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        TriangulatorLines.offset = 600;
        const layerMesh = TriangulatorLines.buildMesh(geojson, this.origin);
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
                    values: [0],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a custom grid layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createCustomGridLayerFromGeojson(layerName: string, geojson: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: LayerZIndex.CUSTOM_GRID_LAYER,
            typeGeometry: LayerGeometryType.FEATURES_2D,
            typeLayer: LayerType.CUSTOM_GRID_LAYER,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            pipeline: RenderPipeline.TRIANGLE_HEATMAP,
            opacity: 1.0,
            // Using a color map interpolator for 2D features is not necessary, but it can be used for thematic layers.
            colorMapInterpolator: ColorMapInterpolator.INTERPOLATOR_REDS,
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorFeatures.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature Layer.');
            return;
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            thematic: layerMesh[1].map(() => {
                return {
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [0],
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a layer from the provided information.
     * @param {ILayerInfo} layerInfo The information about the layer.
     * @param {ILayerRenderInfo} layerRenderInfo The rendering information for the layer.
     * @param {ILayerData} layerData The data for the layer.
     */
    private createLayer(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);

        if (layer) {
            layer.createPipeline(this._renderer, this._camera);
        }
    }
}
