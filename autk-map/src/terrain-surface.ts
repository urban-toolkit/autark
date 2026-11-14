import { Delaunay } from 'd3';
import Constrainautor from '@kninnug/constrainautor';

/** Polygon meshes reused as terrain without replacing their coastline or holes. */
export interface TerrainSurfaceGeometry {
    position: Float32Array;
    indices: Uint32Array;
    skippedVertices: Float32Array;
}

export interface TerrainSurfaceMesh {
    /** Local XY and one unused float, matching the terrain vertex layout. */
    vertices: Float32Array;
    indices: Uint32Array;
    bounds: [number, number, number, number];
    /** Spacing of the interior sampling lattice, also used to filter terrain normals. */
    spacing: number;
}

/** Samples a regular triangular lattice inside the original surface, constraining
 * its coastline and hole edges instead of inheriting the polygon triangulator's fans.
 */
export function buildTerrainSurface(sources: readonly TerrainSurfaceGeometry[], sampleSpacing: number): TerrainSurfaceMesh {
    if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) throw new Error('Terrain surface needs a finite, positive sample spacing.');
    const xy: number[] = [], original: number[] = [];
    const vertices = new Map<string, number>();
    const add = (x: number, y: number): number => {
        x = Math.fround(x); y = Math.fround(y);
        const key = `${x},${y}`;
        let id = vertices.get(key);
        if (id === undefined) { id = xy.length / 2; vertices.set(key, id); xy.push(x, y); }
        return id;
    };
    const cross = (a: number, b: number, c: number) => (xy[b * 2] - xy[a * 2]) * (xy[c * 2 + 1] - xy[a * 2 + 1])
        - (xy[b * 2 + 1] - xy[a * 2 + 1]) * (xy[c * 2] - xy[a * 2]);
    const edges = new Map<string, { a: number; b: number; count: number }>();
    const seen = new Set<string>();
    for (const source of sources) {
        for (let i = 0; i < source.indices.length; i += 3) {
            const ids = [source.indices[i], source.indices[i + 1], source.indices[i + 2]];
            if (ids.some(id => source.skippedVertices[id] > 0.5)) continue;
            if (ids.some(id => !Number.isFinite(source.position[id * 2]) || !Number.isFinite(source.position[id * 2 + 1]))) continue;
            const v = ids.map(id => add(source.position[id * 2], source.position[id * 2 + 1]));
            const area = cross(v[0], v[1], v[2]);
            if (!Number.isFinite(area) || area === 0) continue;
            if (area < 0) [v[1], v[2]] = [v[2], v[1]];
            const key = [...v].sort((a, b) => a - b).join('/');
            if (seen.has(key)) continue;
            seen.add(key); original.push(...v);
            for (let e = 0; e < 3; e++) {
                const a = v[e], b = v[(e + 1) % 3], key = a < b ? `${a}/${b}` : `${b}/${a}`;
                const edge = edges.get(key) ?? { a, b, count: 0 }; edge.count++; edges.set(key, edge);
            }
        }
    }
    if (!original.length) return { vertices: new Float32Array(), indices: new Uint32Array(), bounds: [0, 0, 0, 0], spacing: sampleSpacing };
    const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of original) {
        bounds[0] = Math.min(bounds[0], xy[id * 2]); bounds[2] = Math.max(bounds[2], xy[id * 2]);
        bounds[1] = Math.min(bounds[1], xy[id * 2 + 1]); bounds[3] = Math.max(bounds[3], xy[id * 2 + 1]);
    }
    const span = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
    const spacing = Math.max(sampleSpacing, span / 256);
    const binSize = Math.max(spacing * 8, span / 32);
    const cellX = (x: number) => Math.floor((x - bounds[0]) / binSize);
    const cellY = (y: number) => Math.floor((y - bounds[1]) / binSize);
    const bins = new Map<string, number[]>(), boundaryBins = new Map<string, number[]>();
    const insert = (map: Map<string, number[]>, id: number, minX: number, minY: number, maxX: number, maxY: number) => {
        for (let y = cellY(minY); y <= cellY(maxY); y++) for (let x = cellX(minX); x <= cellX(maxX); x++) {
            const key = `${x},${y}`, list = map.get(key) ?? []; list.push(id); map.set(key, list);
        }
    };
    for (let i = 0; i < original.length; i += 3) {
        const [a, b, c] = original.slice(i, i + 3);
        insert(bins, i, Math.min(xy[a * 2], xy[b * 2], xy[c * 2]), Math.min(xy[a * 2 + 1], xy[b * 2 + 1], xy[c * 2 + 1]),
            Math.max(xy[a * 2], xy[b * 2], xy[c * 2]), Math.max(xy[a * 2 + 1], xy[b * 2 + 1], xy[c * 2 + 1]));
    }
    const inside = (x: number, y: number) => (bins.get(`${cellX(x)},${cellY(y)}`) ?? []).some(i => {
        const a = original[i], b = original[i + 1], c = original[i + 2];
        return (xy[b * 2] - xy[a * 2]) * (y - xy[a * 2 + 1]) - (xy[b * 2 + 1] - xy[a * 2 + 1]) * (x - xy[a * 2]) >= -1e-7
            && (xy[c * 2] - xy[b * 2]) * (y - xy[b * 2 + 1]) - (xy[c * 2 + 1] - xy[b * 2 + 1]) * (x - xy[b * 2]) >= -1e-7
            && (xy[a * 2] - xy[c * 2]) * (y - xy[c * 2 + 1]) - (xy[a * 2 + 1] - xy[c * 2 + 1]) * (x - xy[c * 2]) >= -1e-7;
    });
    const boundary = [...edges.values()].filter(edge => edge.count === 1);
    const constraints: [number, number][] = [];
    boundary.forEach(({ a, b }, id) => {
        const ax = xy[a * 2], ay = xy[a * 2 + 1], bx = xy[b * 2], by = xy[b * 2 + 1];
        const margin = spacing / 4;
        insert(boundaryBins, id, Math.min(ax, bx) - margin, Math.min(ay, by) - margin, Math.max(ax, bx) + margin, Math.max(ay, by) + margin);
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / spacing));
        let previous = a;
        for (let k = 1; k <= steps; k++) {
            const next = k === steps ? b : add(ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps);
            if (next !== previous) constraints.push([previous, next]); previous = next;
        }
    });
    const nearBoundary = (x: number, y: number) => (boundaryBins.get(`${cellX(x)},${cellY(y)}`) ?? []).some(id => {
        const { a, b } = boundary[id], ax = xy[a * 2], ay = xy[a * 2 + 1], dx = xy[b * 2] - ax, dy = xy[b * 2 + 1] - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(x - ax - t * dx, y - ay - t * dy) < spacing / 4;
    });
    let row = 0;
    for (let y = bounds[1] + spacing * Math.sqrt(3) / 2; y < bounds[3]; y += spacing * Math.sqrt(3) / 2, row++) {
        for (let x = bounds[0] + spacing * (row % 2 ? 1 : 0.5); x < bounds[2]; x += spacing) {
            if (inside(x, y) && !nearBoundary(x, y)) add(x, y);
        }
    }
    const coordinates = new Float64Array(xy);
    const delaunay = new Delaunay(coordinates);
    const triangulation = { coords: coordinates, triangles: delaunay.triangles, halfedges: delaunay.halfedges, hull: delaunay.hull };
    new Constrainautor(triangulation, constraints);
    const triangles: number[] = [];
    for (let i = 0; i < triangulation.triangles.length; i += 3) {
        const [a, b, c] = triangulation.triangles.subarray(i, i + 3);
        if (!inside((xy[a * 2] + xy[b * 2] + xy[c * 2]) / 3, (xy[a * 2 + 1] + xy[b * 2 + 1] + xy[c * 2 + 1]) / 3)) continue;
        if (cross(a, b, c) > 0) triangles.push(a, b, c); else triangles.push(a, c, b);
    }
    const packed = new Float32Array(xy.length / 2 * 3);
    for (let i = 0; i < xy.length / 2; i++) { packed[i * 3] = xy[i * 2]; packed[i * 3 + 1] = xy[i * 2 + 1]; }
    return { vertices: packed, indices: new Uint32Array(triangles), bounds, spacing };
}
