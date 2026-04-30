/**
 * @module triangulator-roofs
 * Roof geometry generation for OSM building footprints.
 *
 * This module turns footprint rings plus OSM roof tags into mesh buffers for
 * walls, floors, flat caps, and several roof styles. It supports direct cap
 * generation for flat, cone/pyramid, dome, round, and skillion roofs, and uses an
 * iterative straight-skeleton solve for hipped, gabled, half-hipped, mansard,
 * and saltbox roofs. When the skeleton solve cannot complete, callers fall
 * back to a flat roof cap.
 */

import earcut from "earcut";

import { GeoJsonProperties } from "geojson";

import { 
    computeRingArea, 
    isConvex, 
    normalizeRing, 
    polygonPerimeter 
} from './utils-geometry';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Local 2D point representation used by roof geometry helpers. */
type Vec2 = [number, number];

/**
 * Flat mesh buffers produced by roof and wall triangulation helpers.
 */
export interface MeshData {
    /** Flat vertex position buffer packed as consecutive XYZ triples. */
    flatCoords: number[];
    /** Triangle index buffer referencing vertices in `flatCoords`. */
    flatIds: number[];
}

/**
 * Parsed OSM roof attributes used to select and parameterize roof generation.
 *
 * `shape` drives the roof generator selection, while `height`, `angle`, and
 * `direction` provide the numeric parameters used by the active roof style.
 */
export interface RoofInfo {
    /** Roof shape identifier derived from `roof:shape`. */
    shape: string;
    /** Explicit roof height above wall top (0 = derive from angle/geometry). */
    height: number;
    /** Roof pitch angle in degrees. */
    angle: number;
    /** Compass bearing of the downslope direction (0 = N, 90 = E). Skillion only. */
    direction: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default roof pitch angle used when no explicit OSM roof angle is provided. */
const DEFAULT_ROOF_ANGLE = 30;
/** Merge tolerance used when collapsing nearly coincident skeleton vertices. */
const MERGE_EPS = 0.05; // 5 cm to aggressively merge coincident vertices
/** Maximum allowed straight-skeleton bisector speed before treating the solve as unstable. */
const MAX_BISECTOR_SPEED = 10.0;

// ─── Polygon helpers ──────────────────────────────────────────────────────────

/**
 * Estimates roof height from a footprint and pitch angle.
 *
 * The height estimate uses the footprint inradius approximation `2A / P` and
 * converts the pitch angle into a vertical rise above the wall top.
 *
 * @param ring - Open roof footprint ring in local planar coordinates.
 * @param angleDeg - Roof pitch angle in degrees.
 * @returns Estimated roof height above the wall top.
 */
function heightFromAngle(ring: Vec2[], angleDeg: number): number {
    const area = Math.abs(computeRingArea(ring));
    const perim = polygonPerimeter(ring);
    return perim > 1e-9 ? (2 * area / perim) * Math.tan((angleDeg * Math.PI) / 180) : 0;
}

// ─── Wall generation ──────────────────────────────────────────────────────────

/**
 * Generates vertical wall quads for a footprint between two elevations.
 *
 * `rings[0]` is treated as the outer footprint (CCW) and subsequent rings are
 * hole boundaries (CW). Each ring segment becomes one outward-facing quad
 * strip with CCW winding for correct face normals.
 *
 * @param rings - Polygon rings in local planar coordinates.
 * @param minH - Wall base elevation.
 * @param maxH - Wall top elevation.
 * @returns Wall mesh buffers for all ring segments.
 * @throws Never throws. Returns empty buffers for empty or degenerate rings.
 * @example
 * const walls = buildWalls([[[0, 0], [10, 0], [10, 5], [0, 5]]], 0, 20);
 * // walls.flatIds.length / 3 → 8 (4 quads × 2 triangles)
 */
export function buildWalls(rings: Vec2[][], minH: number, maxH: number): MeshData {
    const flatCoords: number[] = [];
    const flatIds: number[] = [];

    for (let ri = 0; ri < rings.length; ri++) {
        // Outer ring must be CCW (outward normals); inner rings (holes) must be CW.
        let open = normalizeRing(rings[ri]) as Vec2[];
        const area = computeRingArea(open);
        if (ri === 0 && area < 0) open = [...open].reverse();
        if (ri > 0 && area > 0) open = [...open].reverse();
        const n = open.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const [x0, y0] = open[i];
            const [x1, y1] = open[j];
            const base = flatCoords.length / 3;
            // v0=BL, v1=BR, v2=TR, v3=TL
            flatCoords.push(
                x0, y0, minH,
                x1, y1, minH,
                x1, y1, maxH,
                x0, y0, maxH,
            );
            // Two triangles, CCW winding gives outward face normals for CCW outer rings.
            flatIds.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    }

    return { flatCoords, flatIds };
}

// ─── Flat roof ────────────────────────────────────────────────────────────────

/**
 * Builds a flat triangulated roof cap, including hole support.
 *
 * The cap follows the full footprint at a constant Z elevation. The outer
 * ring is enforced to CCW winding so earcut produces upward-facing triangles;
 * holes are preserved via hole-start offsets.
 *
 * @param rings - Polygon rings in local planar coordinates.
 * @param height - Z elevation of the flat roof plane.
 * @returns Triangulated roof-cap mesh buffers.
 * @throws Never throws. Degenerate rings produce empty or degenerate mesh buffers.
 * @example
 * const cap = flatRoof([[[0, 0], [10, 0], [10, 10], [0, 10]]], 25);
 * // cap is a triangulated quad at z=25
 */
export function flatRoof(rings: Vec2[][], height: number): MeshData {
    let outer = normalizeRing(rings[0]) as Vec2[];
    // Enforce CCW so earcut produces outward-facing (upward) triangles.
    if (computeRingArea(outer) < 0) outer = [...outer].reverse();
    const allVerts: Vec2[] = [...outer];
    const holeStarts: number[] = [];
    for (let i = 1; i < rings.length; i++) {
        holeStarts.push(allVerts.length);
        allVerts.push(...(normalizeRing(rings[i]) as Vec2[]));
    }
    const flat2D = allVerts.flatMap(v => v);
    const triIds = earcut(flat2D, holeStarts.length > 0 ? holeStarts : undefined);
    const flatCoords = allVerts.flatMap(([x, y]) => [x, y, height]);
    return { flatCoords, flatIds: triIds };
}

/**
 * Builds a flat downward-facing floor cap for floating building parts.
 *
 * The floor uses the same footprint topology as the roof cap but enforces CW
 * winding on the outer ring so earcut produces downward-facing (-Z) triangles.
 * Holes are reversed to CCW for correct punch-through.
 *
 * @param rings - Polygon rings in local planar coordinates.
 * @param height - Z elevation of the floor plane.
 * @returns Triangulated floor-cap mesh buffers.
 * @throws Never throws. Degenerate rings produce empty or degenerate mesh buffers.
 * @example
 * const floor = flatFloor([[[0, 0], [10, 0], [10, 10], [0, 10]]], 5);
 * // floor is a triangulated quad at z=5 facing downward
 */
export function flatFloor(rings: Vec2[][], height: number): MeshData {
    let outer = normalizeRing(rings[0]) as Vec2[];
    // Enforce CW so earcut produces downward-facing (-Z) triangles.
    if (computeRingArea(outer) > 0) outer = [...outer].reverse();
    const allVerts: Vec2[] = [...outer];
    const holeStarts: number[] = [];
    for (let i = 1; i < rings.length; i++) {
        holeStarts.push(allVerts.length);
        // Holes inside CW outer ring must be CCW to punch correctly in earcut.
        let hole = normalizeRing(rings[i]) as Vec2[];
        if (computeRingArea(hole) < 0) hole = [...hole].reverse();
        allVerts.push(...hole);
    }
    const flat2D = allVerts.flatMap(v => v);
    const triIds = earcut(flat2D, holeStarts.length > 0 ? holeStarts : undefined);
    const flatCoords = allVerts.flatMap(([x, y]) => [x, y, height]);
    return { flatCoords, flatIds: triIds };
}

// ─── Pyramid roof ─────────────────────────────────────────────────────────────

/**
 * Builds a pyramid (cone) roof by fan-triangulating the outer footprint to an apex.
 *
 * Only the outer ring is used; holes are ignored. The apex is placed at the
 * centroid of the footprint. Each edge becomes a triangle fan segment.
 *
 * @param ring - Outer roof footprint ring in local planar coordinates.
 * @param baseH - Wall top elevation.
 * @param roofH - Additional height of the roof apex above `baseH`.
 * @returns Triangulated pyramid-roof mesh buffers.
 * @throws Never throws. Rings with fewer than 3 vertices produce empty buffers.
 * @example
 * const roof = pyramidRoof([[0, 0], [10, 0], [10, 10], [0, 10]], 20, 5);
 * // roof is a fan of 4 triangles meeting at the centroid at z=25
 */
export function pyramidRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = normalizeRing(ring) as Vec2[];
    // Enforce CCW so all face normals point outward.
    if (computeRingArea(open) < 0) open = [...open].reverse();
    const n = open.length;
    const cx = open.reduce((s, v) => s + v[0], 0) / n;
    const cy = open.reduce((s, v) => s + v[1], 0) / n;

