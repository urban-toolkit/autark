/**
 * @module AutkMap
 * A WebGPU-based map rendering engine for GeoJSON data.
 *
 * This module defines the `AutkMap` class, which serves as the main controller
 * for rendering, interaction, and layer lifecycle management. It provides
 * high-level APIs for loading GeoJSON feature collections and prebuilt meshes,
 * updating thematic mappings and color configurations, and handling user
 * interactions such as picking and highlighting.
 *
 * The `AutkMap` class integrates a WebGPU renderer, a camera system, a layer
 * manager, and event controllers for keyboard, mouse, and resize events. It
 * also exposes a public event bus for map events (e.g., picking) and a UI
 * controller for managing the map's user interface components.
 */

/// <reference types="@webgpu/types" />

import {
    FeatureCollection,
    Geometry,
} from 'geojson';

import {
    Camera,
    ColorMapDomainStrategy,
    ColorMapConfig,
    ColorMap,
    ColorMapInterpolator,
    EventEmitter,
    isNumericLike,
    TriangulatorPoints,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorBuildings,
    TriangulatorRaster,
    valueAtPath,
    LayerType,
    ResolvedDomain,
    mapGeometryTypeToLayerType,
} from './types-core';

import { MapEvent } from './types-events';
import type { MapEventRecord } from './types-events';

import {
    LayerData,
    LayerInfo,
    LayerRenderInfo,
    LayerThematic,
} from './types-layers';

import {
    LoadCollectionParams,
    LoadMeshParams,
    UpdateColorMapParams,
    UpdateRenderInfoParams,
    UpdateRasterParams,
    UpdateThematicParams,
} from './api';

import { KeyEvents } from './events-key';
import { MouseEvents } from './events-mouse';
import { ResizeEvents } from './events-resize';

import { Renderer } from './renderer';

