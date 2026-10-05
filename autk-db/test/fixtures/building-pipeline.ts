import { osmBlockToPbfBlobBytes, type OsmPbfBlock } from '@osmix/pbf';
import type { OsmElement } from '../../src/use-cases/load-osm-overpass/interfaces';
import continentalCenter from './continental-center.json';

export const continentalElements = continentalCenter.elements as OsmElement[];

// A triangular surface distinguishes polygon clipping from its rectangular bbox.
// 10/20 overlap; 30 crosses the surface/bbox; 40 is outside the surface but inside
// its bbox; 50 is entirely outside the bbox.
const ways: Array<{ id: number; start: number; coordinates: number[][]; tags: Record<string, string> }> = [
  { id: 800, start: 700, coordinates: [[0, 0], [10, 0], [0, 10]], tags: {} },
  { id: 10, start: 100, coordinates: [[1, 1], [4, 1], [4, 4], [1, 4]], tags: { 'building:part': 'yes', height: '12' } },
  { id: 20, start: 200, coordinates: [[3, 1], [6, 1], [6, 4], [3, 4]], tags: { 'building:part': 'yes', height: '25' } },
  { id: 30, start: 300, coordinates: [[7, 1], [11, 1], [11, 2], [7, 2]], tags: { building: 'yes', height: '8' } },
  { id: 40, start: 400, coordinates: [[8, 8], [9, 8], [9, 9], [8, 9]], tags: { building: 'yes', height: '9' } },
  { id: 50, start: 500, coordinates: [[20, 20], [21, 20], [21, 21], [20, 21]], tags: { building: 'yes', height: '10' } },
];

export const syntheticElements: OsmElement[] = [
  { type: 'relation', id: 900, tags: { name: 'Test District', type: 'boundary', boundary: 'administrative' },
    members: [{ type: 'way', ref: 800, role: 'outer' }] },
  ...ways.map(way => ({ type: 'way' as const, id: way.id, tags: way.tags,
    nodes: [...way.coordinates.map((_, i) => way.start + i), way.start] })),
  ...ways.flatMap(way => way.coordinates.map(([lon, lat], i) => ({ type: 'node' as const, id: way.start + i, lon, lat }))),
];

// Same real relation, with a small administrative boundary enclosing its members.
export const continentalWithBoundary: OsmElement[] = [
  { type: 'relation', id: 900, tags: { name: 'Test District', type: 'boundary', boundary: 'administrative' },
    members: [{ type: 'way', ref: 800, role: 'outer' }] },
  { type: 'way', id: 800, nodes: [700, 701, 702, 703, 700] },
  ...[[-74.006, 40.704], [-74.004, 40.704], [-74.004, 40.706], [-74.006, 40.706]]
    .map(([lon, lat], i) => ({ type: 'node' as const, id: 700 + i, lon, lat })),
  ...continentalElements,
];

/** Encodes small fixtures as real compressed PBF bytes; no parser/stream mocks. */
export async function encodeBuildingPbf(elements: OsmElement[]): Promise<Uint8Array> {
  const strings = ['', ...new Set(elements.flatMap(element => [
    ...Object.entries(element.tags ?? {}).flat(),
    ...(element.members ?? []).map(member => member.role ?? ''),
  ]).filter(Boolean))];
  const block: OsmPbfBlock = {
    stringtable: strings.map(value => new TextEncoder().encode(value)),
    primitivegroup: [{
      nodes: elements.filter(element => element.type === 'node').map(element => ({
        id: element.id, keys: Object.keys(element.tags ?? {}).map(key => strings.indexOf(key)),
        vals: Object.values(element.tags ?? {}).map(value => strings.indexOf(value)),
        lat: Math.round(element.lat! * 1e7), lon: Math.round(element.lon! * 1e7),
      })),
      ways: elements.filter(element => element.type === 'way').map(element => ({
        id: element.id, keys: Object.keys(element.tags ?? {}).map(key => strings.indexOf(key)),
        vals: Object.values(element.tags ?? {}).map(value => strings.indexOf(value)),
        refs: (element.nodes ?? []).map((ref, i, refs) => ref - (refs[i - 1] ?? 0)),
      })),
      relations: elements.filter(element => element.type === 'relation').map(element => ({
        id: element.id, keys: Object.keys(element.tags ?? {}).map(key => strings.indexOf(key)),
        vals: Object.values(element.tags ?? {}).map(value => strings.indexOf(value)),
        memids: (element.members ?? []).map((member, i, members) => member.ref - (members[i - 1]?.ref ?? 0)),
        roles_sid: (element.members ?? []).map(member => strings.indexOf(member.role ?? '')),
        types: (element.members ?? []).map(member => ['node', 'way', 'relation'].indexOf(member.type)),
      })),
    }],
  };
  const header = await osmBlockToPbfBlobBytes({ required_features: ['OsmSchema-V0.6'], optional_features: [] });
  const body = await osmBlockToPbfBlobBytes(block);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return bytes;
}