    const flatCoords: number[] = [];
    const flatIds: number[] = [];

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const base = flatCoords.length / 3;
        
        flatCoords.push(
            open[i][0], open[i][1], baseH,
            open[j][0], open[j][1], baseH,
            cx, cy, baseH + roofH
        );
        
        flatIds.push(base, base + 1, base + 2);
    }

    return { flatCoords, flatIds };
}

// ─── Dome roof ────────────────────────────────────────────────────────────────

/**
 * Builds a tessellated curved dome roof with 4 latitude bands.
 *
 * The outer footprint is progressively shrunk toward the center using a
 * cosine/sine profile, creating a hemispherical shell. The supplied roof
 * height sets the apex above `baseH`.
 *
 * @param ring - Outer roof footprint ring in local planar coordinates.
 * @param baseH - Wall top elevation.
 * @param roofH - Additional dome height above `baseH`.
 * @returns Tessellated dome-roof mesh buffers.
 * @throws Never throws. Rings with fewer than 3 vertices produce empty buffers.
 * @example
 * const dome = domeRoof([[0, 0], [10, 0], [10, 10], [0, 10]], 20, 8);
 * // dome is a tessellated hemisphere cap
 */
export function domeRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = normalizeRing(ring) as Vec2[];
    if (computeRingArea(open) < 0) open = [...open].reverse();
    const n = open.length;
    const cx = open.reduce((s, v) => s + v[0], 0) / n;
    const cy = open.reduce((s, v) => s + v[1], 0) / n;

    const flatCoords: number[] = [];
    const flatIds: number[] = [];

    const numLatitudes = 4;
    
    const rings3D: [number, number, number][][] = [];
    for (let k = 0; k <= numLatitudes; k++) {
        const alpha = (k / numLatitudes) * (Math.PI / 2);
        const cosA = Math.cos(alpha);
        const sinA = Math.sin(alpha);
        
        const currentRing: [number, number, number][] = [];
        if (k === numLatitudes) {
            currentRing.push([cx, cy, baseH + roofH]);
        } else {
            for (let i = 0; i < n; i++) {
                const vx = cx + (open[i][0] - cx) * cosA;
                const vy = cy + (open[i][1] - cy) * cosA;
                const vz = baseH + roofH * sinA;
                currentRing.push([vx, vy, vz]);
            }
        }
        rings3D.push(currentRing);
    }
    
    for (let k = 0; k < numLatitudes; k++) {
        const bottomRing = rings3D[k];
        const topRing = rings3D[k + 1];
        
        if (k === numLatitudes - 1) {
            const apex = topRing[0];
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const base = flatCoords.length / 3;
                flatCoords.push(
                    bottomRing[i][0], bottomRing[i][1], bottomRing[i][2],
                    bottomRing[j][0], bottomRing[j][1], bottomRing[j][2],
                    apex[0], apex[1], apex[2]
                );
                flatIds.push(base, base + 1, base + 2);
            }
        } else {
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const base = flatCoords.length / 3;
                
                flatCoords.push(
                    bottomRing[i][0], bottomRing[i][1], bottomRing[i][2],
                    bottomRing[j][0], bottomRing[j][1], bottomRing[j][2],
                    topRing[j][0], topRing[j][1], topRing[j][2],
                    
                    topRing[j][0], topRing[j][1], topRing[j][2],
                    topRing[i][0], topRing[i][1], topRing[i][2],
                    bottomRing[i][0], bottomRing[i][1], bottomRing[i][2]
                );
                flatIds.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
            }
        }
    }

    return { flatCoords, flatIds };
}

