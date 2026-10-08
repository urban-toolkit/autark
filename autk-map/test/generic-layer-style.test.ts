import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorMap, TriangulatorPolylines, TriangulatorPolygons } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { VectorLayer } from '../src/layer-vector';
import { MapStyle } from '../src/map-style';
import type { LayerData } from '../src/types-layers';

const originalOffset = TriangulatorPolylines.offset;
afterEach(() => {
  TriangulatorPolylines.offset = originalOffset;
  vi.restoreAllMocks();
});

describe('subdued generic layer defaults', () => {
  it.each([
    ['apple', '#718b94', '#a2b5bb', '#dce7df', '#c3cdd4'],
    ['default', '#627e89', '#91a8b2', '#ccdadd', '#b98c0f'],
    ['light', '#8b9995', '#adbab4', '#dde4df', '#b7bdc4'],
    ['google', '#788980', '#a5b6ac', '#d6dfcf', '#a3b2c2'],
    ['osm', '#8d8170', '#b5aa97', '#e0e4d1', '#d2c0a5'],
  ])('uses the %s generic palette without changing road colors', (preset, points, polylines, polygons, roads) => {
    const style = new MapStyle(preset);
    for (const [key, color] of Object.entries({ points, polylines, polygons, roads })) {
      expect(style.getColor(key)).toEqual(ColorMap.hexToRgb(color));
    }
    expect(style.getColor('custom-category')).toEqual(style.getColor('polygons'));
  });

  it('keeps generic and road widths in render state, not centerline geometry', () => {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0], computeZindex: () => 1 };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [100, 0]] }, properties: { highway: 'residential' } }] };
    map.createPolylinesLayer('paths', collection, 'polylines');
    const data = map.createLayer.mock.calls.at(-1)[2] as LayerData;
    expect(map.createLayer.mock.calls.at(-1)[1].polylinesWidth).toBe(12);
    expect(Array.from(data.geometry[0].position).filter((_, i) => i % 2 === 1).every(y => y === 0)).toBe(true);
    map.createPolylinesLayer('roads', collection, 'roads');
    const roads = map.createLayer.mock.calls.at(-1);
    expect(roads[1].polylinesWidthByComponent).toEqual(new Float32Array([7]));
    expect(roads[2].geometry).toEqual(data.geometry);
    expect(roads[2].polylineAttributes).toEqual(data.polylineAttributes);
    expect(TriangulatorPolylines.offset).toBe(originalOffset);
  });

  it('toggles polygon borders through updateRenderInfo without rebuilding geometry or skipping the fill', () => {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0], hasOrigin: true, computeZindex: () => 1 };
    map._ui = { refreshLayerList: vi.fn() };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    const border = vi.spyOn(TriangulatorPolygons, 'buildBorder');
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] }, properties: {} }] };
    map.loadCollection('tag_polygons', { collection, type: 'polygons' });
    const [info, renderInfo, data] = map.createLayer.mock.calls[0];
    const layer = new Triangles2DLayer(info, renderInfo, data);
    map._layerManager.searchByLayerId = () => layer;
    const pipeline = { renderPass: vi.fn(), updateVertexBuffers: vi.fn(), updateColorUniforms: vi.fn(), updateZIndex: vi.fn() };
    (layer as any)._pipelineBorder = pipeline;
    // Keep CPU lifecycle/render-state real; only the WebGPU fill boundary is stubbed.
    const fill = vi.spyOn(VectorLayer.prototype, 'renderPass').mockImplementation(function () {
      (this as any)._dataIsDirty = false;
      (this as any)._renderInfoIsDirty = false;
    });
    layer.renderPass({} as any, {} as any);
    expect(pipeline.renderPass).toHaveBeenCalledOnce(); // Default remains visible.
    map.updateRenderInfo('tag_polygons', { showBorders: false });
    (layer as any)._dataIsDirty = true;
    layer.renderPass({} as any, {} as any);
    expect(pipeline.renderPass).toHaveBeenCalledOnce();
    expect(pipeline.updateVertexBuffers).toHaveBeenCalledOnce(); // Hidden buffers still synchronize.
    map.updateRenderInfo('tag_polygons', { renderInfo: { showBorders: true } });
    layer.renderPass({} as any, {} as any);
    expect(pipeline.renderPass).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledTimes(3);
    expect(border).toHaveBeenCalledOnce();
    expect(map.createLayer).toHaveBeenCalledOnce();
    map.loadCollection('parks', { collection, type: 'parks' });
    expect(border).toHaveBeenCalledOnce();
    expect(map.createLayer.mock.calls.at(-1)[2].border).toEqual([]);
  });

  it('loads only positions for points, leaving radius to the renderer', () => {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0], computeZindex: () => 1 };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }] };
    map.createPointsLayer('pois', collection, 'points');
    expect(map.createLayer.mock.calls.at(-1)[2]).not.toHaveProperty('pointSize');
    expect(map.createLayer.mock.calls.at(-1)[2].pointInstances).toEqual(new Float32Array([1, 2]));
  });
});
