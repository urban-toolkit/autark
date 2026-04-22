/**
 * Roof geometry generation for OSM buildings.
 * Supports: flat, pyramidal, skillion, gabled, hipped, dome, round, mansard, saltbox.
 * Hipped and gabled use an iterative straight-skeleton algorithm.
 * Concave polygons fall back to flat.
 * @module triangulator-roofs
 */

import earcut from "earcut";
import { GeoJsonProperties } from "geojson";

// ─── Types ────────────────────────────────────────────────────────────────────

type Vec2 = [number, number];

export interface MeshData {
    flatCoords: number[];
    flatIds: number[];
}

export interface RoofInfo {
    shape: string;
    /** Explicit roof height above wall top (0 = derive from angle/geometry). */
    height: number;
    /** Roof pitch angle in degrees. */
    angle: number;
    /** Compass bearing of the downslope direction (0 = N, 90 = E). Skillion only. */
    direction: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ROOF_ANGLE = 30;
const MERGE_EPS = 0.05; // 5 cm to aggressively merge coincident vertices
const MAX_BISECTOR_SPEED = 10.0;

// ─── Polygon helpers ──────────────────────────────────────────────────────────

/** Remove the closing vertex if present (GeoJSON rings are closed). */
function openRing(ring: Vec2[]): Vec2[] {
    const n = ring.length;
    if (n > 2) {
        const [x0, y0] = ring[0];
        const [xN, yN] = ring[n - 1];
        if (Math.abs(x0 - xN) < 1e-9 && Math.abs(y0 - yN) < 1e-9) return ring.slice(0, n - 1);
    }
    return ring;
}

/** Signed area (positive = CCW in standard y-up math coords). */
function signedArea(ring: Vec2[]): number {
    let a = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    }
    return a / 2;
}

function polygonPerimeter(ring: Vec2[]): number {
    let p = 0;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const dx = ring[i][0] - ring[j][0];
        const dy = ring[i][1] - ring[j][1];
        p += Math.sqrt(dx * dx + dy * dy);
    }
    return p;
}

/**
 * Returns true if the ring is convex (all cross products have the same sign).
 * Assumes the ring is already open (no duplicate closing vertex).
 */