// ─── Round roof ───────────────────────────────────────────────────────────────

/**
 * Subdivides each triangle in a mesh into four smaller triangles.
 *
 * Shared edge midpoints are cached so adjacent triangles reuse the same new
 * vertex instead of duplicating it.
 *
 * @param flatCoords - Input flat XYZ coordinate buffer.
 * @param flatIds - Input triangle index buffer.
 * @returns Refined mesh buffers with subdivided triangles.
 */
function subdivideMesh(flatCoords: number[], flatIds: number[]): { flatCoords: number[], flatIds: number[] } {
    const nextCoords = [...flatCoords];
    const nextIds: number[] = [];
    const edgeCache = new Map<string, number>();

    /**
     * Returns the index of the midpoint vertex between two mesh vertices.
     *
     * Midpoints are cached per undirected edge so repeated requests return the
     * same vertex index.
     *
     * @param i1 - First vertex index.
     * @param i2 - Second vertex index.
     * @returns Index of the midpoint vertex in `nextCoords`.
     */
    function getMidpoint(i1: number, i2: number): number {
        const minI = Math.min(i1, i2);
        const maxI = Math.max(i1, i2);
        const key = `${minI}_${maxI}`;
        if (edgeCache.has(key)) return edgeCache.get(key)!;

        const x = (flatCoords[i1 * 3] + flatCoords[i2 * 3]) / 2;
        const y = (flatCoords[i1 * 3 + 1] + flatCoords[i2 * 3 + 1]) / 2;
        const z = (flatCoords[i1 * 3 + 2] + flatCoords[i2 * 3 + 2]) / 2;
        const idx = nextCoords.length / 3;
        nextCoords.push(x, y, z);
        edgeCache.set(key, idx);
        return idx;
    }

    for (let i = 0; i < flatIds.length; i += 3) {
        const i0 = flatIds[i];
        const i1 = flatIds[i + 1];
        const i2 = flatIds[i + 2];

        const m01 = getMidpoint(i0, i1);
        const m12 = getMidpoint(i1, i2);
        const m20 = getMidpoint(i2, i0);

        nextIds.push(
            i0, m01, m20,
            i1, m12, m01,
            i2, m20, m12,
            m01, m12, m20
        );
    }

    return { flatCoords: nextCoords, flatIds: nextIds };
}

/**
 * Builds a half-cylinder (barrel vault) roof.
 *
 * The longest footprint edge defines the barrel axis; the footprint is then
 * projected into a rounded profile using 3 levels of subdivision. Boundary
 * edges without a neighbor are capped with vertical skirt quads.
 *
 * @param ring - Outer roof footprint ring in local planar coordinates.
 * @param baseH - Wall top elevation.
 * @param roofH - Additional roof height above `baseH`.
 * @returns Barrel-vault roof mesh buffers including skirt geometry.
 * @throws Never throws. Degenerate footprints produce empty or minimal buffers.
 * @example
 * const barrel = roundRoof([[0, 0], [20, 0], [20, 8], [0, 8]], 15, 4);
 * // barrel is a subdivided half-cylinder + skirt caps
 */
