/// <reference types="@webgpu/types" />

import {
    BBox,
    FeatureCollection,
    Geometry,
} from 'geojson';

import {
    Camera,
    ColorMap,
    EventEmitter,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorBuildings,
    TriangulatorRaster,
} from 'autk-core';


import {
    ColorMapInterpolator,
    LayerType,
    MapEvent,
} from './constants';

import type { 
    MapEventRecord 
} from './constants';

import {
    LayerData,
    LayerInfo,
    LayerRenderInfo,
    LayerThematic,
    LoadCollectionParams,
    UpdateThematicParams,
    SequentialDomain,
    DivergingDomain,
    CategoricalDomain,
} from './interfaces';


import { Renderer } from './renderer';
import { KeyEvents } from './key-events';
import { MouseEvents } from './mouse-events';
import { ResizeEvents } from './resize-events';
import { LayerManager } from './layer-manager';

import { AutkMapUi } from './map-ui';
import { LayerBbox } from './layer-bbox';

import { VectorLayer } from './layer-vector';
import { RasterLayer } from './layer-raster';

/**
 * Main map controller for rendering, interaction, and layer lifecycle.
 *
 * `AutkMap` initializes the renderer, camera, layer manager, and interaction
 * controllers, and exposes high-level APIs for loading and updating layers.
 * 
 * @example
 * const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
 *
 * const map = new AutkMap(canvas);
 * await map.init();
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
    /** The resize events handler for window resize interactions */
    protected _resizeEvents!: ResizeEvents;
    /** The map events handler for map interactions */
    protected _mapEvents!: EventEmitter<MapEventRecord>;

    /** The UI instance for managing the map's user interface */
    protected _ui!: AutkMapUi;
    /** The canvas element used for rendering the map */
    protected _canvas!: HTMLCanvasElement;

    /**
     * Creates an instance of the AutkMap class.
     *
     * @param canvas Canvas element used as the WebGPU drawing surface.
     */
    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
        this._renderer = new Renderer(canvas);

        this._camera = new Camera();
        this._layerManager = new LayerManager();

        this._keyEvents = new KeyEvents(this);
        this._mouseEvents = new MouseEvents(this);
        this._resizeEvents = new ResizeEvents(this);
        this._mapEvents = new EventEmitter<MapEventRecord>();

        this._ui = new AutkMapUi(this);
    }

    /**
     * Gets the camera instance used for rendering the map.
     * @returns Camera instance.
     */
    get camera(): Camera {
        return this._camera;
    }

    /**
     * Gets the renderer instance used for rendering the map.
     * @returns Renderer instance.
     */
    get renderer(): Renderer {
        return this._renderer;
    }

    /**
     * Gets the layer manager instance used for managing map layers.
     * @returns Layer manager instance.
     */
    get layerManager(): LayerManager {
        return this._layerManager;
    }

    /**
     * Gets the canvas element used for rendering the map.
     * @returns Backing canvas element.
     */
    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /**
     * Gets the UI instance used for managing the map's user interface.
     * @returns UI controller instance.
     */
    get ui(): AutkMapUi {
        return this._ui;
    }

    /**
     * Gets the origin of the map, which is the center of the bounding box.
     * @returns Origin coordinates `[x, y]`.
     */
    get origin(): number[] {
        return this._layerManager.origin;
    }

    /**
     * Gets the bounding box of the map.
     * @returns Bounding box tuple `[minLon, minLat, maxLon, maxLat]`.
     */
    get boundingBox(): BBox {
        return this._layerManager.bboxAndOrigin;
    }

    /**
     * Sets the map bounding box.
     *
     * @param bbox Bounding box tuple `[minLon, minLat, maxLon, maxLat]`.
     */
    set boundingBox(bbox: BBox) {
        this._layerManager.bboxAndOrigin = bbox;
    }

    /**
     * Initializes renderer resources, event bindings, and UI.
     */
    async init() {
        await this._renderer.init();

        this._keyEvents.bindEvents();
        this._mouseEvents.bindEvents();

        this._resizeEvents.bindEvents();
        this._resizeEvents.resize();

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
     * @param params Load parameters.
     * @param params.id Unique layer identifier.
     * @param params.collection Source GeoJSON feature collection.
     * @param params.type Optional layer type override.
     */
    loadCollection({ id, collection, type = null, getFnv }: LoadCollectionParams): void {
        if (!this.boundingBox) {
            if (collection.bbox) {
                this.boundingBox = collection.bbox;
            } else {
                this.boundingBox = LayerBbox.build(collection as FeatureCollection);
            }
        }

        let sType = type ?? (collection.features.length > 0 ? collection.features[0].geometry?.type : null);

        switch (sType) {
            case 'Polygon':
            case 'MultiPolygon':
            case 'surface':
            case 'water':
            case 'parks':
            case 'polygons':
                sType = sType === 'Polygon' || sType === 'MultiPolygon' ? 'polygons' : sType;
                this.createPolygonsLayer(id, collection as FeatureCollection, sType);
                break;

            case 'roads':
            case 'LineString':
            case 'MultiLineString':
            case 'polylines': {
                const offset = TriangulatorPolylines.offset;
                sType = sType === 'LineString' || sType === 'MultiLineString' ? 'polylines' : sType;
                this.createPolylinesLayer(id, collection as FeatureCollection, sType, offset);
                break;
            }
            case 'Point':
            case 'MultiPoint':
            case 'points':
                sType = sType === 'Point' || sType === 'MultiPoint' ? 'points' : sType;
                this.createPointsLayer(id, collection as FeatureCollection, sType);
                break;

            case 'buildings':
                this.createBuildingsLayer(id, collection as FeatureCollection, sType);
                break;

            case 'raster':
                if (!getFnv) { console.error(`Layer "${id}": getFnv is required for raster layers.`); return; }
                this.createRasterLayer(id, collection, getFnv);
                break;

            default:
                console.error(`Collection of layer ${id} has an unknown layer type: ${sType}.`);
                break;
        }

        this._ui.refreshLayerList();
    }

    /**
     * Updates the thematic (color-mapped) values of a layer from a feature collection.
     *
     * Normalization to `[0, 1]` (required by the GPU shader) and legend label
     * generation are delegated to `ColorMap`. The caller supplies raw data values;
     * the domain may be provided explicitly or is computed automatically.
     *
     * For raster layers the raster texture is rebuilt from `getFnv`.
     *
     * @param params Update parameters.
     * @param params.id Layer identifier.
     * @param params.collection Source feature collection.
     * @param params.getFnv Value extractor — receives a `Feature` for vector layers, a raster cell for raster layers.
     * @param params.domain Explicit color-scale domain. If omitted, computed from the data. Not applicable to raster layers.
     */
    updateThematic({ id, collection, getFnv, domain }: UpdateThematicParams): void {
        const layer = this._layerManager.searchByLayerId(id) as VectorLayer | null;

        if (!layer) { return; }
        if (layer.layerInfo.typeLayer === 'raster') { return; };

        const thematicData: LayerThematic[] = [];

        const features = collection.features;
        const dataType = typeof getFnv(features[0]);

        let resolvedDomain: SequentialDomain | DivergingDomain | CategoricalDomain = [];

        if (dataType === 'number') {
            const rawValues = features.map(f => getFnv(f) as number);
            resolvedDomain = ColorMap.resolveNumericDomain(rawValues, domain);

            const normalized = ColorMap.normalizeValues(rawValues, resolvedDomain as SequentialDomain | DivergingDomain);
            normalized.forEach(v => thematicData.push({ values: [v] }));
        } 
        else if (dataType === 'string') {
            const rawValues = features.map(f => getFnv(f) as string);
            resolvedDomain = ColorMap.resolveCategoricalDomain(rawValues, domain);

            rawValues.forEach(value => {
                thematicData.push({ values: [
                    (resolvedDomain as CategoricalDomain).indexOf(value) / ((resolvedDomain as CategoricalDomain).length - 1)
                ]});
            });
        }

        this.updateRenderInfo(id, {
            colorMapLabels: ColorMap.computeLabels(resolvedDomain)
        });

        layer.loadThematic(thematicData);
        layer.makeLayerDataDirty();
    }

    /**
     * Updates raster layer values and color domain.
     *
     * @param id Layer identifier.
     * @param rasterValues New raster values.
     * @param domain Optional color-scale domain. If omitted, computed from values.
     */
    updateRaster(id: string, rasterValues: number[], domain?: SequentialDomain | DivergingDomain): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer || layer.layerInfo.typeLayer !== 'raster') { return; }

        const rasterLayer = layer as RasterLayer;
        const resolvedDomain = ColorMap.resolveNumericDomain(rasterValues, domain);

        this.updateRenderInfo(id, {
            colorMapLabels: ColorMap.computeLabels(resolvedDomain)
        });

        rasterLayer.loadRaster(rasterValues);
        rasterLayer.makeLayerDataDirty();
    }

    /**
     * Updates one or more render properties of a layer.
     *
     * @param id Layer identifier.
     * @param info Render properties to update.
     */
    updateRenderInfo(id: string, info: Partial<LayerRenderInfo>): void {
        const layer = this._layerManager.searchByLayerId(id);
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
            if (info.isPick === false) { layer.clearHighlightedIds(); }
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
     *
     * @param fps Frames per second target.
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

    /**
     * Executes one render frame, including normal and picking passes.
     */
    private render() {
        this._camera.update();

        // Normal render pass
        this._renderer.start();
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip) {
                layer.renderPass(this._camera);
            }
        });
        this._renderer.finish();

        // Picking render pass
        this._renderer.startPickingRenderPass();
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                layer.renderPickingPass(this._camera);
            }
        });
        this._renderer.finish();

        // Resolve picked IDs
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && layer.layerRenderInfo.isPick && layer.layerRenderInfo.pickedComps) {
                const vectorLayer = layer as VectorLayer;
                const [x, y] = layer.layerRenderInfo.pickedComps;
                layer.layerRenderInfo.pickedComps = undefined;
                layer.getPickedId(x, y).then((id) => {
                    console.log(`Picked id ${id} on layer ${layer.layerInfo.id}`);
                    if (id >= 0) {
                        vectorLayer.toggleHighlightedIds([id]);
                        this._mapEvents.emit(MapEvent.PICKING, { selection: vectorLayer.highlightedIds, layerId: layer.layerInfo.id });
                    } else {
                        layer.clearHighlightedIds();
                        this._mapEvents.emit(MapEvent.PICKING, { selection: [], layerId: layer.layerInfo.id });
                    }
                });
            }
        });
    }

    /**
     * Creates a polygon-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
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
     * Creates a polyline-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param offset Polyline extrusion offset used by triangulation.
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
     * Creates a point-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
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
     * Creates a buildings vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type hint.
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
     * Creates a raster layer from a GeoTIFF-derived feature collection.
     *
     * @param layerName Target layer id.
     * @param geotiff GeoTIFF-derived feature collection.
     * @param getFnv Value extractor for each raster row/cell payload.
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
            rasterResX: props.rasterResX,
            rasterResY: props.rasterResY,
            raster: rasterValues,
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
    }

    /**
     * Creates a layer from the provided information.
     *
     * @param layerInfo Metadata describing the layer.
     * @param layerRenderInfo Initial render configuration.
     * @param layerData Triangulated geometry/components payload.
     */
    private createLayer(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);
        if (layer) {
            layer.createPipeline(this._renderer);
        }
    }
}