function isConvex(ring: Vec2[]): boolean {
    const n = ring.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const prev = (i + n - 1) % n;
        const next = (i + 1) % n;
        const e1x = ring[i][0] - ring[prev][0];
        const e1y = ring[i][1] - ring[prev][1];
        const e2x = ring[next][0] - ring[i][0];
        const e2y = ring[next][1] - ring[i][1];
        const cross = e1x * e2y - e1y * e2x;
        if (Math.abs(cross) < 1e-10) continue;
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

/** Estimate roof height from the polygon's inradius and the given pitch angle. */
function heightFromAngle(ring: Vec2[], angleDeg: number): number {
    const area = Math.abs(signedArea(ring));
    const perim = polygonPerimeter(ring);
    return perim > 1e-9 ? (2 * area / perim) * Math.tan((angleDeg * Math.PI) / 180) : 0;
}

// ─── Wall generation ──────────────────────────────────────────────────────────

/**
 * Generate vertical quad walls for every ring in `rings` between `minH` and `maxH`.
 * `rings[0]` is the outer ring; subsequent rings are holes.
 */
export function buildWalls(rings: Vec2[][], minH: number, maxH: number): MeshData {
    const flatCoords: number[] = [];
    const flatIds: number[] = [];

    for (let ri = 0; ri < rings.length; ri++) {
        // Outer ring must be CCW (outward normals); inner rings (holes) must be CW.
        let open = openRing(rings[ri]);
        const area = signedArea(open);
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

/** Flat triangulated cap (supports holes). */
export function flatRoof(rings: Vec2[][], height: number): MeshData {
    let outer = openRing(rings[0]);
    // Enforce CCW so earcut produces outward-facing (upward) triangles.
    if (signedArea(outer) < 0) outer = [...outer].reverse();
    const allVerts: Vec2[] = [...outer];
    const holeStarts: number[] = [];
    for (let i = 1; i < rings.length; i++) {
        holeStarts.push(allVerts.length);
        allVerts.push(...openRing(rings[i]));
    }
    const flat2D = allVerts.flatMap(v => v);
    const triIds = earcut(flat2D, holeStarts.length > 0 ? holeStarts : undefined);
    const flatCoords = allVerts.flatMap(([x, y]) => [x, y, height]);
    return { flatCoords, flatIds: triIds };
}

/** Flat downward-facing triangulated floor (supports holes) for floating building parts. */
export function flatFloor(rings: Vec2[][], height: number): MeshData {
    let outer = openRing(rings[0]);
    // Enforce CW so earcut produces downward-facing (-Z) triangles.
    if (signedArea(outer) > 0) outer = [...outer].reverse();
    const allVerts: Vec2[] = [...outer];
    const holeStarts: number[] = [];
    for (let i = 1; i < rings.length; i++) {
        holeStarts.push(allVerts.length);
        // Holes inside CW outer ring must be CCW to punch correctly in earcut.
        let hole = openRing(rings[i]);
        if (signedArea(hole) < 0) hole = [...hole].reverse();
        allVerts.push(...hole);
    }
    const flat2D = allVerts.flatMap(v => v);
    const triIds = earcut(flat2D, holeStarts.length > 0 ? holeStarts : undefined);
    const flatCoords = allVerts.flatMap(([x, y]) => [x, y, height]);
    return { flatCoords, flatIds: triIds };
}

// ─── Pyramid roof ─────────────────────────────────────────────────────────────

/** Fan triangulation from each edge to a central apex. */
export function pyramidRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = openRing(ring);
    // Enforce CCW so all face normals point outward.
    if (signedArea(open) < 0) open = [...open].reverse();
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

/** Tessellated curved dome. */
export function domeRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = openRing(ring);
    if (signedArea(open) < 0) open = [...open].reverse();
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

function subdivideMesh(flatCoords: number[], flatIds: number[]): { flatCoords: number[], flatIds: number[] } {
    const nextCoords = [...flatCoords];
    const nextIds: number[] = [];
    const edgeCache = new Map<string, number>();

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

/** Half-cylinder (barrel vault) roof. */
export function roundRoof(ring: Vec2[], baseH: number, roofH: number): MeshData {
    let open = openRing(ring);
    if (signedArea(open) < 0) open = [...open].reverse();
    
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
 * Single-plane sloped roof.
 * `directionDeg` is the compass bearing of the downslope direction (low end).
 */
export function skillionRoof(ring: Vec2[], baseH: number, roofH: number, directionDeg: number): MeshData {
    let open = openRing(ring);
    if (signedArea(open) < 0) open = [...open].reverse();
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

interface SkelVert {
    pos: Vec2;
    h: number;
    edgeIdx: number;
}

type Face3D = [number, number, number][];

/** Inward unit normals for each edge of a CCW polygon. */
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
 * Bisector velocity at each vertex given edge speeds.
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
 * Hipped (and gabled) roof via straight skeleton.
 * Falls back to a flat cap when the skeleton cannot complete (concave polygon,
 * degenerate velocities, etc.). `allRings` is used for the flat fallback so that
 * courtyard holes are respected — pass `[outerRing, ...holeRings]`.
 */
export function skeletonRoof(ring: Vec2[], baseH: number, roofH: number, info: RoofInfo, _allRings?: Vec2[][]): MeshData | null {
    let outer = openRing(ring);
    if (signedArea(outer) < 0) outer = [...outer].reverse();
    
    const speeds = getEdgeSpeeds(outer, info);
    
    let maxHCap = Infinity;
    if (info.shape === 'mansard') {
        const area = Math.abs(signedArea(outer));
        const perim = polygonPerimeter(outer);
        const inradius = perim > 0 ? (2 * area / perim) : 0;
        maxHCap = inradius * 0.7; 
    }

    const { faces, maxH } = buildStraightSkeleton(outer, speeds, maxHCap);
    if (faces.length === 0) return null;
    return skeletonToMesh(faces, baseH, roofH, maxH);
}

// ─── Property extraction ──────────────────────────────────────────────────────

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
 * Build the complete mesh (walls + roof) for one building part polygon.
 *
 * @param rings    `[outerRing, ...holes]` — coordinates already relative to origin.
 * @param minH     Bottom of the walls (min_height).
 * @param maxH     Top of the walls (height).
 * @param props    OSM properties for this building part.
 * @returns        Array of `MeshData` chunks to be merged into one `LayerGeometry`.
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
        roofH = heightFromAngle(openRing(rings[0]), info.angle);
    }

    // Cap roof height: a 60° pitch is already very steep; anything beyond that
    // indicates a bad OSM tag (e.g. roof:height set to the building's full height).
    if (info.shape !== 'flat') {
        const maxRoofH = heightFromAngle(openRing(rings[0]), 60);
        if (maxRoofH > 0 && roofH > maxRoofH) roofH = maxRoofH;
    }

    const outer = openRing(rings[0]);

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