export function roundRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = normalizeRing(ring) as Vec2[];
    if (computeRingArea(open) < 0) open = [...open].reverse();
    
    let maxLen = 0;
    let dx = 1, dy = 0;
    const n = open.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = open[j][0] - open[i][0];
        const ey = open[j][1] - open[i][1];
        const len = Math.sqrt(ex * ex + ey * ey);
        if (len > maxLen) {
            maxLen = len;
            dx = ex / len;
            dy = ey / len;
        }
    }
    
    // Transverse axis
    const tx = -dy;
    const ty = dx;
    
    const projs = open.map(([x, y]) => x * tx + y * ty);
    const minT = Math.min(...projs);
    const maxT = Math.max(...projs);
    const centerT = (minT + maxT) / 2;
    const radiusT = (maxT - minT) / 2;

    const flat2D = open.flatMap(v => v);
    let triIds = earcut(flat2D);
    let flatCoords = open.flatMap(([x, y]) => [x, y, baseH]);
    
    let mesh = { flatCoords, flatIds: triIds };
    
    // Subdivide mesh (3 iterations = 64 triangles per original triangle)
    mesh = subdivideMesh(mesh.flatCoords, mesh.flatIds);
    mesh = subdivideMesh(mesh.flatCoords, mesh.flatIds);
    mesh = subdivideMesh(mesh.flatCoords, mesh.flatIds);
    
    for (let i = 0; i < mesh.flatCoords.length; i += 3) {
        const x = mesh.flatCoords[i];
        const y = mesh.flatCoords[i + 1];
        const t = x * tx + y * ty;
        let norm = radiusT > 1e-5 ? (t - centerT) / radiusT : 0;
        norm = Math.max(-1, Math.min(1, norm));
        mesh.flatCoords[i + 2] = baseH + roofH * Math.sqrt(1 - norm * norm);
    }
    
    const edgeCounts = new Map<string, number>();
    for (let i = 0; i < mesh.flatIds.length; i += 3) {
        for (let j = 0; j < 3; j++) {
            const v1 = mesh.flatIds[i + j];
            const v2 = mesh.flatIds[i + ((j + 1) % 3)];
            const minV = Math.min(v1, v2);
            const maxV = Math.max(v1, v2);
            const key = `${minV}_${maxV}`;
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        }
    }
    
    const outCoords: number[] = [];
    const outIds: number[] = [];
    
    // Unroll cap
    for (let i = 0; i < mesh.flatIds.length; i += 3) {
        const i0 = mesh.flatIds[i] * 3;
        const i1 = mesh.flatIds[i + 1] * 3;
        const i2 = mesh.flatIds[i + 2] * 3;
        
        const base = outCoords.length / 3;
        outCoords.push(
            mesh.flatCoords[i0], mesh.flatCoords[i0 + 1], mesh.flatCoords[i0 + 2],
            mesh.flatCoords[i1], mesh.flatCoords[i1 + 1], mesh.flatCoords[i1 + 2],
            mesh.flatCoords[i2], mesh.flatCoords[i2 + 1], mesh.flatCoords[i2 + 2]
        );
        outIds.push(base, base + 1, base + 2);
    }
    
    // Unroll skirt
    for (let i = 0; i < mesh.flatIds.length; i += 3) {
        for (let j = 0; j < 3; j++) {
            const v1 = mesh.flatIds[i + j];
            const v2 = mesh.flatIds[i + ((j + 1) % 3)];
            const minV = Math.min(v1, v2);
            const maxV = Math.max(v1, v2);
            if (edgeCounts.get(`${minV}_${maxV}`) === 1) {
                const x1 = mesh.flatCoords[v1 * 3];
                const y1 = mesh.flatCoords[v1 * 3 + 1];
                const z1 = mesh.flatCoords[v1 * 3 + 2];
                const x2 = mesh.flatCoords[v2 * 3];
                const y2 = mesh.flatCoords[v2 * 3 + 1];
                const z2 = mesh.flatCoords[v2 * 3 + 2];
                
                // Skip if gap is negligible
                if (z1 - baseH < 1e-5 && z2 - baseH < 1e-5) continue;
                
                const base = outCoords.length / 3;
                outCoords.push(
                    x1, y1, baseH,
                    x2, y2, baseH,
                    x2, y2, z2,
                    x1, y1, z1
                );
                outIds.push(base, base + 1, base + 2, base + 2, base + 3, base);
            }
        }
    }
    
    return { flatCoords: outCoords, flatIds: outIds };
}

// ─── Skillion roof ────────────────────────────────────────────────────────────

/**
 * Builds a single-plane sloped (skillion) roof.
 *
 * `directionDeg` controls the downslope bearing (0° = N, 90° = E). The
 * footprint is lifted into a plane where the upslope end reaches full roof
 * height and the downslope end stays at base elevation. Vertical skirt quads
 * fill any gaps between the base and the elevated edges.
 *
 * @param ring - Outer roof footprint ring in local planar coordinates.
 * @param baseH - Wall top elevation.
 * @param roofH - Additional roof height above `baseH` at the upslope end.
 * @param directionDeg - Compass bearing of the downslope direction (0 = N, 90 = E).
 * @returns Skillion-roof mesh buffers including skirt geometry.
 * @throws Never throws. Degenerate footprints produce empty or minimal buffers.
 * @example
 * const skillion = skillionRoof([[0, 0], [10, 0], [10, 10], [0, 10]], 20, 5, 180);
 * // skillion slopes south; north edge at z=25, south edge at z=20
 */
