import type {
  OsmPbfBlock,
  OsmPbfNode,
  OsmPbfDenseNodes,
  OsmPbfWay,
  OsmPbfRelation,
} from '@osmix/pbf';

import type { OsmElement } from '../load-osm-from-overpass-api/interfaces';

const TEXT_DECODER = new TextDecoder();

/**
 * Converts a `@osmix/pbf` block into an array of `OsmElement` records.
 *
 * Handles all four primitive types:
 * - regular nodes
 * - dense nodes (delta-encoded, compact storage)
 * - ways (with node refs)
 * - relations (with member refs)
 *
 * StringTable indices are resolved to actual tag strings.
 * Way geometry is **not** resolved here — caller must build a node index
 * and call `resolveWayGeometries()` afterwards.
 */
export function blockToElements(block: OsmPbfBlock): OsmElement[] {
  const elements: OsmElement[] = [];
  const st = block.stringtable;
  const str = (sid: number) => TEXT_DECODER.decode(st[sid]);

  for (const group of block.primitivegroup) {
    // Regular nodes
    for (const node of group.nodes ?? []) {
      elements.push(pbfNodeToElement(node, block, str));
    }

    // Dense nodes (compact delta-encoded format)
    if (group.dense) {
      elements.push(...denseNodesToElements(group.dense, block, str));
    }

    // Ways
    for (const way of group.ways ?? []) {
      elements.push(pbfWayToElement(way, block, str));
    }

    // Relations
    for (const rel of group.relations ?? []) {
      elements.push(pbfRelationToElement(rel, block, str));
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Internal converters
// ---------------------------------------------------------------------------

function pbfNodeToElement(
  node: OsmPbfNode,
  block: OsmPbfBlock,
  _str: (sid: number) => string,
): OsmElement {
  return {
    type: 'node',
    id: node.id,
    lat: decodeLat(block, node.lat),
    lon: decodeLon(block, node.lon),
    tags: tagsFromKv(node.keys, node.vals, block, _str),
  };
}

function denseNodesToElements(
  dense: OsmPbfDenseNodes,
  block: OsmPbfBlock,
  str: (sid: number) => string,
): OsmElement[] {
  const elements: OsmElement[] = [];
  const { id, lat, lon, keys_vals } = dense;

  let prevId = 0;
  let prevLat = 0;
  let prevLon = 0;
  let kvIdx = 0;

  for (let i = 0; i < id.length; i++) {
    // Delta decoding
    prevId += id[i];
    prevLat += lat[i];
    prevLon += lon[i];

    // Decode tags from interleaved keys_vals array
    const tags: Record<string, string> = {};
    while (kvIdx < keys_vals.length) {
      const keySid = keys_vals[kvIdx];
      if (keySid === 0) {
        kvIdx++; // skip sentinel
        break;
      }
      const valSid = keys_vals[kvIdx + 1];
      tags[str(keySid)] = str(valSid);
      kvIdx += 2;
    }

    elements.push({
      type: 'node',
      id: prevId,
      lat: decodeLat(block, prevLat),
      lon: decodeLon(block, prevLon),
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }

  return elements;
}

function pbfWayToElement(
  way: OsmPbfWay,
  _block: OsmPbfBlock,
  str: (sid: number) => string,
): OsmElement {
  // Delta-decode refs
  const refs: number[] = [];
  let prevRef = 0;
  for (const ref of way.refs) {
    prevRef += ref;
    refs.push(prevRef);
  }

  return {
    type: 'way',
    id: way.id,
    nodes: refs,
    geometry: undefined, // resolved later by caller
    tags: tagsFromKv(way.keys, way.vals, _block, str),
  };
}

function pbfRelationToElement(
  rel: OsmPbfRelation,
  _block: OsmPbfBlock,
  str: (sid: number) => string,
): OsmElement {
  // Delta-decode member IDs
  const members: OsmElement['members'] = [];
  let prevMemId = 0;
  for (let i = 0; i < rel.memids.length; i++) {
    prevMemId += rel.memids[i];
    const memberType = rel.types[i];
    const typeMap: Record<number, 'node' | 'way' | 'relation'> = {
      0: 'node',
      1: 'way',
      2: 'relation',
    };
    members.push({
      type: typeMap[memberType] ?? 'node',
      ref: prevMemId,
      role: rel.roles_sid[i] !== undefined ? str(rel.roles_sid[i]) : '',
    });
  }

  return {
    type: 'relation',
    id: rel.id,
    members,
    tags: tagsFromKv(rel.keys, rel.vals, _block, str),
  };
}

function tagsFromKv(
  keys: number[],
  vals: number[],
  _block: OsmPbfBlock,
  str: (sid: number) => string,
): Record<string, string> | undefined {
  if (keys.length === 0) return undefined;
  const tags: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    tags[str(keys[i])] = str(vals[i]);
  }
  return tags;
}

function decodeLat(block: OsmPbfBlock, value: number): number {
  return value / (block.granularity ?? 1e7) + (block.lat_offset ?? 0);
}

function decodeLon(block: OsmPbfBlock, value: number): number {
  return value / (block.granularity ?? 1e7) + (block.lon_offset ?? 0);
}

/**
 * Resolves inline `geometry` for every way by looking up node coordinates.
 *
 * Mutates the `elements` array in place — each way that has a non-empty
 * `nodes[]` array gets a matching `geometry[]` array.
 *
 * @returns A `Map<nodeId, {lat, lon}>` for downstream use (e.g. bbox computation).
 */
export function resolveWayGeometries(elements: OsmElement[]): Map<number, { lat: number; lon: number }> {
  const nodeIndex = new Map<number, { lat: number; lon: number }>();

  // Build node index
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodeIndex.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Resolve way geometries
  for (const el of elements) {
    if (el.type === 'way' && el.nodes && el.nodes.length > 0) {
      const geometry: { lat: number; lon: number }[] = [];
      for (const nodeId of el.nodes) {
        const coord = nodeIndex.get(nodeId);
        if (coord) {
          geometry.push(coord);
        }
      }
      if (geometry.length > 0) {
        el.geometry = geometry;
      }
    }
  }

  return nodeIndex;
}
