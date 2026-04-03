/// <reference types="@webgpu/types" />

import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import {
    Camera,
    ColorMapDomainMode,
    ColorMapConfig,
    ColorMap,
    EventEmitter,
    isNumericLike,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorBuildings,
    TriangulatorRaster,
    valueAtPath,
} from 'autk-core';

import { ColorMapInterpolator } from './color-types';
import { MapEvent } from './events-types';
import type { MapEventRecord } from './events-types';

import {
    LayerData,
    LayerInfo,
    LayerRenderInfo,
    LayerThematic,
    LayerType,
    ValidDomain,
} from './layer-types';

import {
    LoadCollectionParams,
    UpdateColorMapParams,
    UpdateRasterParams,
    UpdateThematicParams,
} from './api';

import { KeyEvents } from './events-key';
import { MouseEvents } from './events-mouse';
import { ResizeEvents } from './events-resize';

import { Renderer } from './renderer';

import { LayerManager } from './layer-manager';
import { VectorLayer } from './layer-vector';
import { RasterLayer } from './layer-raster';

import { AutkMapUi } from './map-ui';

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
    /** View and projection camera. */
    protected _camera!: Camera;
    /** WebGPU renderer. */
    protected _renderer!: Renderer;
    /** Manages the ordered layer stack. */
    protected _layerManager!: LayerManager;

    /** Keyboard interaction handler. */
    protected _keyEvents!: KeyEvents;
    /** Mouse interaction handler. */
    protected _mouseEvents!: MouseEvents;
    /** Canvas resize handler. */
    protected _resizeEvents!: ResizeEvents;
    /** Public event bus for map events. */
    protected _mapEvents!: EventEmitter<MapEventRecord>;

    /** Map UI controller. */
    protected _ui!: AutkMapUi;
    /** Backing WebGPU canvas. */
    protected _canvas!: HTMLCanvasElement;
    /** Active requestAnimationFrame id, if draw loop is running. */
    protected _animationFrameId: number | null = null;
    /** Indicates whether this map instance has been destroyed. */
    protected _isDestroyed: boolean = false;

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

    /** View and projection camera. */
    get camera(): Camera {
        return this._camera;
    }

    /** WebGPU renderer. */
    get renderer(): Renderer {
        return this._renderer;
    }

    /** Ordered layer stack manager. */
    get layerManager(): LayerManager {
        return this._layerManager;
    }

    /** Backing WebGPU canvas element. */
    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /** Map UI controller. */
    get ui(): AutkMapUi {
        return this._ui;
    }

    /** Public typed map-event bus (e.g., picking). */
    get events(): EventEmitter<MapEventRecord> {
        return this._mapEvents;
    }

    /**
     * Initializes renderer resources, event bindings, and UI.
     */
    async init() {
        if (this._isDestroyed) {
            return;
        }

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
     * 'points', 'polylines', 'polygons', 'raster'.
     *
     * @param params Load parameters.
     * @param params.id Unique layer identifier.
     * @param params.collection Source GeoJSON feature collection.
     * @param params.type Optional layer type override.
     * @param params.property Optional value extractor applied immediately as the initial thematic mapping.
     */
    loadCollection({ id, collection, type = null, property }: LoadCollectionParams): void {
        if (!this.layerManager.bbox) {
            this.layerManager.computeBboxAndOrigin(collection);
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
                this.createPolygonsLayer(id, collection as FeatureCollection, sType, typeof property === 'string' ? property : undefined);
                break;

            case 'roads':
            case 'LineString':
            case 'MultiLineString':
            case 'polylines': {
                const offset = TriangulatorPolylines.offset;
                sType = sType === 'LineString' || sType === 'MultiLineString' ? 'polylines' : sType;
                this.createPolylinesLayer(id, collection as FeatureCollection, sType, offset, typeof property === 'string' ? property : undefined);
                break;
            }
            case 'Point':
            case 'MultiPoint':
            case 'points':
                sType = sType === 'Point' || sType === 'MultiPoint' ? 'points' : sType;
                this.createPointsLayer(id, collection as FeatureCollection, sType, typeof property === 'string' ? property : undefined);
                break;

            case 'buildings':
                this.createBuildingsLayer(id, collection as FeatureCollection, sType, typeof property === 'string' ? property : undefined);
                break;

            case 'raster':
                if (typeof property !== 'string') { console.error(`Layer "${id}": property path string is required for raster layers.`); return; }
                this.createRasterLayer(id, collection, property);
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
    * generation are delegated to `ColorMap` based on the active layer
    * `colorMap` configuration.
     *
     * For raster layers the raster texture is rebuilt from `property`.
     *
     * @param params Update parameters.
     * @param params.id Layer identifier.
     * @param params.collection Source feature collection.
     * @param params.property Dot-path accessor resolved from each feature.
     */
    updateThematic({ id, collection, property }: UpdateThematicParams): void {
        const layer = this._layerManager.searchByLayerId(id) as VectorLayer | null;

        if (!layer) { return; }
        if (layer.layerInfo.typeLayer === 'raster') { return; };

        const thematicData: LayerThematic[] = [];

        const features = collection.features;
        if (features.length === 0) { return; }

        const propertyResolver = (item: unknown) => valueAtPath(item, property);
        const sample = features
            .map(f => propertyResolver(f))
            .find(v => v !== undefined && v !== null);

        if (sample === undefined || sample === null) {
            console.warn(`Thematic property not found on layer '${id}': ${property}`);
            this.updateRenderInfo(id, { isColorMap: false });
            return;
        }

        const dataType = isNumericLike(sample) ? 'number' : typeof sample;

        let resolvedDomain: ValidDomain = [];

        const colorMap = layer.layerRenderInfo.colormap.config;

        if (dataType === 'number') {
            const rawValues = features.map(f => {
                const numeric = Number(propertyResolver(f));
                return Number.isFinite(numeric) ? numeric : 0;
            });

            resolvedDomain = ColorMap.resolveDomainFromData(rawValues, colorMap);
            rawValues.forEach(v => thematicData.push({ values: [v] }));
        } 
        else if (dataType === 'string') {
            const rawValues = features.map(f => String(propertyResolver(f) ?? ''));
            const categoricalDomain = ColorMap.resolveDomainFromData(rawValues, colorMap) as string[];
            resolvedDomain = categoricalDomain;
            rawValues.forEach(value => {
                thematicData.push({ values: [
                    categoricalDomain.indexOf(value)
                ]});
            });
        }

        layer.updateLayerRenderInfo({
            colormap: {
                ...layer.layerRenderInfo.colormap,
                computedDomain: resolvedDomain,
                computedLabels: ColorMap.computeLabels(resolvedDomain),
            },
        });
        this._ui.refreshLegend(layer);

        layer.loadThematic(thematicData);
        layer.makeLayerDataDirty();
    }

    /**
     * Updates raster layer values and color domain.
     *
     * @param params Update parameters.
     * @param params.id Layer identifier.
     * @param params.collection GeoTIFF-derived feature collection.
     * @param params.property Dot-path accessor for each raster cell.
     * @param params.transferFunction Optional opacity transfer-function configuration.
     */
    updateRaster({ id, collection, property, transferFunction }: UpdateRasterParams): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer || layer.layerInfo.typeLayer !== 'raster') { return; }

        const props = collection.features[0].properties;
        if (!props) { return; }

        const rasterValues: number[] = props.raster.map((row: unknown) => Number(valueAtPath(row, property) ?? 0));

        const rasterLayer = layer as RasterLayer;
        const config = layer.layerRenderInfo.colormap.config;
        const resolvedDomain = ColorMap.resolveDomainFromData(rasterValues, config);

        layer.updateLayerRenderInfo({
            colormap: {
                ...layer.layerRenderInfo.colormap,
                computedDomain: resolvedDomain,
                computedLabels: ColorMap.computeLabels(resolvedDomain),
            },
        });
        this._ui.refreshLegend(layer);

        if (transferFunction) {
            rasterLayer.setTransferFunction(transferFunction);
        }

        rasterLayer.loadRaster(rasterValues);
        rasterLayer.makeLayerDataDirty();
    }

    /**
     * Updates color-map configuration for a layer.
     *
     * @param params Color-map update parameters.
     */
    updateColorMap({ id, colorMap }: UpdateColorMapParams): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer) { return; }

        const currentConfig = layer.layerRenderInfo.colormap.config;

        const mergedColorMap: ColorMapConfig = {
            interpolator: colorMap.interpolator ?? currentConfig.interpolator ?? ColorMapInterpolator.SEQUENTIAL_BLUES,
            domain: colorMap.domain ?? currentConfig.domain ?? { type: ColorMapDomainMode.MIN_MAX },
        };

        const nextColormap = {
            ...layer.layerRenderInfo.colormap,
            config: mergedColorMap,
        };

        if (layer.layerInfo.typeLayer === 'raster') {
            const rasterLayer = layer as RasterLayer;
            const rasterValues = rasterLayer.rasterValues;
            if (rasterValues.length > 0) {
                const domain = ColorMap.resolveDomainFromData(rasterValues, mergedColorMap);
                nextColormap.computedDomain = domain;
                nextColormap.computedLabels = ColorMap.computeLabels(domain);
                layer.updateLayerRenderInfo({ colormap: nextColormap });
                rasterLayer.loadRaster(rasterValues);
                rasterLayer.makeLayerDataDirty();
                this._ui.refreshLegend(layer);
                return;
            }
        } else {
            const vectorLayer = layer as VectorLayer;
            const thematicValues = vectorLayer.thematic;
            if (thematicValues.length > 0) {
                const domain = ColorMap.resolveDomainFromData(thematicValues, mergedColorMap);
                nextColormap.computedDomain = domain;
                nextColormap.computedLabels = ColorMap.computeLabels(domain);
            }
        }

        layer.updateLayerRenderInfo({ colormap: nextColormap });
        this._ui.refreshLegend(layer);
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

        if ('isColorMap' in info) {
            needsLegend = true;
            needsLayerList = true;
        }
        if ('isSkip' in info) {
            needsLayerList = true;
        }
        if ('isPick' in info) {
            if (info.isPick === false) { 
                layer.clearHighlightedIds(); 
            }
            needsLayerList = true;
        }
        layer.updateLayerRenderInfo(info);

        if (needsLegend) { this._ui.refreshLegend(layer); }
        if (needsLayerList) { this._ui.refreshLayerList(); }
    }

    /**
     * Starts the continuous render loop.
     *
     * @param fps Target frames per second (default `60`). Pass `0` to render as fast as possible.
     */
    draw(fps: number = 60) {
        if (this._isDestroyed) {
            return;
        }

        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }

        let previousDelta = 0;

        const update = (currentDelta: number) => {
            if (this._isDestroyed) {
                this._animationFrameId = null;
                return;
            }

            this._animationFrameId = requestAnimationFrame(update);
            const delta = currentDelta - previousDelta;

            if (fps && delta < 1000 / fps) {
                return;
            }

            this.render();
            previousDelta = currentDelta;
        };

        this._animationFrameId = requestAnimationFrame(update);
    }

    /**
     * Tears down map resources and event bindings.
     * Cancels the render loop, detaches DOM listeners, and releases GPU resources.
     */
    destroy(): void {
        if (this._isDestroyed) {
            return;
        }

        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }

        this._keyEvents.destroyEvents();
        this._mouseEvents.destroyEvents();
        this._resizeEvents.destroyEvents();

        this._layerManager.layers.forEach((layer) => {
            layer.destroy();
        });

        this._renderer.destroy();

        this._isDestroyed = true;
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
    * @param property Optional value extractor used to initialize thematic data.
     */
    private createPolygonsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, property?: string) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorPolygons.buildMesh(geojson, this.layerManager.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Polygon Layer');
            return;
        }

        let layerBorder: [LayerData['border'], LayerData['borderComponents']];
        if (typeLayer === 'polygons') {
            layerBorder = TriangulatorPolygons.buildBorder(geojson, this.layerManager.origin);
            if (!layerBorder[0] || !layerBorder[1] || layerBorder[0].length === 0 || layerBorder[1].length === 0) {
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

        if (property) {
            this.updateThematic({ id: layerName, collection: geojson, property });
        }
    }

    /**
     * Creates a polyline-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param offset Polyline extrusion offset used by triangulation.
    * @param property Optional value extractor used to initialize thematic data.
     */
    private createPolylinesLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, offset: number, property?: string) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        TriangulatorPolylines.offset = offset;
        const layerMesh = TriangulatorPolylines.buildMesh(geojson, this.layerManager.origin);
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

        if (property) {
            this.updateThematic({ id: layerName, collection: geojson, property });
        }
    }

    /**
     * Creates a point-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
    * @param property Optional value extractor used to initialize thematic data.
     */
    private createPointsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, property?: string) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: typeLayer,
        };

        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorPoints.buildMesh(geojson, this.layerManager.origin);
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

        if (property) {
            this.updateThematic({ id: layerName, collection: geojson, property });
        }
    }

    /**
     * Creates a buildings vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
    * @param property Optional value extractor used to initialize thematic data.
     */
    private createBuildingsLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, property?: string) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex(typeLayer),
            typeLayer: 'buildings',
        };

        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorBuildings.buildMesh(geojson, this.layerManager.origin);
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

        if (property) {
            this.updateThematic({ id: layerName, collection: geojson, property });
        }
    }

    /**
     * Creates a raster layer from a GeoTIFF-derived feature collection.
     *
     * @param layerName Target layer id.
     * @param geotiff GeoTIFF-derived feature collection.
     * @param property Value extractor for each raster row/cell payload.
     */
    private createRasterLayer(layerName: string, geotiff: FeatureCollection<Geometry | null>, property: string) {
        const layerInfo: LayerInfo = {
            id: `${layerName}`,
            zIndex: this._layerManager.computeZindex('raster'),
            typeLayer: 'raster',
        };

        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };

        const layerMesh = TriangulatorRaster.buildMesh(geotiff, this.layerManager.origin);
        if (layerMesh[0].length === 0 || layerMesh[1].length === 0) {
            console.error('Invalid Feature Layer.');
            return;
        }

        const props = geotiff.features[0].properties;
        if (!props) {
            console.error('GeoTIFF properties are missing.');
            return;
        }

        const layerData: LayerData = {
            geometry: layerMesh[0],
            components: layerMesh[1],
            rasterResX: props.rasterResX,
            rasterResY: props.rasterResY,
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
        this.updateRaster({ id: layerName, collection: geotiff, property });
    }

    private defaultColorMap(): ColorMapConfig {
        return {
            interpolator: ColorMapInterpolator.SEQUENTIAL_REDS,
            domain: { type: ColorMapDomainMode.MIN_MAX },
        };
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