import { Layer } from './layer';
import { LayerManager } from './layer-manager';
import { VectorLayer } from './layer-vector';
import { RasterLayer } from './layer-raster';
import { Triangles3DLayer } from './layer-triangles3D';
import { PipelineBuildingSSAO } from './pipeline-triangle-ssao';

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
 * map.loadCollection('my_data', { collection: geojsonData });
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

    /** Currently active pick-enabled layer, if any. */
    get activePickingLayer(): Layer | null {
        return this._layerManager.layers.find((layer) => layer.layerRenderInfo.isPick) ?? null;
    }

    /**
     * Initializes renderer resources, event bindings, and UI.
     *
     * @returns Promise that resolves when renderer initialization completes.
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
     * When `type` is omitted the layer type is inferred from all non-null
     * geometries in the collection. Implicit inference only works for
     * collections that resolve to a single geometry family
     * (Point → 'points', LineString → 'polylines', Polygon → 'polygons').
     * Mixed-geometry collections must pass an explicit `type`.
     *
     * Supported layer types: 'surface', 'water', 'parks', 'roads', 'buildings',
     * 'points', 'polylines', 'polygons', 'raster'.
     *
     * @param id Unique layer identifier.
     * @param params Load parameters.
     * @param params.collection Source GeoJSON feature collection.
     * @param params.type Optional layer type override.
     * @param params.property Optional value extractor applied immediately as the initial thematic mapping.
     */
    loadCollection(id: string, { collection, type = null, property }: LoadCollectionParams): void {
        if (!this.layerManager.hasOrigin) {
            this.layerManager.initializeOrigin(collection);
        }

        let sType = type ?? this.inferCollectionLayerType(collection, id);
        if (!sType) { return; }

        switch (sType) {
            case 'surface':
            case 'water':
            case 'parks':
            case 'polygons':
                this.createPolygonsLayer(id, collection as FeatureCollection, sType, typeof property === 'string' ? property : undefined);
                break;

            case 'roads':
            case 'polylines': {
                this.createPolylinesLayer(id, collection as FeatureCollection, sType, typeof property === 'string' ? property : undefined);
                break;
            }
            case 'points':
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
     * Loads a prebuilt 3D triangle mesh directly into the map.
     *
     * Mesh coordinates must already be expressed in the map's local coordinate
     * space, relative to the current shared origin.
     *
     * @param id Layer identifier.
     * @param params Mesh loading parameters.
     * @param params.geometry Prebuilt mesh geometry chunks.
     * @param params.components Per-feature mesh component metadata.
     * @param params.thematic Optional precomputed thematic values.
     * @param params.type Optional layer type override for the mesh.
     * @returns Nothing. The mesh layer is created and registered with the map.
     */
    loadMesh(id: string, { geometry, components, thematic, type = 'buildings' }: LoadMeshParams): void {
        if (!this.layerManager.hasOrigin) {
            throw new Error(`Layer '${id}': map origin must be initialized before loading a mesh.`);
        }

        const layerInfo: LayerInfo = {
            id,
            zIndex: this._layerManager.computeZindex(type),
            typeLayer: type,
        };
        const layerRenderInfo: LayerRenderInfo = {
            opacity: 1.0,
            colormap: { config: this.defaultColorMap() },
            isColorMap: false,
            isPick: false,
            isSkip: false,
        };
        const layerData: LayerData = {
            geometry,
            components,
            thematic: thematic ?? components.map(() => ({ value: 0, valid: 1 })),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);
        this._ui.refreshLayerList();
    }

    /**
     * Updates the thematic (color-mapped) values of a layer from a feature collection.
     *
     * Normalization to `[0, 1]` (required by the GPU shader) and legend label
     * generation are delegated to `ColorMap` based on the active layer
     * `colorMap` configuration.
     *
     * Thematic values are aligned to rendered components through source feature
     * metadata captured during triangulation. When both the layer and the input
     * collection expose feature ids, matching is done by `feature.id`; otherwise
     * the update falls back to the original feature index order.
     *
     * For raster layers the raster texture is rebuilt from `property`.
     *
     * @param id Layer identifier.
     * @param params Update parameters.
     * @param params.collection Source feature collection.
     * @param params.property Dot-path accessor resolved from each feature.
     */
    updateThematic(id: string, { collection, property }: UpdateThematicParams): void {
        const layer = this._layerManager.searchByLayerId(id) as VectorLayer | null;

        if (!layer) { return; }
        if (layer.layerInfo.typeLayer === 'raster') { return; };

        const features = collection.features;
        if (features.length === 0) { return; }

        const components = layer.components;
        if (components.length === 0) { return; }

        const propertyResolver = (item: unknown) => valueAtPath(item, property);
        const sample = features
            .map(f => propertyResolver(f))
            .find(v => v !== undefined && v !== null);

        if (sample === undefined || sample === null) {
            console.warn(`Thematic property not found on layer '${id}': ${property}`);
            this.updateRenderInfo(id, { renderInfo: { isColorMap: false } });
            return;
        }

        const dataType = isNumericLike(sample) ? 'number' : typeof sample;
        if (dataType !== 'number' && dataType !== 'string') {
            console.warn(`Unsupported thematic property type on layer '${id}': ${dataType}`);
            this.updateRenderInfo(id, { renderInfo: { isColorMap: false } });
            return;
        }

        let resolvedDomain: ResolvedDomain = [];

        const colorMap = layer.layerRenderInfo.colormap.config;
        const thematicByFeatureIndex: LayerThematic[] = [];
        const canMatchById = components.every((component) => component.featureId !== undefined)
            && features.every((feature) => feature.id !== undefined);
        const thematicByFeatureId = canMatchById ? new Map<string | number, LayerThematic>() : null;

        const storeThematicValue = (featureIndex: number, value: number, valid: number): boolean => {
            const thematic = { value, valid };
            thematicByFeatureIndex[featureIndex] = thematic;

            if (!thematicByFeatureId) {
                return true;
            }

            const featureId = features[featureIndex].id as string | number;
            if (thematicByFeatureId.has(featureId)) {
                console.error(`Layer '${id}': duplicate feature id '${featureId}' prevents thematic matching.`);
                return false;
            }

            thematicByFeatureId.set(featureId, thematic);
            return true;
        };

        if (dataType === 'number') {
            const rawValues = features.map((feature) => {
                const resolved = propertyResolver(feature);
                const numeric = Number(resolved);
                return Number.isFinite(numeric) ? numeric : undefined;
            });
            const validValues = rawValues.filter((value): value is number => value !== undefined);

            if (validValues.length === 0) {
                console.warn(`No valid numeric thematic values found on layer '${id}': ${property}`);
                this.updateRenderInfo(id, { renderInfo: { isColorMap: false } });
                return;
            }

            resolvedDomain = ColorMap.resolveDomainFromData(validValues, colorMap);
            for (let featureIndex = 0; featureIndex < rawValues.length; featureIndex++) {
                const rawValue = rawValues[featureIndex];
                if (!storeThematicValue(featureIndex, rawValue ?? 0, rawValue === undefined ? 0 : 1)) {
                    return;
                }
            }
        } 
        else if (dataType === 'string') {
            const rawValues = features.map((feature) => {
                const resolved = propertyResolver(feature);
                return resolved === undefined || resolved === null ? undefined : String(resolved);
            });
            const validValues = rawValues.filter((value): value is string => value !== undefined);

            if (validValues.length === 0) {
                console.warn(`No valid categorical thematic values found on layer '${id}': ${property}`);
                this.updateRenderInfo(id, { renderInfo: { isColorMap: false } });
                return;
            }

            const categoricalDomain = ColorMap.resolveDomainFromData(validValues, colorMap) as string[];
            resolvedDomain = categoricalDomain;
            for (let featureIndex = 0; featureIndex < rawValues.length; featureIndex++) {
                const rawValue = rawValues[featureIndex];
                const categoryIndex = rawValue === undefined ? 0 : categoricalDomain.indexOf(rawValue);
                const isValid = rawValue !== undefined && categoryIndex >= 0 ? 1 : 0;
                if (!storeThematicValue(featureIndex, categoryIndex >= 0 ? categoryIndex : 0, isValid)) {
                    return;
                }
            }
        }

        const thematicData: LayerThematic[] = [];
        if (thematicByFeatureId) {
            for (const component of components) {
                const thematic = thematicByFeatureId.get(component.featureId as string | number);
                if (!thematic) {
                    console.error(
                        `Layer '${id}': missing thematic value for feature id '${String(component.featureId)}'.`
                    );
                    return;
                }
                thematicData.push(thematic);
            }
        } else {
            for (const component of components) {
                const thematic = thematicByFeatureIndex[component.featureIndex];
                if (!thematic) {
                    console.error(
                        `Layer '${id}': missing thematic value for source feature index ${component.featureIndex}.`
                    );
                    return;
                }
                thematicData.push(thematic);
            }
        }

        if (!layer.loadThematic(thematicData)) {
            return;
        }

        layer.updateLayerRenderInfo({
            colormap: {
                ...layer.layerRenderInfo.colormap,
                computedDomain: resolvedDomain,
                computedLabels: ColorMap.computeLabels(resolvedDomain),
            },
        });
        this._ui.refreshLegend(layer);

        layer.makeLayerDataDirty();
    }

    /**
     * Updates raster layer values and color domain.
     *
     * @param id Layer identifier.
     * @param params Update parameters.
     * @param params.collection GeoTIFF-derived feature collection.
     * @param params.property Dot-path accessor for each raster cell.
     * @param params.transferFunction Optional opacity transfer-function configuration.
     */
    updateRaster(id: string, { collection, property, transferFunction }: UpdateRasterParams): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer || layer.layerInfo.typeLayer !== 'raster') { return; }

        if (collection.features.length === 0) {
            console.warn(`Raster update skipped for layer '${id}': empty collection.`);
            return;
        }

        const props = collection.features[0].properties;
        if (!props || !Array.isArray(props.raster)) {
            console.warn(`Raster update skipped for layer '${id}': invalid raster payload.`);
            return;
        }

        const rasterValues = new Float32Array(props.raster.map((row: unknown) => Number(valueAtPath(row, property) ?? 0)));

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
     * @param id Layer identifier.
     * @param params Color-map update parameters.
     * @returns Nothing. The target layer render configuration is updated in place.
     */
    updateColorMap(id: string, { colorMap }: UpdateColorMapParams): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer) { return; }

        const currentConfig = layer.layerRenderInfo.colormap.config;

        const mergedColorMap: ColorMapConfig = {
            interpolator: colorMap.interpolator ?? currentConfig.interpolator ?? ColorMapInterpolator.SEQ_BLUES,
            domainSpec: colorMap.domainSpec ?? currentConfig.domainSpec ?? { type: ColorMapDomainStrategy.MIN_MAX },
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
                const existingDomain = layer.layerRenderInfo.colormap.computedDomain;
                const domain = Array.isArray(existingDomain)
                    && existingDomain.length > 0
                    && existingDomain.every(v => typeof v === 'string')
                    ? existingDomain
                    : ColorMap.resolveDomainFromData(thematicValues, mergedColorMap);
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
     * @param params Render update parameters.
     * @param params.renderInfo Render properties to update.
     * @returns Nothing. The target layer render state is updated in place.
     */
    updateRenderInfo(id: string, params: UpdateRenderInfoParams | Partial<LayerRenderInfo>): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer) { return; }

        const info = 'renderInfo' in params ? params.renderInfo : params;

        const nextInfo: Partial<LayerRenderInfo> = { ...info };

        let needsLegend = false;
        let needsLayerList = false;

        if ('isColorMap' in info) {
            needsLegend = true;
            needsLayerList = true;
        }
        if ('isSkip' in info) {
            needsLayerList = true;
        }
        if ('isPick' in nextInfo) {
            if (nextInfo.isPick === true) {
                this.deactivateOtherPickingLayers(id);
            } else if (nextInfo.isPick === false) {
                layer.clearHighlightedIds();
                nextInfo.pickedComps = undefined;
            }
            needsLayerList = true;
        }
        layer.updateLayerRenderInfo(nextInfo);

        if (needsLegend) { this._ui.refreshLegend(layer); }
        if (needsLayerList) { this._ui.refreshLayerList(); }
    }

    /**
     * Removes all layers matching the provided id.
     *
     * @param id Layer identifier.
     * @returns Nothing. Matching layers are removed from the map.
     */
    removeLayer(id: string): void {
        this._layerManager.removeLayerById(id);
        this._ui.handleLayerRemoved(id);
        this._ui.refreshLayerList();
    }

    /**
     * Replaces the highlighted selection of a pickable layer.
     *
     * @param id Layer identifier.
     * @param selection Component ids to highlight.
     * @returns Nothing. Unsupported layers are ignored.
     */
    setHighlightedIds(id: string, selection: number[]): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer || !layer.supportsHighlight) {
            return;
        }

        layer.setHighlightedIds(selection);
    }

    /**
     * Clears the highlighted selection of a pickable layer.
     *
     * @param id Layer identifier.
     * @returns Nothing. Unsupported layers are ignored.
     */
    clearHighlightedIds(id: string): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!layer || !layer.supportsHighlight) {
            return;
        }

        layer.clearHighlightedIds();
    }

    /**
     * Toggles skipped rendering for the provided component ids of a vector layer.
     *
     * @param id Layer identifier.
     * @param selection Component ids to skip/unskip.
     * @returns Nothing. Non-vector layers are ignored.
     */
    setSkippedIds(id: string, selection: number[]): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!(layer instanceof VectorLayer)) {
            return;
        }

        layer.setSkippedIds(selection);
    }

    /**
     * Clears skipped rendering state for a vector layer.
     *
     * @param id Layer identifier.
     * @returns Nothing. Non-vector layers are ignored.
     */
    clearSkippedIds(id: string): void {
        const layer = this._layerManager.searchByLayerId(id);
        if (!(layer instanceof VectorLayer)) {
            return;
        }

        layer.clearSkippedIds();
    }

    /**
     * Starts the continuous render loop.
     *
     * @param fps Target frames per second (default `60`). Pass `0` to render as fast as possible.
     * @returns Nothing. Rendering is scheduled via `requestAnimationFrame`.
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
     *
     * @returns Nothing. Repeated calls after destruction are ignored.
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

        this._ui.destroy();
        this._renderer.destroy();

        this._isDestroyed = true;
    }

    /**
     * Infers a layer type from a homogeneous collection of vector geometries.
     *
     * Returns `null` when the collection is empty, contains only null geometries,
     * or mixes multiple geometry families that require an explicit layer type.
     *
     * @param collection Source feature collection to inspect.
     * @param layerId Layer identifier used in diagnostics.
     * @returns Inferred layer family, or `null` when inference fails.
     */
    private inferCollectionLayerType(collection: FeatureCollection<Geometry | null>, layerId: string): LayerType | null {
        const families = new Set<Extract<LayerType, 'points' | 'polygons' | 'polylines'>>();
        const visitGeometry = (geometry: Geometry | null, featureIndex: number): void => {
            if (!geometry) {
                console.warn(`Layer "${layerId}": feature ${featureIndex} has null geometry and will be ignored during type inference.`);
                return;
            }

            if (geometry.type === 'GeometryCollection') {
                for (const child of geometry.geometries) {
                    visitGeometry(child, featureIndex);
                }
                return;
            }

            families.add(mapGeometryTypeToLayerType(geometry.type));
        };

        for (let index = 0; index < collection.features.length; index++) {
            const feature = collection.features[index];
            visitGeometry(feature.geometry, index);
            if (families.size > 1) {
                console.error(
                    `Layer "${layerId}": cannot infer layer type from mixed geometry families. Pass an explicit type or split the collection.`
                );
                return null;
            }
        }

        const [family] = families;
        if (family) {
            return family;
        }

        console.error(`Layer "${layerId}": cannot infer layer type from an empty or geometry-less collection.`);
        return null;
    }

    /**
     * Executes one render frame, including normal and picking passes.
     *
     * @returns Nothing. Rendering commands are recorded and submitted to the GPU.
     */
    private render() {
        this._camera.update();
        const activePickingLayer = this.activePickingLayer;
        const pendingPick = activePickingLayer
            && !activePickingLayer.layerRenderInfo.isSkip
            && activePickingLayer.layerRenderInfo.pickedComps
            ? (() => {
                const [x, y] = activePickingLayer.layerRenderInfo.pickedComps!;
                activePickingLayer.layerRenderInfo.pickedComps = undefined;
                return { layer: activePickingLayer, vectorLayer: activePickingLayer as VectorLayer, x, y };
            })()
            : null;

        // Normal render pass
        this._renderer.start();
        const visible3DLayers = this._layerManager.layers.filter(
            (layer): layer is Triangles3DLayer => !layer.layerRenderInfo.isSkip && layer instanceof Triangles3DLayer
        );
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip) {
                layer.prepareRender(this._camera);
            }
        });
        if (visible3DLayers.length > 0) {
            const geometryPassEncoder = PipelineBuildingSSAO.beginSharedGeometryPass(this._renderer);
            visible3DLayers.forEach((layer) => {
                layer.renderSceneGeometry(this._camera, geometryPassEncoder);
            });
            geometryPassEncoder.end();
        }
        const mainPassEncoder = this._renderer.beginMainRenderPass();
        this._layerManager.layers.forEach((layer) => {
            if (!layer.layerRenderInfo.isSkip && !(layer instanceof Triangles3DLayer)) {
                layer.renderPass(this._camera, mainPassEncoder);
            }
        });
        if (visible3DLayers.length > 0) {
            PipelineBuildingSSAO.compositeSharedPass(this._renderer, mainPassEncoder);
        }
        mainPassEncoder.end();

        let pickReadbackSlot: number | null = null;
        if (pendingPick) {
            this._renderer.startPickingRenderPass();
            pendingPick.layer.renderPickingPass(this._camera);

            pickReadbackSlot = this._renderer.reservePickingReadbackSlot(1);
            if (pickReadbackSlot === null) {
                console.warn('Picking readback buffers are still busy; skipping this picking frame.');
            } else {
                this._renderer.enqueuePickingReadback(pickReadbackSlot, 0, pendingPick.x, pendingPick.y);
            }
        }

        this._renderer.finish();

        if (pickReadbackSlot !== null && pendingPick) {
            this._renderer.readPickingResults(pickReadbackSlot, 1).then((ids) => {
                const id = ids[0] ?? -1;
                const { layer, vectorLayer } = pendingPick;

                if (id >= 0) {
                    vectorLayer.toggleHighlightedIds([id]);
                    this._mapEvents.emit(MapEvent.PICKING, { selection: vectorLayer.highlightedIds, layerId: layer.layerInfo.id });
                } else {
                    layer.clearHighlightedIds();
                    this._mapEvents.emit(MapEvent.PICKING, { selection: [], layerId: layer.layerInfo.id });
                }
            });
        }
    }

    /**
     * Clears picking state from every layer except the requested one.
     *
     * @param activeLayerId Identifier of the layer that should remain pick-enabled.
     * @returns Nothing. Other pick-enabled layers are deactivated.
     */
    private deactivateOtherPickingLayers(activeLayerId: string): void {
        this._layerManager.layers.forEach((otherLayer) => {
            if (otherLayer.layerInfo.id === activeLayerId || !otherLayer.layerRenderInfo.isPick) {
                return;
            }

            otherLayer.clearHighlightedIds();
            otherLayer.updateLayerRenderInfo({ isPick: false, pickedComps: undefined });
        });
    }

    /**
     * Creates a polygon-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param property Optional value extractor used to initialize thematic data.
     * @returns Nothing. The layer is created when triangulation succeeds.
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
                    value: 0,
                    valid: 1,
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);

        if (property) {
            this.updateThematic(layerName, { collection: geojson, property  });
        }
    }

    /**
     * Creates a polyline-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param property Optional value extractor used to initialize thematic data.
     * @returns Nothing. The layer is created when triangulation succeeds.
      */
    private createPolylinesLayer(layerName: string, geojson: FeatureCollection, typeLayer: LayerType, property?: string) {
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

        TriangulatorPolylines.offset = typeLayer === 'roads' ? 5 : 8.5;
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
                    value: 0,
                    valid: 1,
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);

        if (property) {
            this.updateThematic(layerName, { collection: geojson, property  });
        }
    }

    /**
     * Creates a point-based vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param property Optional value extractor used to initialize thematic data.
     * @returns Nothing. The layer is created when triangulation succeeds.
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
                    value: 0,
                    valid: 1,
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);

        if (property) {
            this.updateThematic(layerName, { collection: geojson, property  });
        }
    }

    /**
     * Creates a buildings vector layer from GeoJSON.
     *
     * @param layerName Target layer id.
     * @param geojson Source feature collection.
     * @param typeLayer Layer type.
     * @param property Optional value extractor used to initialize thematic data.
     * @returns Nothing. The layer is created when triangulation succeeds.
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
                    value: 0,
                    valid: 1,
                };
            }),
        };

        this.createLayer(layerInfo, layerRenderInfo, layerData);

        if (property) {
            this.updateThematic(layerName, { collection: geojson, property  });
        }
    }

    /**
     * Creates a raster layer from a GeoTIFF-derived feature collection.
     *
     * @param layerName Target layer id.
     * @param geotiff GeoTIFF-derived feature collection.
     * @param property Value extractor for each raster row/cell payload.
     * @returns Nothing. The raster layer is created and initialized.
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
        this.updateRaster(layerName, { collection: geotiff, property  });
    }

    /**
     * Creates a layer from the provided information.
     *
     * @param layerInfo Metadata describing the layer.
     * @param layerRenderInfo Initial render configuration.
     * @param layerData Triangulated geometry/components payload.
     * @returns Nothing. The layer pipeline is created when layer registration succeeds.
     */
    private createLayer(layerInfo: LayerInfo, layerRenderInfo: LayerRenderInfo, layerData: LayerData) {
        const layer = this._layerManager.addLayer(layerInfo, layerRenderInfo, layerData);
        if (layer) {
            layer.createPipeline(this._renderer);
        }
    }

    /**
     * Returns the default color-map configuration used for newly created layers.
     *
     * @returns Default sequential red colormap with min/max numeric domain inference.
     */
    private defaultColorMap(): ColorMapConfig {
        return {
            interpolator: ColorMapInterpolator.SEQ_REDS,
            domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
        };
    }
}
