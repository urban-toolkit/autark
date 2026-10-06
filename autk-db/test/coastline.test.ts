import { booleanPointInPolygon, multiPolygon, point } from '@turf/turf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coastalLandMask } from '../src/internal/process-osm-surface/coastline';
import type { OsmElement } from '../src/use-cases/load-osm-overpass/interfaces';

const box = { west: 0, south: 0, east: 10, north: 10 };
const coast = (coordinates: number[][], id = 1): OsmElement => ({ type: 'way', id, tags: { natural: 'coastline' },
  geometry: coordinates.map(([lon, lat]) => ({ lon, lat })) });
afterEach(() => vi.restoreAllMocks());

describe('coastline land mask (OSM land on the left)', () => {
  it('closes a coast at the bbox edges and selects land, not sea', () => {
    const warn = vi.spyOn(console, 'warn');
    const mask = coastalLandMask([coast([[5, -1], [5, 11]])], box)!;
    expect(mask).toBeDefined();
    expect(booleanPointInPolygon(point([2, 5]), multiPolygon(mask.coordinates))).toBe(true);
    expect(booleanPointInPolygon(point([8, 5]), multiPolygon(mask.coordinates))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('connects differently ordered ways without reversing the coastline direction', () => {
    const mask = coastalLandMask([coast([[5, 5], [5, 11]], 2), coast([[5, -1], [5, 5]])], box)!;
    expect(mask).toBeDefined();
    expect(booleanPointInPolygon(point([2, 5]), mask)).toBe(true);
    expect(booleanPointInPolygon(point([8, 5]), mask)).toBe(false);
  });

  it('preserves islands and rejects the surrounding sea', () => {
    const mask = coastalLandMask([coast([[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]])], box)!;
    expect(mask).toBeDefined();
    expect(booleanPointInPolygon(point([3, 3]), mask)).toBe(true);
    expect(booleanPointInPolygon(point([8, 8]), mask)).toBe(false);
  });

  it('retains holes and multiple land components', () => {
    const mask = coastalLandMask([
      coast([[3, -1], [3, 11]]), // west mainland
      coast([[6, 2], [8, 2], [8, 4], [6, 4], [6, 2]], 2), // island
      coast([[1, 2], [1, 4], [2, 4], [2, 2], [1, 2]], 3), // clockwise marine hole
    ], box)!;
    expect(mask).toBeDefined();
    expect(booleanPointInPolygon(point([1.5, 3]), mask)).toBe(false);
    expect(booleanPointInPolygon(point([1, 8]), mask)).toBe(true);
    expect(booleanPointInPolygon(point([7, 3]), mask)).toBe(true);
    expect(booleanPointInPolygon(point([9, 8]), mask)).toBe(false);
  });

  it.each([
    [],
    [coast([[5, 1], [5, 9]])],
    [coast([[5, -1], [5, 5]]), coast([[5, 11], [5, 5]], 2)],
    [{ type: 'way', id: 1, tags: { natural: 'coastline' }, nodes: [1, 2] } as OsmElement],
  ].map(elements => ({ elements })))('warns and retains the original area for absent/incomplete/invalid coastline', ({ elements }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(coastalLandMask(elements, box)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/coastline.*(query area|query extent)/i));
  });
});
