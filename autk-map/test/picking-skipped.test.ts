import { describe, expect, it } from 'vitest';
import { PipelineTrianglePicking } from '../src/pipeline-triangle-picking';

/** The picking ids the pipeline would upload for a layer of two triangles, one per component. */
function uploadedIds(skippedVertices: number[]) {
    const writes: Float32Array[] = [];
    const pipeline = Object.create(PipelineTrianglePicking.prototype) as any;
    pipeline._dimension = 2;
    pipeline._renderer = { device: { queue: { writeBuffer: (_buffer: unknown, _offset: number, data: Float32Array) => writes.push(data) } } };
    pipeline._positionBuffer = {};
    pipeline._indicesBuffer = {};
    pipeline._objectIdsBuffer = {};
    const layer = {
        position: new Float32Array(12),                        // six vertices
        indices: new Uint32Array([0, 1, 2, 3, 4, 5]),          // two triangles
        components: [{ nTriangles: 1 }, { nTriangles: 2 }],   // cumulative: one triangle each
        skippedVertices: new Float32Array(skippedVertices),
    };
    pipeline.updateVertexBuffers(layer);
    return writes[writes.length - 1]; // the object-id buffer is written last
}

const idOf = (ids: Float32Array, vertex: number) => [...ids.slice(vertex * 3, vertex * 3 + 3)];
const noHit = [0, 0, 0];

describe('picking ids of skipped features', () => {
    it('gives every vertex of a feature its id when nothing is skipped', () => {
        const ids = uploadedIds([0, 0, 0, 0, 0, 0]);
        expect(idOf(ids, 0)).not.toEqual(noHit);
        expect(idOf(ids, 1)).toEqual(idOf(ids, 0));
        expect(idOf(ids, 3)).not.toEqual(noHit);
        expect(idOf(ids, 3)).not.toEqual(idOf(ids, 0)); // a different feature has a different id
    });

    it('leaves a skipped feature as "no hit", and the others unchanged', () => {
        const all = uploadedIds([0, 0, 0, 0, 0, 0]);
        const ids = uploadedIds([1, 1, 1, 0, 0, 0]); // the first feature is skipped
        for (const vertex of [0, 1, 2]) expect(idOf(ids, vertex)).toEqual(noHit);
        for (const vertex of [3, 4, 5]) expect(idOf(ids, vertex)).toEqual(idOf(all, vertex));
    });

    it('leaves every feature as "no hit" when all are skipped', () => {
        const ids = uploadedIds([1, 1, 1, 1, 1, 1]);
        expect([...ids].every((value) => value === 0)).toBe(true);
    });

    it('restores a feature that is no longer skipped', () => {
        const hidden = uploadedIds([1, 1, 1, 0, 0, 0]);
        const shown = uploadedIds([0, 0, 0, 0, 0, 0]);
        expect(idOf(hidden, 0)).toEqual(noHit);
        expect(idOf(shown, 0)).not.toEqual(noHit);
    });
});