export function skillionRoof(ring: Vec2[], baseH: number, roofH: number, directionDeg: number): MeshData {
    let open = normalizeRing(ring) as Vec2[];
    if (computeRingArea(open) < 0) open = [...open].reverse();
    const rad = (directionDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = Math.cos(rad);

    const projs = open.map(([x, y]) => x * dx + y * dy);
    const minP = Math.min(...projs);
    const maxP = Math.max(...projs);
    const range = maxP - minP;

    // maxP end is downslope (low elevation); minP end is high.
    const elevs = projs.map(p => range > 1e-9 ? ((maxP - p) / range) * roofH : 0);

    const flat2D = open.flatMap(v => v);
    const triIds = earcut(flat2D);
    
    const flatCoords: number[] = [];
    const flatIds: number[] = [];
    
    // Add roof cap (unrolled)
    for (let i = 0; i < triIds.length; i += 3) {
        const i0 = triIds[i];
        const i1 = triIds[i + 1];
        const i2 = triIds[i + 2];
        
        const base = flatCoords.length / 3;
        flatCoords.push(
            open[i0][0], open[i0][1], baseH + elevs[i0],
            open[i1][0], open[i1][1], baseH + elevs[i1],
            open[i2][0], open[i2][1], baseH + elevs[i2]
        );
        flatIds.push(base, base + 1, base + 2);
    }

    // Add walls (skirt) to fill the gap from baseH to baseH + elevs[i]
    const n = open.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const eI = elevs[i];
        const eJ = elevs[j];
        if (eI < 1e-5 && eJ < 1e-5) continue; // no gap to fill on this edge

        const base = flatCoords.length / 3;
        // Vertices: bottom-left(i, base), bottom-right(j, base), top-right(j, roof), top-left(i, roof)
        flatCoords.push(
            open[i][0], open[i][1], baseH,
            open[j][0], open[j][1], baseH,
            open[j][0], open[j][1], baseH + eJ,
            open[i][0], open[i][1], baseH + eI
        );
        // CCW outward normal
        flatIds.push(base, base + 1, base + 2, base + 2, base + 3, base);
    }

    return { flatCoords, flatIds };
}

// ─── Straight skeleton (hipped / gabled) ─────────────────────────────────────

/** Vertex state used during straight-skeleton simulation. */
interface SkelVert {
    /** Current 2D vertex position. */
    pos: Vec2;
    /** Current propagated roof height at this vertex. */
    h: number;
    /** Index of the source edge currently associated with the vertex. */
    edgeIdx: number;
}

/** One straight-skeleton face described as a list of 3D vertices. */
type Face3D = [number, number, number][];

/**
 * Computes inward unit normals for each edge of a CCW polygon.
 *
 * @param pts - CCW polygon vertices.
 * @returns Inward-facing unit normal for each polygon edge.
 */
function inwardNormals(pts: Vec2[]): Vec2[] {
    const n = pts.length;
    return pts.map((_, i) => {
        const j = (i + 1) % n;
        const dx = pts[j][0] - pts[i][0];
        const dy = pts[j][1] - pts[i][1];
        const len = Math.sqrt(dx * dx + dy * dy);
        return len > 1e-10 ? ([-dy / len, dx / len] as Vec2) : ([0, 0] as Vec2);
    });
}

/**
 * Computes vertex velocities from inward edge normals and propagation speeds.
 *
 * @param sv - Current straight-skeleton vertices.
 * @param norms - Inward unit edge normals for the current polygon state.
 * @param speeds - Per-edge propagation speeds.
 * @returns Velocity vector for each skeleton vertex.
 */
function bisectorVelocities(sv: SkelVert[], norms: Vec2[], speeds: number[]): Vec2[] {
    const n = sv.length;
    return sv.map((vert, i) => {
        const prev = (i + n - 1) % n;
        const n1 = norms[prev]; 
        const n2 = norms[i];   
        const s1 = speeds[sv[prev].edgeIdx];
        const s2 = speeds[vert.edgeIdx];

        const cross = n1[0] * n2[1] - n1[1] * n2[0];
        if (Math.abs(cross) > 1e-8) {
            const vx = (s1 * n2[1] - s2 * n1[1]) / cross;
            const vy = (n1[0] * s2 - n2[0] * s1) / cross;
            return [vx, vy] as Vec2;
        }
        return [n2[0] * s2, n2[1] * s2] as Vec2;
    });
}

/**
 * Estimates the time until two moving vertices collapse together.
 *
 * @param pi - First vertex position.
 * @param pj - Second vertex position.
 * @param vi - Velocity of the first vertex.
 * @param vj - Velocity of the second vertex.
 * @returns Estimated collapse time, or `Infinity` when no collapse occurs.
 */
function collapseTime(pi: Vec2, pj: Vec2, vi: Vec2, vj: Vec2): number {
    const dPx = pj[0] - pi[0];
    const dPy = pj[1] - pi[1];
    const dVx = vi[0] - vj[0];
    const dVy = vi[1] - vj[1];
    
    const dot = dPx * dVx + dPy * dVy;
    if (dot <= 1e-8) return Infinity;
    
    const dvl2 = dVx * dVx + dVy * dVy;
    if (dvl2 < 1e-12) return Infinity;
    
    const t = dot / dvl2;
    return t;
}

/**
 * Removes adjacent near-duplicate vertices before skeleton processing begins.
 *
 * @param verts - Initial polygon vertices.
 * @param eps - Merge tolerance.
 * @returns Filtered vertex list with adjacent duplicates removed.
 */
function deduplicateVertsInitial(verts: SkelVert[], eps: number): SkelVert[] {
    const res: SkelVert[] = [];
    const n = verts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = verts[i].pos[0] - verts[j].pos[0];
        const dy = verts[i].pos[1] - verts[j].pos[1];
        if (Math.sqrt(dx * dx + dy * dy) >= eps) {
            res.push(verts[i]);
        }
    }
    return res;
}

/**
 * Classifies polygon edges as gable candidates based on their orientation.
 *
 * @param ring - Open roof footprint ring.
 * @returns Boolean flags indicating which edges behave as gable ends.
 */
