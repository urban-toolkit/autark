/// <reference types="@webgpu/types" />

import {
    BBox,
    FeatureCollection,
    GeoJsonProperties,
    Geometry,
} from 'geojson';


import { 
    ColorMap,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorBuildings,
    TriangulatorRaster 
} from 'autk-core';


import {
    ColorMapInterpolator,
    LayerType,
    MapEvent,
    NormalizationMode,
} from './constants';


import {
    LayerData,
    LayerGeometry,
    LayerInfo,
    LayerRenderInfo,
    LayerThematic,
    LoadCollectionParams,
    LoadRasterCollectionParams,
    UpdateRasterCollectionParams,
    UpdateThematicParams,
} from './interfaces';

import { Camera } from 'autk-core';
import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { MapEvents } from './map-events';
import { LayerManager } from './layer-manager';

import { AutkMapUi } from './map-ui';
import { LayerBbox } from './layer-bbox';

import { VectorLayer } from './layer-vector';
import { RasterLayer } from './layer-raster';

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
 * map.loadCollection({ id: 'my_data', collection: geojsonData });
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
        this._mapEvents = new MapEvents([MapEvent.PICKING]);

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
    get events(): MapEvents {
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
     * Loads a GeoJSON feature collection as a map layer.
     *
     * When `type` is omitted the layer type is inferred from the geometry of the
     * first feature (Point → 'points', LineString → 'polylines', Polygon → 'polygons').
     *
     * Supported layer types: 'surface', 'water', 'parks', 'roads', 'buildings',
     * 'points', 'polylines', 'polygons'.
     *
     * @param {LoadCollectionParams} params
     * @param {string}           params.id         Unique layer identifier
     * @param {FeatureCollection} params.collection GeoJSON feature collection
     * @param {LayerType}        [params.type]      Optional layer type override
     */
    loadCollection({ id, collection, type = null }: LoadCollectionParams): void {
        if (!this.boundingBox) {
            if (collection.bbox) {
                this.boundingBox = collection.bbox;
            } else {
                this.boundingBox = LayerBbox.build(collection);
            }
        }

        if (type === null) {
            const geoType = collection.features.length > 0 && collection.features[0].geometry?.type;
            console.log('Detected geoType:', geoType);

            switch (geoType) {
                case 'Point':
                case 'MultiPoint':
                    type = 'points';
                    break;
                case 'LineString':
                case 'MultiLineString':
                    type = 'polylines';
                    break;
                case 'Polygon':
                case 'MultiPolygon':
                    type = 'polygons';
                    break;
            }
        }

        switch (type) {
            case 'surface':
            case 'water':
            case 'parks':
            case 'polygons':
                this.createPolygonsLayer(id, collection, type);
                break;

            case 'roads':
            case 'polylines': {
                const offset = (type === 'roads') ? TriangulatorPolylines.offset : TriangulatorPolylines.offset * 3;
                this.createPolylinesLayer(id, collection, type, offset);
                break;
            }

            case 'points':
                this.createPointsLayer(id, collection, type);
                break;

            case 'buildings':
                this.createBuildingsLayer(id, collection, type);
                break;

            default:
                console.error(`Collection of layer ${id} has an unknown layer type: ${type}.`);
                break;
        }

        this._ui.refreshLayerList();
    }

    /**
     * Loads a raster (GeoTIFF-derived) feature collection as a map layer.
     *
     * @param {LoadRasterCollectionParams} params
     * @param {string}                         params.id         Unique layer identifier
     * @param {FeatureCollection<Geometry|null>} params.collection GeoTIFF-derived feature collection
     * @param {(cell: unknown) => number}        params.getFnv     Extracts a numeric value from each raster cell
     */
    public loadRasterCollection({ id, collection, getFnv }: LoadRasterCollectionParams): void {
        // TODO: Validate geotiff input — allow raw GeoTIFF parsed via geotiff.js
        this.createRasterLayer(id, collection, getFnv);
        this._ui.refreshLayerList();
    }

    /**
     * Updates the raster values of an existing raster layer in place.
     *
     * Use this instead of removing and re-adding the layer when only the raster
     * values change (e.g. switching the month in a heatmap). The geometry and
     * render settings of the layer are preserved.
     *
     * @param {UpdateRasterCollectionParams} params
     * @param {string}           params.id         Name of the existing raster layer
     * @param {FeatureCollection} params.collection New GeoTIFF-derived feature collection
     * @param {(cell: unknown) => number} params.getFnv Extracts a numeric value from each raster cell
     */
    public updateRasterCollection({ id, collection, getFnv }: UpdateRasterCollectionParams): void {
        const layer = this._layerManager.searchByLayerId(id) as RasterLayer;
        if (!layer) {
            console.error(`Layer ${id} not found.`);
            return;
        }

        const props = collection.features[0].properties;
        if (!props) {
            console.error('GeoTIFF properties are missing.');
            return;
        }

        layer.loadRaster([{
            rasterResX: props.rasterResX,
            rasterResY: props.rasterResY,
            rasterValues: props.raster.map((row: unknown) => getFnv(row)),
        }]);

        layer.makeLayerDataDirty();
    }

    /**
     * Updates the thematic (color-mapped) values of a layer from a feature collection.
     *
     * Values extracted by `getFnv` are automatically normalized to [0, 1] and
     * uploaded to the GPU. Both numeric and categorical (string) data are supported.
     *
     * @param {UpdateThematicParams} params
     * @param {string}            params.id           Layer identifier
     * @param {FeatureCollection}  params.collection   Source feature collection
     * @param {Function}           params.getFnv       Extracts a value from each feature
     * @param {NormalizationConfig} [params.normalization] Normalization strategy (default: MIN_MAX)
     */
    updateThematic({ id, collection, getFnv, normalization = { mode: NormalizationMode.MIN_MAX } }: UpdateThematicParams): void {
        const thematicData: LayerThematic[] = [];
        const features = collection.features;
        const dataType = typeof getFnv(features[0]);

        if (dataType === 'number') {
            for (const feature of features) {
                const properties = feature.properties as GeoJsonProperties;
                if (!properties) { continue; }

                const val = +getFnv(feature);
                thematicData.push({
                    values: [val],
                });
            }

            const rawValues = thematicData.map(d => +d.values[0]);
            const [valMin, valMax] = ColorMap.computeNormalizationRange(
                rawValues,
                normalization.mode,
                normalization.lowerPercentile,
                normalization.upperPercentile,
            );

            this.updateLayerRenderInfo(id, { colorMapLabels: [`${valMin}`, `${valMax}`] });

            const range = valMax - valMin;
            for (let i = 0; i < thematicData.length; i++) {
                const val = +thematicData[i].values[0];
                thematicData[i].values = [range > 0 ? Math.max(0, Math.min(1, (val - valMin) / range)) : 0];
            }
        }

        if (dataType === 'string') {
            const strCats = Array.from(new Set(features.map(f => getFnv(f) as string)));
            this.updateLayerRenderInfo(id, { colorMapLabels: strCats });

            for (const feature of features) {
                const properties = feature.properties as GeoJsonProperties;
                if (!properties) { continue; }

                const val = 0.1 * strCats.indexOf(getFnv(feature) as string);
                thematicData.push({
                    values: [val],
                });
            }
        }

        this.updateLayerThematic(id, thematicData);
    }

    /**
     * Updates the thematic information of a layer.
     * 
     * @param {string} layerName The name of the layer
     * @param {LayerThematic[]} layerThematic The thematic information to update
     */
    updateLayerThematic(layerName: string, layerThematic: LayerThematic[]) {
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
     * @param {LayerGeometry[]} layerGeometry The geometry data to update
     */
    public updateLayerGeometry(layerName: string, layerGeometry: LayerGeometry[]) {
        const layer = this._layerManager.searchByLayerId(layerName) as VectorLayer | RasterLayer;

        if (layer) {
            layer.loadGeometry(layerGeometry);
            layer.makeLayerDataDirty();
        }
    }

    /**
     * Updates one or more render properties of a layer.
     *
     * @param {string} id - Layer identifier
     * @param {Partial<LayerRenderInfo>} info - Render properties to update
     */
    public updateLayerRenderInfo(id: string, info: Partial<LayerRenderInfo>): void {
        const layer = this._layerManager.searchByLayerId(id) as VectorLayer | RasterLayer;
        if (!layer) { return; }

        let needsLegend = false;
        let needsLayerList = false;

        if ('opacity' in info) { layer.layerRenderInfo.opacity = info.opacity!; }
        if ('isColorMap' in info) {
            layer.layerRenderInfo.isColorMap = info.isColorMap;
            needsLegend = true;
            needsLayerList = true;
        }
        if ('isSkip' in info) {
            layer.layerRenderInfo.isSkip = info.isSkip;
            needsLayerList = true;
        }
        if ('isPick' in info) {
            layer.layerRenderInfo.isPick = info.isPick;
            if (info.isPick === false) { (layer as VectorLayer).clearHighlightedIds(); }
            needsLayerList = true;
        }
        if ('colorMapInterpolator' in info) {
            layer.layerRenderInfo.colorMapInterpolator = info.colorMapInterpolator!;
            needsLegend = true;
        }
        if ('colorMapLabels' in info) {
            layer.layerRenderInfo.colorMapLabels = info.colorMapLabels!;
            needsLegend = true;
        }
        if ('pickedComps' in info) { layer.layerRenderInfo.pickedComps = info.pickedComps; }

        if (needsLegend) { this._ui.refreshLegend(layer); }
        if (needsLayerList) { this._ui.refreshLayerList(); }

        layer.makeLayerRenderInfoDirty();
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
        this._camera.update();

        // Normal render pass for each layer
        //----------------------------------------------------------------
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
        //----------------------------------------------------------------


        // Picking render pass for each layer
        //----------------------------------------------------------------
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
                layer.layerRenderInfo.pickedComps = undefined;
                layer.getPickedId(x, y).then((id) => {
                    console.log(`Picked id ${id} on layer ${layer.layerInfo.id}`);
                    if (id >= 0) {
                        layer.toggleHighlightedIds([id]);
                        this._mapEvents.emit(MapEvent.PICKING, layer.highlightedIds, layer.layerInfo.id);
                    } else {
                        layer.clearHighlightedIds();
                        this._mapEvents.emit(MapEvent.PICKING, [], layer.layerInfo.id);
                    }
                });
            }
        });
        //----------------------------------------------------------------
    }

    /**
     * Creates a features layer from a GeoJSON source.
     * @param {string} layerName The name of the layer.
     * @param {LayerType} typeLayer The type of the layer.
     * @param {FeatureCollection} geojson The GeoJSON data.
     */
    private createPolygonsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
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
        if (typeLayer === 'polygons') {
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
    private createPolylinesLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, offset: number) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
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
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
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
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: 'buildings',
        };

        const layerRenderInfo: LayerRenderInfo = {
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
    private createRasterLayer(layerName: string, geotiff: FeatureCollection<Geometry | null>, getFnv: (cell: unknown) => number) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex('raster'),
            typeLayer: 'raster',
        };

        const layerRenderInfo: LayerRenderInfo = {
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

        const rasterValues: number[] = props.raster.map((row: unknown) => getFnv(row));

        const layerData: LayerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            raster: [{
                rasterResX: props.rasterResX,
                rasterResY: props.rasterResY,
                rasterValues,
            }],
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a layer from the provided information.
     * @param {LayerInfo} layerInfo The information about the layer.
     * @param {LayerRenderInfo} layerRenderInfo The rendering information for the layer.
     * @param {LayerData} layerData The data for the layer.
     */
    private createLayer(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        let layer: VectorLayer | RasterLayer;

        if (layerInfo.typeLayer === 'raster') {
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
