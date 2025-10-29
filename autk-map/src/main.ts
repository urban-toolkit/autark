/// <reference types="@webgpu/types" />

import {
    BBox,
    Feature,
    FeatureCollection,
    GeoJsonProperties,
} from 'geojson';

import {
    ColorMapInterpolator,
    LayerType,
    MapEvent,
    ThematicAggregationLevel,
} from './constants';

import {
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

import { TriangulatorPoints } from './triangulator-points';
import { TriangulatorPolygons } from './triangulator-polygons';
import { TriangulatorPolylines } from './triangulator-polylines';
import { TriangulatorBuildings } from './triangulator-buildings';

import { AutkMapUi } from './map-ui';
import { LayerBbox } from './layer-bbox';

import { VectorLayer } from './layer-vector';
import { RasterLayer } from './layer-raster';
import { TriangulatorRaster } from './triangulator-raster';

/**
 * The main autark map class.
 *
 * `AutkMap` encapsulates the core logic for initializing and rendering a map on a given HTML canvas element.
 * It manages the camera, map rendering, map layers, and user interactions through keyboard, mouse, and map events.
 * 
 * @example
 * const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
 * const boundingBox = \/* { bounding box for the map } *\/ ;
 *
 * const map = new AutkMap(canvas);
 * await map.init(boundingBox);
 * 
 * const geojsonData = { \/* GeoJSON data *\/ };
 * map.loadGeoJsonLayer('my_data', LayerType.CUSTOM_FEATURES_LAYER, geojsonData);
 */
export class AutkMap {
    /** The camera instance used for rendering the map */
    protected _camera!: Camera;
    /** The renderer instance used for rendering the map */
    protected _renderer!: Renderer;
    /** The layer manager instance used for managing map layers */
    protected _layerManager!: LayerManager;

    /** The key events handler for keyboard interactions */
    protected _keyEvents!: KeyEvents;
    /** The mouse events handler for mouse interactions */
    protected _mouseEvents!: MouseEvents;
    /** The map events handler for map interactions */
    protected _mapEvents!: MapEvents;

    /** The UI instance for managing the map's user interface */
    protected _ui!: AutkMapUi;
    /** The canvas element used for rendering the map */
    protected _canvas!: HTMLCanvasElement;

    /**
     * Creates an instance of the AutkMap class.
     * @param {HTMLCanvasElement} canvas The canvas element to render the map on
     * @param {boolean} [autoResize=true] Whether to automatically resize the canvas on window resize
     */
    constructor(canvas: HTMLCanvasElement, autoResize = true) {
        this._canvas = canvas;

        this._camera = new Camera();
        this._renderer = new Renderer(canvas);
        this._layerManager = new LayerManager();

        this._keyEvents = new KeyEvents(this);
        this._mouseEvents = new MouseEvents(this);
        this._mapEvents = new MapEvents([MapEvent.PICK]);

        this._ui = new AutkMapUi(this);

        if (autoResize) {
            window.addEventListener('resize', () => {
                this.handleResize.bind(this)();
                this._ui.handleResize();
            });
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
     * @returns {Bbox} The bounding box
     */
    get boundingBox(): BBox {
        return this._layerManager.bboxAndOrigin;
    }
    set boundingBox(bbox: BBox) {
        this._layerManager.bboxAndOrigin = bbox;
    }

    /**
     * Initializes the map.
     */
    async init() {
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
     * - AUTK_OSM_SURFACE
     * - AUTK_OSM_WATER
     * - AUTK_OSM_PARKS
     * - AUTK_OSM_ROADS
     * - AUTK_OSM_BUILDINGS
     *
     * Custom layers can also be loaded with types:
     * - AUTK_GEO_POINTS
     * - AUTK_GEO_POLYLINES
     * - AUTK_GEO_POLYGONS
     * - AUTK_RASTER
     *
     * @param {string} layerName The name of the layer
     * @param {LayerType} typeLayer The type of the layer
     * @param {FeatureCollection} geojson The GeoJSON data to load
     */
    loadGeoJsonLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType | null = null) {
        // Check if the bounding box is already set
        if (!this.boundingBox) {
            if (geojson.bbox) {
                this.boundingBox = geojson.bbox;
            } else {
                this.boundingBox = LayerBbox.build(geojson);
            }
        }

        // Check the layer type
        if (typeLayer === null) {
            const geoType = geojson.features.length > 0 && geojson.features[0].geometry?.type;
            console.log('Detected geoType:', geoType);

            switch (geoType) {
                case 'Point':
                case 'MultiPoint':
                    typeLayer = LayerType.AUTK_GEO_POINTS;
                    break;
                case 'LineString':
                case 'MultiLineString':
                    typeLayer = LayerType.AUTK_GEO_POLYLINES;
                    break;
                case 'Polygon':
                case 'MultiPolygon':
                    typeLayer = LayerType.AUTK_GEO_POLYGONS;
                    break;
            }
        }

        switch (typeLayer) {
            case LayerType.AUTK_OSM_SURFACE:
            case LayerType.AUTK_OSM_WATER:
            case LayerType.AUTK_OSM_PARKS:
            case LayerType.AUTK_GEO_POLYGONS:
                this.createPolygonsLayer(layerName, geojson, typeLayer);
                break;

            case LayerType.AUTK_OSM_ROADS:
            case LayerType.AUTK_GEO_POLYLINES:
                const offset = (typeLayer === LayerType.AUTK_OSM_ROADS) ? 300 : 1000;
                this.createPolylinesLayer(layerName, geojson, typeLayer, offset);
                break;

            case LayerType.AUTK_GEO_POINTS:
                this.createPointsLayer(layerName, geojson, typeLayer);
                break;

            case LayerType.AUTK_OSM_BUILDINGS:
                this.createBuildingsLayer(layerName, geojson, typeLayer);
                break;

            default:
                console.error(`Geojson data of layer ${layerName} has an unknown layer type: ${typeLayer}.`);
                break;
        }
    }

    /**
     * Loads a GeoTIFF layer into the map.
     * This method creates a layer based on the provided GeoTIFF data and adds it to the map's layer manager.
     *
     * @param layerName The name of the layer
     * @param geotiff The GeoTIFF data to load
     * @param typeLayer The type of the layer
     */
    public loadGeoTiffLayer(layerName: string, geotiff: FeatureCollection, typeLayer: LayerType | null = null) {

        // TODO: Validate geotiff input
        // Allow the user to provide a geotiff and parse using geotiff.js library

        switch (typeLayer) {
            case LayerType.AUTK_RASTER:
                this.createRasterLayer(layerName, geotiff);
                break;
            default:
                console.error(`Geojson data of layer ${layerName} has an unknown layer type: ${typeLayer}.`);
                break;
        }

    }

    /**
     * Updates the thematic information of a layer based on a GeoJSON source.
     * 
     * This method extracts thematic values from the GeoJSON features using the provided function,
     * normalizes these values, and updates the layer's thematic data accordingly.
     * 
     * @param {string} layerName The name of the layer to update
     * @param {(feature: Feature) => number | string} getFnv A function that extracts a numeric value from a GeoJSON feature
     * @param {FeatureCollection} geojson The GeoJSON data containing the features
     * @param {boolean} [groupById=false] Whether to group features by their 'building_id' property to ensure uniqueness
     */
    updateGeoJsonLayerThematic(layerName: string, geojson: FeatureCollection, getFnv: (feature: Feature) => number | string, groupById: boolean = false) {
        const thematicData: ILayerThematic[] = [];

        let filtered: Feature[] = geojson.features;
        if (groupById) {
            const visited = new Set<string>();
            filtered = filtered.filter((f) => {
                let key = f.properties ? f.properties.building_id as string : '-1';

                if (!visited.has(key)) {
                    visited.add(key);
                    return true;
                }
                return false;
            });
        }

        const dataType = typeof getFnv(filtered[0]);

        if (dataType === 'number') {
            for (const feature of filtered) {
                const properties = feature.properties as GeoJsonProperties;
                if (!properties) { continue; }

                const val = +getFnv(feature);
                thematicData.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [val],
                });
            }

            const valMin = Math.min(...thematicData.map(d => +d.values[0]));
            const valMax = Math.max(...thematicData.map(d => +d.values[0]));

            this.updateRenderInfoProperty(layerName, 'colorMapLabels', [`${valMin}`, `${valMax}`]);

            for (let i = 0; i < thematicData.length; i++) {
                const val = +thematicData[i].values[0];
                thematicData[i].values = [(val - valMin) / (valMax - valMin)];
            }
        }

        if (dataType === 'string') {
            const strCats = Array.from(new Set(filtered.map(f => getFnv(f) as string)));
            this.updateRenderInfoProperty(layerName, 'colorMapLabels', strCats);

            for (const feature of filtered) {
                const properties = feature.properties as GeoJsonProperties;
                if (!properties) { continue; }

                const val = 0.1 * strCats.indexOf(getFnv(feature) as string);
                thematicData.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [val],
                });
            }
        }

        this.updateLayerThematic(layerName, thematicData);
    }

    /**
     * Updates the thematic information of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {ILayerThematic[]} layerThematic The thematic information to update
     */
    updateLayerThematic(layerName: string, layerThematic: ILayerThematic[]) {
        const layer = this._layerManager.searchByLayerId(layerName) as VectorLayer;

        if (layer) {
            layer.loadThematic(layerThematic);
            layer.makeLayerDataDirty();
        }
    }

    /**
     * Updates the geometry of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {ILayerGeometry[]} layerGeometry The geometry data to update
     */
    public updateLayerGeometry(layerName: string, layerGeometry: ILayerGeometry[]) {
        const layer = this._layerManager.searchByLayerId(layerName) as VectorLayer | RasterLayer;

        if (layer) {
            layer.loadGeometry(layerGeometry);
            layer.makeLayerDataDirty();
        }
    }

    /**
     * Updates the render information of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {ILayerRenderInfo} property The property to update
     * @param {unknown} value The new value for the property
     */
    public updateRenderInfoProperty(layerName: string, property: keyof ILayerRenderInfo, value: unknown) {
        const layer = this._layerManager.searchByLayerId(layerName) as VectorLayer | RasterLayer;

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
                    if (value === false) { (layer as VectorLayer).clearHighlightedIds(); }
                    break;
                case 'colorMapInterpolator':
                    layer.layerRenderInfo.colorMapInterpolator = value as ColorMapInterpolator;
                    break;
                case 'colorMapLabels':
                    layer.layerRenderInfo.colorMapLabels = value as string[];
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
    public draw(fps: number = 60) {
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

        this._camera.resize(width, height);
        this._renderer.resize(width, height);
    }

    /**
     * Renders the map.
     * This method updates the camera, starts the rendering process, and handles picking for each layer.
     */
    private render() {
        // Updates the camera
        this._camera.update();

        // Normal render pass for each layer
        this._renderer.start();
        this._layerManager.vectorLayers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip) {
                layer.renderPass(this._camera);
            }
        });
        this._layerManager.rasterLayers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip) {
                layer.renderPass(this._camera);
            }
        });
        this._renderer.finish();

        // Picking render pass for each layer
        this._renderer.startPickingRenderPass();
        this._layerManager.vectorLayers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                layer.renderPickingPass(this._camera);
            }
        });
        this._renderer.finish();

        // Getting ids
        this._layerManager.vectorLayers.forEach((layer) => {
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

    /**
     * Creates a features layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {LayerType} typeLayer The type of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createPolygonsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            colorMapLabels: ['0.0', '1.0'],
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorPolygons.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Polygon Layer');
            return;
        }

        let layerBorder = null;
        if (typeLayer === LayerType.AUTK_GEO_POLYGONS) {
            layerBorder = TriangulatorPolygons.buildBorder(geojson, this.origin);
            if (layerBorder[0].length === 0 || layerBorder[1].length === 0) {
                console.error('Invalid Polygon Layer border.');
                return;
            }
        } else {
            layerBorder = [[], []];
        }

        const layerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            border: layerBorder[0],
            borderComponents: layerBorder[1],
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
     * Creates a roads layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createPolylinesLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, offset: number = 1000) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            colorMapLabels: ['0.0', '1.0'],
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        TriangulatorPolylines.offset = offset;
        const layerMesh = TriangulatorPolylines.buildMesh(geojson, this.origin);
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
     * Creates a points layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createPointsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            colorMapLabels: ['0.0', '1.0'],
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorPoints.buildMesh(geojson, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Points Layer.');
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
    private createBuildingsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: LayerType.AUTK_OSM_BUILDINGS,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            colorMapLabels: ['0.0', '1.0'],
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
     * @param {FeatureCollection} geotiff The GeoJSON data.
     */
    private createRasterLayer(layerName: string, geotiff: FeatureCollection) {
        const layerInfo: ILayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(LayerType.AUTK_RASTER),
            typeLayer: LayerType.AUTK_RASTER,
        };

        const layerRenderInfo: ILayerRenderInfo = {
            opacity: 1.0,
            colorMapInterpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            colorMapLabels: ['0.0', '1.0'],
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorRaster.buildMesh(geotiff, this.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature Layer.');
            return;
        }

        const props = geotiff.features[0].properties;
        if (!props) {
            console.error('GeoTIFF properties are missing.');
            return;
        }

        const layerData: ILayerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            raster: [{
                rasterResX: props.rasterResX,
                rasterResY: props.rasterResY,
                rasterValues: props.raster
            }],
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
        let layer: VectorLayer | RasterLayer;

        if (layerInfo.typeLayer === LayerType.AUTK_RASTER) {
            layer = this._layerManager.addRasterLayer(layerInfo, layerRenderInfo, layerData) as RasterLayer;
        }
        else {
            layer = this._layerManager.addVectorLayer(layerInfo, layerRenderInfo, layerData) as VectorLayer;
        }

        if (layer) {
            layer.createPipeline(this._renderer);
        }
    }
}
