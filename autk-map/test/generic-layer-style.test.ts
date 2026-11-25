import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorMap, TriangulatorPolylines, TriangulatorPolygons } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { MapStyle } from '../src/map-style';
import type { LayerData } from '../src/types-layers';

const originalOffset = TriangulatorPolylines.offset;
afterEach(() => {
  TriangulatorPolylines.offset = originalOffset;
  vi.restoreAllMocks();
});

it('sets hover and selection colors independently and reports each change', () => {
  const style = new MapStyle();
  const onChange = vi.fn();
  style.setChangeListener(onChange);
  expect(style.getHighlightColor()).toEqual(ColorMap.hexToRgb('#5dade2'));
  expect(style.getHoverColor()).toEqual(ColorMap.hexToRgb('#f4a261'));
  style.setHoverColor('#ffcc00');
  style.setHighlightColor('#4466cc');
  expect(style.getHoverColor()).toEqual(ColorMap.hexToRgb('#ffcc00'));
  expect(style.getHighlightColor()).toEqual(ColorMap.hexToRgb('#4466cc'));
  expect(onChange).toHaveBeenCalledTimes(2);
});

describe('subdued generic layer defaults', () => {
  it.each([
    ['apple', '#ababa9', '#c3c3c2', '#dcdcda', '#c3cdd4'],
    ['default', '#9ea4a6', '#b5bbbe', '#cbd3d5', '#b98c0f'],
    ['light', '#5a5a5a', '#7a7a7a', '#eaeaec', '#ffffff'],
    ['dark', '#b5b5b5', '#858585', '#3a3737', '#525252'],
    ['google', '#9e9b95', '#b5b1aa', '#cbc7c0', '#a3b2c2'],
    ['osm', '#adaaa5', '#c6c2bc', '#dedbd4', '#d2c0a5'],
  ])('uses the %s generic palette without changing road colors', (preset, points, polylines, polygons, roads) => {
    const style = new MapStyle(preset);
    for (const [key, color] of Object.entries({ points, polylines, polygons, roads })) {
      expect(style.getColor(key)).toEqual(ColorMap.hexToRgb(color));
    }
    expect(style.getColor('custom-category')).toEqual(style.getColor('polygons'));
  });

  it('does not offer the retired poster preset and falls back to apple', () => {
    const style = new MapStyle('light');
    expect(style.availableStyles).not.toContain('poster');
    style.setPredefinedStyle('poster');
    expect(style.currentStyle).toBe('apple');
  });

  it('keeps generic and road widths in render state, not centerline geometry', () => {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0] };
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
    map._layerManager = { origin: [0, 0], hasOrigin: true };
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
    const pipeline = { renderPass: vi.fn(), updateVertexBuffers: vi.fn(), updateColorUniforms: vi.fn() };
    (layer as any)._pipelineBorder = pipeline;
    const fill = vi.fn();
    (layer as any)._pipeline = { renderPass: fill, updateVertexBuffers: vi.fn(), updateColorUniforms: vi.fn() };
    (layer as any)._pipelinePicking = { updateVertexBuffers: vi.fn() };
    layer.renderPass({} as any, {} as any);
    expect(pipeline.renderPass).toHaveBeenCalledOnce(); // Default remains visible.
    map.updateRenderInfo('tag_polygons', { showBorders: false });
    (layer as any)._dataIsDirty = true;
    layer.renderPass({} as any, {} as any);
    expect(pipeline.renderPass).toHaveBeenCalledOnce();
    expect(pipeline.updateVertexBuffers).toHaveBeenCalledOnce(); // Hidden border buffers still synchronize.
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
    map._layerManager = { origin: [0, 0] };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }] };
    map.createPointsLayer('pois', collection, 'points');
    expect(map.createLayer.mock.calls.at(-1)[2]).not.toHaveProperty('pointSize');
    expect(map.createLayer.mock.calls.at(-1)[2].pointInstances).toEqual(new Float32Array([1, 2]));
  });
});
