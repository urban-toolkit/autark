import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolylineBuilder, TriangulatorPoints } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';
import { SpriteLayer } from '../src/layer-sprite';
import { PolylineLayer } from '../src/layer-polyline';
import { LayerManager } from '../src/layer-manager';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { DEFAULT_POINT_SIZE, DEFAULT_LINE_WIDTH, type LayerData, type LayerRenderInfo } from '../src/types-layers';

const points: FeatureCollection = { type: 'FeatureCollection', features: [
    { type: 'Feature', id: 'point', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
] };
const lines: FeatureCollection = { type: 'FeatureCollection', features: [
    { type: 'Feature', id: 'motorway', geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]] }, properties: { highway: 'motorway' } },
    { type: 'Feature', id: 'residential', geometry: { type: 'LineString', coordinates: [[20, 0], [30, 0]] }, properties: { highway: 'residential' } },
] };
const renderInfo = (): LayerRenderInfo => ({ opacity: 1, colormap: { config: {} as any } });

function pointLayer(info: Partial<LayerRenderInfo> = {}) {
    const data = TriangulatorPoints.buildInstances(points, [0, 0]);
    return new SpriteLayer({ id: 'points', typeLayer: 'points', zIndex: 1 }, { ...renderInfo(), ...info }, {
        geometry: [], components: data.components, pointInstances: data.instances,
    });
}

function lineLayer(typeLayer: 'polylines' | 'roads' = 'polylines') {
    const data = PolylineBuilder.build(lines, [0, 0]);
    return new PolylineLayer({ id: 'lines', typeLayer, zIndex: 1 }, {
        ...renderInfo(), ...(typeLayer === 'roads' ? { polylinesWidthByComponent: new Float32Array([20, 7]) } : {}),
    }, { geometry: data.geometry, components: data.components, polylineAttributes: data.attributes, thematic: [{ value: 4, valid: 1 }, { value: 8, valid: 1 }] });
}

const pipeline = () => ({ updateColorUniforms: vi.fn(), updateVertexBuffers: vi.fn(), updatePointSize: vi.fn(), updateWidth: vi.fn(), updateZIndex: vi.fn(), renderPass: vi.fn() });

afterEach(() => vi.restoreAllMocks());