function classifyGables(ring: Vec2[]): boolean[] {
    const n = ring.length;
    const edges = ring.map((p, i) => {
        const next = ring[(i + 1) % n];
        const dx = next[0] - p[0];
        const dy = next[1] - p[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        return { dx: dx / len, dy: dy / len, len };
    });
    
    let maxLen = 0;
    let mainDx = 0, mainDy = 0;
    for (const e of edges) {
        if (e.len > maxLen) {
            maxLen = e.len;
            mainDx = e.dx;
            mainDy = e.dy;
        }
    }
    
    return edges.map(e => {
        const dot = Math.abs(e.dx * mainDx + e.dy * mainDy);
        return dot < 0.8;
    });
}

/**
 * Derives straight-skeleton edge speeds from roof-shape metadata.
 *
 * `gabled`, `half-hipped`, and `saltbox` adjust speeds on edges classified as
 * gable ends; other supported skeleton roofs use uniform propagation.
 *
 * @param ring - Open roof footprint ring.
 * @param info - Parsed roof configuration.
 * @returns Per-edge propagation speeds used by the skeleton solver.
 */
function getEdgeSpeeds(ring: Vec2[], info: RoofInfo): number[] {
    const n = ring.length;
    const defaultSpeeds = new Array(n).fill(1.0);
    
    if (info.shape === 'hipped' || info.shape === 'pyramidal' || info.shape === 'pyramid' || info.shape === 'mansard') {
        return defaultSpeeds;
    }

    const isGable = classifyGables(ring);
    
    if (info.shape === 'gabled') {
        return isGable.map(g => g ? 0.0 : 1.0);
    }
    
    if (info.shape === 'half-hipped') {
        return isGable.map(g => g ? 0.3 : 1.0);
    }
    
    if (info.shape === 'saltbox') {
        let eaveCount = 0;
        return isGable.map(g => {
            if (g) return 0.0;
            eaveCount++;
            return eaveCount === 1 ? 1.0 : 2.0;
        });
    }
    
    return defaultSpeeds;
}

/**
 * Builds a straight skeleton for a convex roof footprint.
 *
 * Concave footprints, unstable bisector motion, or geometry that escapes the
 * footprint bounds abort the solve and return an empty result.
 *
 * @param ring - Open convex roof footprint ring.
 * @param speeds - Per-edge propagation speeds.
 * @param maxHCap - Maximum allowed propagated skeleton height.
 * @returns Generated skeleton faces and the maximum skeleton height reached.
 */
function buildStraightSkeleton(
    ring: Vec2[], 
    speeds: number[],
    maxHCap: number
): { faces: Face3D[]; maxH: number } {
    let open = ring;
    if (open.length < 3) return { faces: [], maxH: 0 };
    if (!isConvex(open)) {
        return { faces: [], maxH: 0 };
    }

    const bboxMinX = Math.min(...open.map(v => v[0]));
    const bboxMaxX = Math.max(...open.map(v => v[0]));
    const bboxMinY = Math.min(...open.map(v => v[1]));
    const bboxMaxY = Math.max(...open.map(v => v[1]));
    const bboxPad = MERGE_EPS * 10;

    let initialSv: SkelVert[] = open.map((pos, i) => ({ 
        pos: [...pos] as Vec2, 
        h: 0,
        edgeIdx: i 
    }));
    
    let sv: SkelVert[] = deduplicateVertsInitial(initialSv, MERGE_EPS);

    const faces: Face3D[] = [];
    let maxH = 0;

    for (let iter = 0; iter < 500 && sv.length >= 3; iter++) {
        const pts = sv.map(v => v.pos);
        const norms = inwardNormals(pts);
        const m = sv.length;
        const vels = bisectorVelocities(sv, norms, speeds);

        if (vels.some(v => v[0] * v[0] + v[1] * v[1] > MAX_BISECTOR_SPEED * MAX_BISECTOR_SPEED)) {
            return { faces: [], maxH: 0 };
        }

        let tMin = Infinity;
        for (let i = 0; i < m; i++) {
            const j = (i + 1) % m;
            const t = collapseTime(sv[i].pos, sv[j].pos, vels[i], vels[j]);
            if (t < tMin) tMin = t;
        }

        let capped = false;
        if (tMin !== Infinity && sv[0].h + tMin >= maxHCap) {
            tMin = maxHCap - sv[0].h;
            capped = true;
        } else if (tMin === Infinity) {
            tMin = maxHCap - sv[0].h;
            capped = true;
        }

        if (tMin <= 0) break;

        const newPos: Vec2[] = sv.map((v, i) => [
            v.pos[0] + tMin * vels[i][0],
            v.pos[1] + tMin * vels[i][1],
        ]);
        const newH = sv.map(v => v.h + tMin);
        const localMax = Math.max(...newH);
        if (localMax > maxH) maxH = localMax;

        for (let i = 0; i < m; i++) {
            const j = (i + 1) % m;
            const oldI: [number, number, number] = [sv[i].pos[0], sv[i].pos[1], sv[i].h];
            const oldJ: [number, number, number] = [sv[j].pos[0], sv[j].pos[1], sv[j].h];
            const newI: [number, number, number] = [newPos[i][0], newPos[i][1], newH[i]];
            const newJ: [number, number, number] = [newPos[j][0], newPos[j][1], newH[j]];

            const dx = newPos[i][0] - newPos[j][0];
            const dy = newPos[i][1] - newPos[j][1];
            const collapsed = Math.sqrt(dx * dx + dy * dy) < MERGE_EPS;

            if (collapsed) {
                const mx = (newPos[i][0] + newPos[j][0]) / 2;
                const my = (newPos[i][1] + newPos[j][1]) / 2;
                const mh = (newH[i] + newH[j]) / 2;
                faces.push([oldI, oldJ, [mx, my, mh]]);
            } else {
                faces.push([oldI, oldJ, newJ, newI]);
            }
        }

        for (const [x, y] of newPos) {
            if (x < bboxMinX - bboxPad || x > bboxMaxX + bboxPad ||
                y < bboxMinY - bboxPad || y > bboxMaxY + bboxPad) {
                return { faces: [], maxH: 0 };
            }
        }

        if (capped) {
            const flat2D = newPos.flatMap(v => v);
            const ids = earcut(flat2D);
            for (let i = 0; i < ids.length; i += 3) {
                const a = newPos[ids[i]], b = newPos[ids[i + 1]], c = newPos[ids[i + 2]];
                faces.push([
                    [a[0], a[1], newH[ids[i]]],
                    [b[0], b[1], newH[ids[i + 1]]],
                    [c[0], c[1], newH[ids[i + 2]]],
                ]);
            }
            break;
        }

        const nextSv: SkelVert[] = [];
        for (let i = 0; i < m; i++) {
            const j = (i + 1) % m;
            const dx = newPos[i][0] - newPos[j][0];
            const dy = newPos[i][1] - newPos[j][1];
            if (Math.sqrt(dx * dx + dy * dy) >= MERGE_EPS) {
                nextSv.push({
                    pos: newPos[i],
                    h: newH[i],
                    edgeIdx: sv[i].edgeIdx
                });
            }
        }
        sv = nextSv;
    }

    return { faces, maxH };
}

/**
 * Converts straight-skeleton faces into final roof mesh buffers.
 *
 * The resulting faces are normalized so the tallest skeleton point reaches the
 * requested roof height above `baseH`.
 *
 * @param faces - Skeleton faces expressed as 3D polygons.
 * @param baseH - Wall top elevation.
 * @param roofH - Desired roof height above `baseH`.
 * @param maxSkH - Maximum skeleton height used for height normalization.
 * @returns Roof mesh buffers derived from the skeleton faces.
 */
function skeletonToMesh(faces: Face3D[], baseH: number, roofH: number, maxSkH: number): MeshData {
    const flatCoords: number[] = [];
    const flatIds: number[] = [];
    const scale = maxSkH > 1e-9 ? roofH / maxSkH : 1;

    for (const face of faces) {
        if (face.length < 3) continue;
        
        if (face.length === 3) {
            const base = flatCoords.length / 3;
            flatCoords.push(
                face[0][0], face[0][1], baseH + face[0][2] * scale,
                face[1][0], face[1][1], baseH + face[1][2] * scale,
                face[2][0], face[2][1], baseH + face[2][2] * scale
            );
            flatIds.push(base, base + 1, base + 2);
        } else if (face.length === 4) {
            // Quad → two unrolled triangles
            const base = flatCoords.length / 3;
            flatCoords.push(
                // Tri 1: 0, 1, 2
                face[0][0], face[0][1], baseH + face[0][2] * scale,
                face[1][0], face[1][1], baseH + face[1][2] * scale,
                face[2][0], face[2][1], baseH + face[2][2] * scale,
                // Tri 2: 2, 3, 0
                face[2][0], face[2][1], baseH + face[2][2] * scale,
                face[3][0], face[3][1], baseH + face[3][2] * scale,
                face[0][0], face[0][1], baseH + face[0][2] * scale
            );
            flatIds.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
        } else {
            const flat2D = face.flatMap(([x, y]) => [x, y]);
            const ids = earcut(flat2D);
            for (let i = 0; i < ids.length; i += 3) {
                const i0 = ids[i];
                const i1 = ids[i + 1];
                const i2 = ids[i + 2];
                const base = flatCoords.length / 3;
                flatCoords.push(
                    face[i0][0], face[i0][1], baseH + face[i0][2] * scale,
                    face[i1][0], face[i1][1], baseH + face[i1][2] * scale,
                    face[i2][0], face[i2][1], baseH + face[i2][2] * scale
                );
                flatIds.push(base, base + 1, base + 2);
            }
        }
    }

    return { flatCoords, flatIds };
}

/**
 * Builds hipped, gabled, half-hipped, mansard, and saltbox roofs via straight skeleton.
 *
 * These roof styles use the outer footprint and a straight-skeleton solve to
 * propagate slopes inward. Mansard roofs additionally cap the skeleton height
 * from the footprint inradius. When the solve cannot complete (concave
 * footprint, unstable bisector, or escaped geometry), the function returns
 * `null` so the caller can fall back to a flat cap.
 *
 * @param ring - Outer roof footprint ring in local planar coordinates.
 * @param baseH - Wall top elevation.
 * @param roofH - Desired roof height above `baseH`.
 * @param info - Parsed roof configuration (shape controls gable/speed behavior).
 * @param _allRings - Full polygon rings passed through by the caller (unused).
 * @returns Roof mesh buffers, or `null` when the skeleton solve fails.
 * @throws Never throws. Returns `null` on failure rather than raising.
 * @example
 * const hipped = skeletonRoof(
 *   [[0, 0], [10, 0], [10, 10], [0, 10]],
 *   20, 5,
 *   { shape: 'hipped', height: 0, angle: 30, direction: 0 }
 * );
 * // hipped is a straight-skeleton roof cap, or null if solve fails
 */
export function skeletonRoof(ring: Vec2[], baseH: number, roofH: number, info: RoofInfo, _allRings?: Vec2[][]): MeshData | null {
    let outer = normalizeRing(ring) as Vec2[];
    if (computeRingArea(outer) < 0) outer = [...outer].reverse();
    
    const speeds = getEdgeSpeeds(outer, info);
    
    let maxHCap = Infinity;
    if (info.shape === 'mansard') {
        const area = Math.abs(computeRingArea(outer));
        const perim = polygonPerimeter(outer);
        const inradius = perim > 0 ? (2 * area / perim) : 0;
        maxHCap = inradius * 0.7; 
    }

    const { faces, maxH } = buildStraightSkeleton(outer, speeds, maxHCap);
    if (faces.length === 0) return null;
    return skeletonToMesh(faces, baseH, roofH, maxH);
}

// ─── Property extraction ──────────────────────────────────────────────────────

/**
 * Extracts roof-generation parameters from OSM-style building properties.
 *
 * Missing or unparseable tags fall back to `flat`, zero height, a 30° pitch,
 * and a zero direction. Pitch angle is clamped to [5°, 75°] to prevent
 * degenerate geometry from extreme values. Numeric values are parsed from
 * stringified property values.
 *
 * @param props - GeoJSON properties containing roof-related OSM tags
 * (`roof:shape`, `roof:height`, `roof:angle`, `roof:direction`).
 * @returns Normalized roof configuration with safe defaults applied.
 * @throws Never throws. Always returns a valid `RoofInfo` with fallback values.
 * @example
 * const info = extractRoofInfo({ 'roof:shape': 'gabled', 'roof:angle': '45' });
 * // info → { shape: 'gabled', height: 0, angle: 45, direction: 0 }
 */
export function extractRoofInfo(props: GeoJsonProperties): RoofInfo {
    if (!props) return { shape: 'flat', height: 0, angle: DEFAULT_ROOF_ANGLE, direction: 0 };
    const rawAngle = parseFloat(String(props['roof:angle'] ?? String(DEFAULT_ROOF_ANGLE))) || DEFAULT_ROOF_ANGLE;
    return {
        shape: String(props['roof:shape'] ?? 'flat'),
        height: parseFloat(String(props['roof:height'] ?? '0')) || 0,
        // Clamp pitch angle to [5°, 75°] — prevents tan(90°) → Infinity and degenerate geometry.
        angle: Math.min(75, Math.max(5, rawAngle)),
        direction: parseFloat(String(props['roof:direction'] ?? '0')) || 0,
    };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Builds the complete mesh for one building-part polygon (walls + floor + roof).
 *
 * The footprint first becomes wall geometry, then a floor cap is added when
 * `minH > 0`, and finally the roof style is selected from OSM tags. Flat,
 * cone, pyramidal, pyramid, dome, round, and skillion roofs are generated
 * directly from the outer footprint; hipped, gabled, half-hipped, mansard,
 * and saltbox roofs attempt a straight-skeleton solve and fall back to a flat
 * cap when that solve fails. Roof height comes from `roof:height` when
 * present, otherwise it is derived from `roof:angle` for non-flat roofs and
 * clamped to a steepness equivalent to 60°.
 *
 * @param rings - `[outerRing, ...holes]` coordinates already relative to the origin.
 * @param minH - Bottom of the walls (`min_height`).
 * @param maxH - Top of the walls (`height`).
 * @param props - OSM properties for this building part.
 * @returns Array of mesh chunks (walls, optional floor, roof) to be merged
 * into one `LayerGeometry`.
 * @throws Never throws. Degenerate inputs produce minimal or empty mesh data.
 * @example
 * const meshes = buildBuildingPartMesh(
 *   [[[0, 0], [10, 0], [10, 10], [0, 10]]],
 *   0, 20,
 *   { 'roof:shape': 'pyramid', 'roof:height': '5' }
 * );
 * // meshes.length → 2 (walls + pyramid roof)
 */
export function buildBuildingPartMesh(
    rings: Vec2[][],
    minH: number,
    maxH: number,
    props: GeoJsonProperties,
): MeshData[] {
    const info = extractRoofInfo(props);

    let roofH = info.height;
    if (roofH <= 0 && info.shape !== 'flat') {
        roofH = heightFromAngle(normalizeRing(rings[0]) as Vec2[], info.angle);
    }

    // Cap roof height: a 60° pitch is already very steep; anything beyond that
    // indicates a bad OSM tag (e.g. roof:height set to the building's full height).
    if (info.shape !== 'flat') {
        const maxRoofH = heightFromAngle(normalizeRing(rings[0]) as Vec2[], 60);
        if (maxRoofH > 0 && roofH > maxRoofH) roofH = maxRoofH;
    }

    const outer = normalizeRing(rings[0]) as Vec2[];

    const meshes: MeshData[] = [];
    meshes.push(buildWalls(rings, minH, maxH));

    if (minH > 0) {
        meshes.push(flatFloor(rings, minH));
    }

    let roof: MeshData;

    switch (info.shape) {
        case 'round':
            roof = roundRoof(outer, maxH, roofH);
            break;
        case 'cone':
        case 'pyramidal':
        case 'pyramid':
            roof = pyramidRoof(outer, maxH, roofH);
            break;
        case 'dome':
            roof = domeRoof(outer, maxH, roofH);
            break;
        case 'skillion':
            roof = skillionRoof(outer, maxH, roofH, info.direction);
            break;
        case 'gabled':
        case 'hipped':
        case 'half-hipped':
        case 'mansard':
        case 'saltbox': {
            const result = skeletonRoof(outer, maxH, roofH, info, rings);
            if (result) {
                roof = result;
            } else {
                roof = flatRoof(rings, maxH);
            }
            break;
        }
        case 'flat':
        default:
            roof = flatRoof(rings, maxH);
            break;
    }

    meshes.push(roof);
    return meshes;
}
