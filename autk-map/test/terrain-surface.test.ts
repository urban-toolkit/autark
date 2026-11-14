import { describe, expect, it } from 'vitest';
import { buildTerrainSurface } from '../src/terrain-surface';
import type { TerrainSurfaceGeometry } from '../src/terrain-surface';

const source = (position: number[], indices: number[]): TerrainSurfaceGeometry => ({
    position: new Float32Array(position), indices: new Uint32Array(indices), skippedVertices: new Float32Array(position.length / 2),
});

describe('terrain from original surface triangles', () => {
    it('replaces thin polygon fans with well-shaped interior terrain triangles', () => {
        const fan = source([0, 0, 1000, 0, 1000, 1000, 0, 1000, 500, 1], [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
        const mesh = buildTerrainSurface([fan], 50);
        let interior = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const p = [...mesh.indices.subarray(i, i + 3)].map(id => [mesh.vertices[id * 3], mesh.vertices[id * 3 + 1]]);
            if (!p.every(([x, y]) => x > 200 && x < 800 && y > 200 && y < 800)) continue;
            const lengths = p.map((a, k) => Math.hypot(a[0] - p[(k + 1) % 3][0], a[1] - p[(k + 1) % 3][1]));
            for (let k = 0; k < 3; k++) {
                const a = lengths[k], b = lengths[(k + 1) % 3], c = lengths[(k + 2) % 3];
                const angle = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)))) * 180 / Math.PI;
                expect(angle).toBeGreaterThan(30);
            }
            interior++;
        }
        expect(interior).toBeGreaterThan(100);
    });
    it('preserves a coastline and hole while producing a conforming elevation mesh', () => {
        const ring = source([0, 0, 1000, 0, 1000, 1000, 0, 1000, 400, 400, 600, 400, 600, 600, 400, 600],
            [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
        const before = ring.position.slice();
        const mesh = buildTerrainSurface([ring], 80);
        expect(ring.position).toEqual(before);
        expect(mesh.bounds).toEqual([0, 0, 1000, 1000]);
        const edges = new Map<string, { a: number; b: number; count: number }>();
        let area = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const ids = [...mesh.indices.subarray(i, i + 3)];
            const [a, b, c] = ids.map(id => [mesh.vertices[id * 3], mesh.vertices[id * 3 + 1]]);
            area += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
            const x = (a[0] + b[0] + c[0]) / 3, y = (a[1] + b[1] + c[1]) / 3;
            expect(x > 400 && x < 600 && y > 400 && y < 600).toBe(false);
            for (let e = 0; e < 3; e++) {
                const u = ids[e], v = ids[(e + 1) % 3], key = u < v ? `${u}/${v}` : `${v}/${u}`;
                const edge = edges.get(key) ?? { a: u, b: v, count: 0 }; edge.count++; edges.set(key, edge);
            }
        }
        expect(area).toBeCloseTo(960000, 4);
        for (const { a, b, count } of edges.values()) {
            expect(count).toBeLessThanOrEqual(2);
            const ax = mesh.vertices[a * 3], ay = mesh.vertices[a * 3 + 1];
            const bx = mesh.vertices[b * 3], by = mesh.vertices[b * 3 + 1];
            expect(Math.hypot(ax - bx, ay - by)).toBeLessThanOrEqual(2 * mesh.spacing);
            if (count === 1) {
                const x = (ax + bx) / 2, y = (ay + by) / 2;
                expect(x === 0 || x === 1000 || y === 0 || y === 1000
                    || ((x === 400 || x === 600) && y >= 400 && y <= 600)
                    || ((y === 400 || y === 600) && x >= 400 && x <= 600)).toBe(true);
            }
        }
        for (let i = 0; i < before.length; i += 2) {
            expect([...mesh.vertices].some((x, j) => j % 3 === 0 && x === before[i] && mesh.vertices[j + 1] === before[i + 1])).toBe(true);
        }
    });

    it('retains disconnected islands and omits skipped features without inventing ground between them', () => {
        const left = source([0, 0, 100, 0, 0, 100], [0, 1, 2]);
        const right = source([1000, 0, 1100, 0, 1000, 100], [0, 1, 2]);
        let mesh = buildTerrainSurface([left, right], 20);
        for (let i = 0; i < mesh.vertices.length; i += 3) expect(mesh.vertices[i] <= 100 || mesh.vertices[i] >= 1000).toBe(true);
        right.skippedVertices.fill(1);
        mesh = buildTerrainSurface([left, right], 20);
        expect(mesh.bounds).toEqual([0, 0, 100, 100]);
        expect(buildTerrainSurface([], 20).indices).toHaveLength(0);
    });
});