describe('per-layer render sizing', () => {
    it('centralizes defaults and uses the point fallback when render state omits a radius', () => {
        expect(DEFAULT_POINT_SIZE).toBe(64);
        expect(DEFAULT_LINE_WIDTH).toBe(12);
        const layer = pointLayer();
        delete layer.layerRenderInfo.pointSize;
        expect(layer.pointSize).toBe(DEFAULT_POINT_SIZE);
    });

    it('updates points through nested renderInfo without rebuilding or zoom multiplication', () => {
        const layer = pointLayer();
        const other = pointLayer();
        const visible = pipeline();
        const picking = pipeline();
        (layer as any)._pipeline = visible;
        (layer as any)._pipelinePicking = picking;
        const map = Object.create(AutkMap.prototype) as any;
        map._layerManager = { searchByLayerId: () => layer };
        const positions = layer.pointInstances;
        const build = vi.spyOn(TriangulatorPoints, 'buildInstances');
        expect(layer.pointSize).toBe(64);
        map.updateRenderInfo('points', { renderInfo: { pointSize: 120 } });
        // Any extra zoom multiplier is a regression: the camera owns the transform.
        const camera = { getZoomScale: () => { throw new Error('Unexpected zoom multiplier'); } } as any;
        layer.renderPass(camera, {} as any);
        layer.renderPickingPass(camera, {} as any);
        expect(visible.updatePointSize).toHaveBeenLastCalledWith(120);
        expect(picking.updatePointSize).toHaveBeenLastCalledWith(120);
        expect(visible.updateVertexBuffers).not.toHaveBeenCalled();
        expect(picking.updateVertexBuffers).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
        expect(layer.pointInstances).toBe(positions);
        expect(other.pointSize).toBe(64);
    });

    it.each([0, -1, NaN, Infinity, -Infinity, 1e100, 1e-100, undefined, null, '12'])('rejects invalid sizing %s without discarding valid patch fields', value => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const point = pointLayer();
        const line = lineLayer();
        point.updateLayerRenderInfo({ pointSize: value as number, opacity: 0.4 });
        line.updateLayerRenderInfo({ polylinesWidth: value as number, opacity: 0.6 });
        expect(point.pointSize).toBe(64);
        expect(line.layerRenderInfo.polylinesWidth).toBe(12);
        expect(point.layerRenderInfo.opacity).toBe(0.4);
        expect(line.layerRenderInfo.opacity).toBe(0.6);
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('validates initial sizes as well as updates', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(pointLayer({ pointSize: -1 }).pointSize).toBe(64);
        expect(pointLayer({ pointSize: 15 }).pointSize).toBe(15);
    });

    it('updates line width without changing topology, thematic data, highlight or skip state', () => {
        const layer = lineLayer();
        const other = lineLayer();
        const visible = pipeline();
        const picking = pipeline();
        (layer as any)._pipeline = visible;
        (layer as any)._pipelinePicking = picking;
        layer.setHighlightedIds([0]);
        layer.setSkippedIds([1]);
        layer.renderPass({} as any, {} as any); // Synchronize interaction data first.
        visible.updateVertexBuffers.mockClear();
        picking.updateVertexBuffers.mockClear();
        const geometry = layer.position;
        const attributes = layer.polylineAttributes;
        const indices = layer.indices;
        const thematic = layer.thematic;
        const map = Object.create(AutkMap.prototype) as any;
        map._layerManager = { searchByLayerId: () => layer };
        const build = vi.spyOn(PolylineBuilder, 'build');
        map.updateRenderInfo('lines', { renderInfo: { polylinesWidth: 24 } });
        layer.renderPickingPass({} as any, {} as any); // Width must work even before a visible pass.
        layer.renderPass({} as any, {} as any);
        expect(picking.updateWidth).toHaveBeenCalledWith(layer);
        expect(visible.updateColorUniforms).toHaveBeenCalledWith(layer);
        expect(visible.updateVertexBuffers).not.toHaveBeenCalled();
        expect(picking.updateVertexBuffers).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
        expect(layer.position).toBe(geometry);
        expect(layer.polylineAttributes).toBe(attributes);
        expect(layer.indices).toBe(indices);
        expect(layer.thematic).toBe(thematic);
        expect(layer.highlightedIds).toEqual([0]);
        expect(layer.skippedIds).toEqual([1]);
        expect(layer.layerRenderInfo.polylinesWidth).toBe(24);
        expect(other.layerRenderInfo.polylinesWidth).toBe(12);
    });

    it('preserves OSM category defaults and permits a uniform road override', () => {
        const map = Object.create(AutkMap.prototype) as any;
        map._layerManager = { origin: [0, 0], hasOrigin: true, computeZindex: () => 1 };
        map._ui = { refreshLayerList: vi.fn() };
        map.defaultColorMap = vi.fn(() => ({}));
        map.createLayer = vi.fn();
        map.loadCollection('roads', { collection: lines, type: 'roads' });
        const [info, style, data] = map.createLayer.mock.calls[0];
        expect(style.polylinesWidth).toBeUndefined();
        expect(style.polylinesWidthByComponent).toEqual(new Float32Array([20, 7]));
        const layer = new PolylineLayer(info, style, data);
        map._layerManager.searchByLayerId = () => layer;
        map.updateRenderInfo('roads', { renderInfo: { polylinesWidth: 12 } });
        expect(layer.layerRenderInfo.polylinesWidth).toBe(12);
        expect(layer.layerRenderInfo.polylinesWidthByComponent).toEqual(new Float32Array([20, 7]));
    });

    it('routes centerlines to the new renderer but preserves prebuilt triangle meshes', () => {
        const manager = new LayerManager();
        const data = PolylineBuilder.build(lines, [0, 0]);
        expect(manager.addLayer({ id: 'centerlines', typeLayer: 'polylines', zIndex: 1 }, renderInfo(), {
            geometry: data.geometry, components: data.components, polylineAttributes: data.attributes,
        })).toBeInstanceOf(PolylineLayer);
        expect(manager.addLayer({ id: 'mesh', typeLayer: 'roads', zIndex: 1 }, renderInfo(), {
            geometry: [{ position: new Float32Array([0, 0, 1, 0, 1, 1]), indices: new Uint32Array([0, 1, 2]) }],
            components: [{ nPoints: 3, nTriangles: 1, featureIndex: 0 }],
        })).toBeInstanceOf(Triangles2DLayer);
    });

    it('rejects missing adjacency instead of treating a mesh as a centerline', () => {
        expect(() => new PolylineLayer({ id: 'lines', typeLayer: 'polylines', zIndex: 1 }, renderInfo(), {
            geometry: [], components: [],
        } as LayerData)).toThrow('adjacency');
    });
});
