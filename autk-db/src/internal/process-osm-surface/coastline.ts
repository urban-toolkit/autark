import { booleanPointInPolygon, featureCollection, lineString, polygonize } from '@turf/turf';
import type { MultiPolygon, Position } from 'geojson';
import type { OsmElement } from '../../use-cases/load-osm-overpass/interfaces';

/** Builds land inside a WGS84 extent. Undefined means retain the original area mask. */
export function coastalLandMask(
  elements: OsmElement[],
  box: { west: number; south: number; east: number; north: number },
): MultiPolygon | undefined {
  const coastlines = elements.filter(element => element.type === 'way' && element.tags?.natural === 'coastline');
  if (coastlines.length === 0) {
    console.warn('[autk-db] No coastline available; surface uses the full query area (land and sea are not distinguished).');
    return undefined;
  }
  try {
    // Quantize only the mask network, never thematic/building coordinates. This also
    // joins independently clipped intersections at the rectangle's corners/edges.
    const scale = 1e10;
    const snap = (point: Position): Position => point.map(value => Math.round(value * scale) / scale);
    const key = (point: Position): string => point.join(',');
    const [west, south] = snap([box.west, box.south]);
    const [east, north] = snap([box.east, box.north]);
    if (west >= east || south >= north) throw new Error('extent too small to reconstruct coastline');
    const onBoundary = (point: Position): boolean => point[0] === west || point[0] === east || point[1] === south || point[1] === north;
    const nodes = new Map(elements.filter(element => element.type === 'node').map(element => [element.id, element]));
    const segments: Position[][] = [];
    const directed = new Map<string, boolean>();
    const degrees = new Map<string, { incoming: number; outgoing: number; point: Position }>();
    for (const way of coastlines) {
      const coordinates = way.geometry?.map(point => [point.lon, point.lat])
        ?? way.nodes?.map(id => { const node = nodes.get(id); return [node?.lon, node?.lat]; });
      if (!coordinates || coordinates.length < 2 || (way.nodes && coordinates.length !== way.nodes.length)
        || coordinates.some(point => point.some(value => !Number.isFinite(value)))) {
        throw new Error(`coastline way ${way.id} has missing coordinates`);
      }
      for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1] as Position;
        const b = coordinates[i] as Position;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        if (dx === 0 && dy === 0) continue;
        // Liang–Barsky segment clipping retains the original OSM direction (land left).
        let start = 0, end = 1;
        const p = [-dx, dx, -dy, dy];
        const q = [a[0] - west, east - a[0], a[1] - south, north - a[1]];
        for (let edge = 0; edge < 4; edge++) {
          if (p[edge] === 0) { if (q[edge] < 0) end = -1; }
          else if (p[edge] < 0) start = Math.max(start, q[edge] / p[edge]);
          else end = Math.min(end, q[edge] / p[edge]);
        }
        if (start >= end) continue;
        const from = snap([a[0] + start * dx, a[1] + start * dy]);
        const to = snap([a[0] + end * dx, a[1] + end * dy]);
        if (key(from) === key(to)) continue;
        // Coincident coastline/extent edges are ambiguous; use the documented fallback.
        if ((from[0] === to[0] && (from[0] === west || from[0] === east))
          || (from[1] === to[1] && (from[1] === south || from[1] === north))) {
          throw new Error('coastline coincides with query extent');
        }
        const forward = `${key(from)}|${key(to)}`, reverse = `${key(to)}|${key(from)}`;
        if (directed.has(forward) || directed.has(reverse)) throw new Error('duplicate or conflicting coastline segment');
        directed.set(forward, true);
        directed.set(reverse, false);
        segments.push([from, to]);
        for (const [point, direction] of [[from, 'outgoing'], [to, 'incoming']] as const) {
          const id = key(point);
          if (!degrees.has(id)) degrees.set(id, { incoming: 0, outgoing: 0, point });
          degrees.get(id)![direction]++;
        }
      }
    }
    if (segments.length === 0) throw new Error('no coastline segments intersect the query extent');
    for (const { point, incoming, outgoing } of degrees.values()) {
      if (incoming > 1 || outgoing > 1 || (!onBoundary(point) && (incoming !== 1 || outgoing !== 1))) {
        throw new Error('incomplete or branching coastline inside query extent');
      }
    }
    const corners = [[west, south], [east, south], [east, north], [west, north], [west, south]];
    const network = [...segments];
    for (let edge = 1; edge < corners.length; edge++) {
      const a = corners[edge - 1], b = corners[edge];
      const axis = a[0] === b[0] ? 1 : 0;
      const points = [a, b, ...[...degrees.values()].map(value => value.point).filter(point =>
        point[1 - axis] === a[1 - axis] && point[axis] >= Math.min(a[axis], b[axis]) && point[axis] <= Math.max(a[axis], b[axis]))];
      const unique = [...new Map(points.map(point => [key(point), point])).values()].sort((x, y) => x[axis] - y[axis]);
      for (let i = 1; i < unique.length; i++) network.push([unique[i - 1], unique[i]]);
    }
    const polygons = polygonize(featureCollection(network.map(segment => lineString(segment))));
    // Turf returns disconnected nested rings separately (sometimes twice, with
    // opposite winding), not as holes. Build bounded faces using immediate children.
    const uniqueRings = new Map<string, Position[]>();
    for (const polygon of polygons.features) {
      for (const ring of polygon.geometry.coordinates) {
        const edges = ring.slice(1).map((point, i) => [key(ring[i]), key(point)].sort().join('|')).sort().join(';');
        uniqueRings.set(edges, ring);
      }
    }
    const rings = [...uniqueRings.values()];
    const areas = rings.map(ring => Math.abs(ring.slice(1).reduce((sum, point, i) => sum
      + (ring[i][0] - ring[0][0]) * (point[1] - ring[0][1])
      - (point[0] - ring[0][0]) * (ring[i][1] - ring[0][1]), 0)));
    const parents = rings.map((ring, index) => {
      let parent = -1;
      rings.forEach((candidate, other) => {
        if (areas[other] > areas[index] && (parent === -1 || areas[other] < areas[parent])
          && booleanPointInPolygon(ring[0], { type: 'Polygon', coordinates: [candidate] }, { ignoreBoundary: true })) parent = other;
      });
      return parent;
    });
    const land: MultiPolygon = { type: 'MultiPolygon', coordinates: [] };
    let classifiedEdges = 0;
    for (let face = 0; face < rings.length; face++) {
      const coordinates = [rings[face], ...rings.filter((_, index) => parents[index] === face)];
      const sides = new Set<boolean>();
      coordinates.forEach((ring, ringIndex) => {
        let signedArea = 0;
        for (let i = 1; i < ring.length; i++) signedArea += (ring[i - 1][0] - ring[0][0]) * (ring[i][1] - ring[0][1])
          - (ring[i][0] - ring[0][0]) * (ring[i - 1][1] - ring[0][1]);
        // Outer ring interior follows its winding; hole interior is on the opposite side.
        const interiorLeft = (signedArea > 0) !== (ringIndex > 0);
        for (let i = 1; i < ring.length; i++) {
          const direction = directed.get(`${key(ring[i - 1])}|${key(ring[i])}`);
          if (direction !== undefined) { sides.add(direction === interiorLeft); classifiedEdges++; }
        }
      });
      if (sides.size !== 1) throw new Error('coastline faces cannot be consistently classified as land or sea');
      if (sides.has(true)) land.coordinates.push(coordinates);
    }
    if (rings.length === 0 || classifiedEdges !== segments.length * 2) {
      throw new Error('coastline network has unclosed or unused edges');
    }
    return land;
  } catch (error) {
    console.warn(`[autk-db] Cannot reconstruct coastline surface: ${error instanceof Error ? error.message : String(error)}. Using the full query area instead.`);
    return undefined;
  }
}
