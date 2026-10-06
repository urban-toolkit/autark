import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from '../src/compute-gpgpu';
import type { GpgpuPipelineParams } from '../src/api';
import type { ComputeConfig } from '../src/types-gpgpu';

const collection: FeatureCollection = { type: 'FeatureCollection', features: [1, 2].map(h => ({
    type: 'Feature', properties: { h }, geometry: { type: 'Point', coordinates: [0, 0] },
})) };
afterEach(() => vi.restoreAllMocks());

async function dispatched(params: Partial<GpgpuPipelineParams>): Promise<ComputeConfig> {
    const pipeline = new ComputeGpgpu();
    let seen: ComputeConfig | undefined;
    vi.spyOn(pipeline as any, 'runCompute').mockImplementation(async (config: any) => {
        seen = config;
        return { out0: new Float32Array(collection.features.length) };
    });
    await pipeline.run({ collection, variableMapping: { h: 'properties.h' }, wgslBody: 'return h;', resultField: 'out', ...params });
    if (!seen) throw new Error('No dispatch');
    return seen;
}

describe('global storage arrays and matrices (#105)', () => {
    it.each([3000, 7648, 20000])('reads %i global floats in place without function-local copies', async length => {
        const values = Array.from({ length }, (_, i) => i + 0.5);
        const { shader, inputs } = await dispatched({ uniformArrays: { heights: values }, wgslBody: 'return h + heights[heights_length - 1u];' });
        expect(shader).toContain(`alias heights_Array = array<f32, ${length}>;`);
        expect(shader).toContain('var<storage, read> heights: heights_Array;');
        expect(shader).not.toContain('var heights:');
        expect(shader).not.toContain('heights_uniform_at');
        expect(shader).toMatch(/fn compute_value\(h: f32, heights_length: u32\)/);
        expect(inputs.heights.type).toBe('storage');
        expect(Array.from(inputs.heights.data.slice(0, length))).toEqual(values);
    });

    it('keeps mixed binding order, scalar uniforms, dimensions and row-major matrix padding', async () => {
        const { shader, inputs, outputs } = await dispatched({ uniforms: { scale: 2 }, uniformArrays: { weights: [1, 2, 3] },
            uniformMatrices: { ring: { data: [[4], [5, 6]], cols: 2 } },
            wgslBody: 'return h * scale + weights[weights_length - 1u] + ring[ring_rows * ring_cols - 1u];' });
        expect(shader).toContain('var<uniform> scaleBuf: scale_Uniform;');
        expect(shader).toContain('var<storage, read> ring: ring_Matrix;');
        expect(shader).not.toContain('var ring:');
        expect(shader).toMatch(/fn compute_value\(h: f32, scale: f32, weights_length: u32, ring_rows: u32, ring_cols: u32\)/);
        expect(Object.entries(inputs).map(([name, value]) => [name, value.type, value.binding])).toEqual([
            ['h', 'storage', 0], ['scale', 'uniform', 1], ['weights', 'storage', 2], ['ring', 'storage', 3],
        ]);
        expect(outputs.out0.binding).toBe(4);
        expect(Array.from(inputs.ring.data)).toEqual([4, 0, 5, 6]);
        expect(inputs.scale.data.byteLength).toBe(16);
    });

    it('uses nonzero physical storage for empty globals while keeping logical dimensions zero', async () => {
        const { shader, inputs } = await dispatched({ uniformArrays: { empty: [] }, uniformMatrices: { matrix: { data: [], cols: 2 } } });
        expect(shader).toContain('alias empty_Array = array<f32, 1>;');
        expect(shader).toContain('alias matrix_Matrix = array<f32, 1>;');
        expect(shader).toContain('compute_value(h, 0u, 0u, 2u)');
        expect(shader).toContain('_ = empty[0];');
        expect(shader).toContain('_ = matrix[0];');
        expect(Array.from(inputs.empty.data)).toEqual([0, 0, 0, 0]);
        expect(Array.from(inputs.matrix.data)).toEqual([0, 0, 0, 0]);
    });

    it('preserves generated-symbol collision detection', async () => {
        await expect(dispatched({ uniforms: { weights_length: 2 }, uniformArrays: { weights: [1] } })).rejects.toThrow(/collision/);
        await expect(dispatched({ uniformMatrices: { h: { data: [[1]], cols: 1 } } })).rejects.toThrow(/collision/);
    });

    it('rejects an exceeded storage binding limit before creating GPU resources', async () => {
        const pipeline = new ComputeGpgpu();
        vi.spyOn(pipeline as any, 'getDevice').mockResolvedValue({ limits: { maxStorageBuffersPerShaderStage: 3 } });
        await expect(pipeline.run({ collection, variableMapping: { h: 'properties.h' }, uniformArrays: { a: [1], b: [2] },
            wgslBody: 'return h + a[0] + b[0];', resultField: 'out' })).rejects.toThrow(/requires 4 storage buffers; device limit is 3/);
    });
});
