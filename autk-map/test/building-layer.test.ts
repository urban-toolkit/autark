import type { FeatureCollection } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import type { LayerData } from '../src/types-layers';

// Invoke the real layer-creation boundary without initializing DOM/WebGPU state.
describe('multipart building mesh integration', () => {
  it('matches thematic results by stable feature ID when database export order changes', () => {
    const map = Object.create(AutkMap.prototype) as any;
    const layer = {
      layerInfo: { typeLayer: 'buildings' },
      components: [{ featureIndex: 0, featureId: 'a' }, { featureIndex: 1, featureId: 'b' }],
      layerRenderInfo: { colormap: { config: {
        interpolator: ColorMapInterpolator.SEQ_VIRIDIS,
        domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
      } } },
      loadThematic: vi.fn(() => true),
      updateLayerRenderInfo: vi.fn(),
      makeLayerDataDirty: vi.fn(),
    };
    map._layerManager = { searchByLayerId: () => layer };
    map._ui = { refreshLegend: vi.fn() };
    map.updateThematic('buildings', { property: 'properties.sjoin.count.points', collection: {
      type: 'FeatureCollection', features: [
        { type: 'Feature', id: 'b', geometry: null, properties: { sjoin: { count: { points: 5 } } } },
        { type: 'Feature', id: 'a', geometry: null, properties: { sjoin: { count: { points: 8 } } } },
      ],
    } });
    expect(layer.loadThematic).toHaveBeenCalledWith([{ value: 8, valid: 1 }, { value: 5, valid: 1 }]);
  });

  it('creates one thematic component per building, not per part', () => {
    const map = Object.create(AutkMap.prototype) as any;
    map._layerManager = { origin: [0, 0], computeZindex: () => 1 };
    map.defaultColorMap = vi.fn(() => ({}));
    map.createLayer = vi.fn();
    map.updateThematic = vi.fn();
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'building-a',
        geometry: { type: 'GeometryCollection', geometries: [
          { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
          { type: 'Polygon', coordinates: [[[3, 0], [5, 0], [5, 2], [3, 2], [3, 0]]] },
        ] }, properties: { height: 12, parts: [{ geometryIndex: 1, height: 25 }] },
      }],
    };
    map.createBuildingsLayer('buildings', collection, 'buildings', 'properties.sjoin.count.points');
    expect(map.createLayer).toHaveBeenCalledOnce();
    const data = map.createLayer.mock.calls[0][2] as LayerData;
    expect(data.components).toHaveLength(1);
    expect(data.components[0].featureId).toBe('building-a');
    expect(data.thematic).toHaveLength(1);
    expect(data.geometry.every(mesh => mesh.featureIndex === 0)).toBe(true);
    expect(map.updateThematic).toHaveBeenCalledWith('buildings', { collection, property: 'properties.sjoin.count.points' });
  });
});
