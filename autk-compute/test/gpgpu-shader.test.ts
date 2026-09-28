import { describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';

import { ComputeGpgpu } from '../src/compute-gpgpu';
import type { GpgpuPipelineParams } from '../src/api';

interface Dispatched {
    shader: string;
    inputs: Record<string, { type: string; binding: number; data: Float32Array }>;
}

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', properties: { h: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { h: 2 }, geometry: { type: 'Point', coordinates: [1, 1] } },
    ],
};

/** Runs a pipeline up to the GPU and returns what would be dispatched. */
async function dispatched(params: Partial<GpgpuPipelineParams>): Promise<Dispatched> {
    const gpgpu = new ComputeGpgpu();
    let seen: Dispatched | undefined;
    // `runCompute` is where the GPU starts; everything before it is plain TypeScript.
    vi.spyOn(gpgpu as unknown as { runCompute: (config: unknown) => Promise<unknown> }, 'runCompute')
        .mockImplementation(async (config) => {
            const c = config as Dispatched & { outputs: { out0: { size: number } } };
            seen = { shader: c.shader, inputs: c.inputs };
            return { out0: new Float32Array(c.outputs.out0.size / 4) };
        });
    await gpgpu.run({
        collection,
        variableMapping: { h: 'properties.h' },
        wgslBody: 'return h;',
        resultField: 'out',
        ...params,
    });
    if (!seen) throw new Error('nothing was dispatched');
    return seen;
}

describe('global arrays in the generated shader', () => {
    // Example: 956 building heights and their 7648-float footprints, as a batched
    // shadow pass sends them. Copied into function-local arrays and passed by
    // value, NVIDIA's Vulkan driver refused the pipeline and Apple's Metal ran
    // out of stack; nothing threw, and every feature read back 0.
    const heights = Array.from({ length: 3000 }, (_, i) => i + 0.5);

    it('reads a uniform array in place, from a storage buffer', async () => {
        const { shader, inputs } = await dispatched({
            uniformArrays: { heights },
            wgslBody: 'return h + heights[heights_length - 1u];',
        });
        expect(shader).toContain('alias heights_Array = array<f32, 3000>;');
        expect(shader).toMatch(/var<storage, read> heights: heights_Array;/);
        expect(shader).not.toMatch(/var heights: heights_Array;/);
        expect(shader).not.toMatch(/heights\[i\] =/);
        expect(shader).toMatch(/fn compute_value\([^)]*heights_length: u32/);
        expect(shader).not.toMatch(/fn compute_value\([^)]*heights: heights_Array/);
        expect(inputs.heights.type).toBe('storage');
        expect(Array.from(inputs.heights.data.slice(0, 3000))).toEqual(heights);
    });

    it('reads a uniform matrix in place, from a storage buffer', async () => {
        const { shader, inputs } = await dispatched({
            uniformMatrices: { ring: { data: [[0, 0], [1, 1], [2, 2]], cols: 2 } },
            wgslBody: 'return h + ring[ring_rows * ring_cols - 1u];',
        });
        expect(shader).toContain('alias ring_Matrix = array<f32, 6>;');
        expect(shader).toMatch(/var<storage, read> ring: ring_Matrix;/);
        expect(shader).not.toMatch(/var ring: ring_Matrix;/);
        expect(shader).toMatch(/fn compute_value\([^)]*ring_rows: u32, ring_cols: u32/);
        expect(inputs.ring.type).toBe('storage');
    });

    it('keeps a scalar uniform in a uniform buffer', async () => {
        const { shader, inputs } = await dispatched({
            uniforms: { doy: 172 },
            wgslBody: 'return h + doy;',
        });
        expect(shader).toMatch(/var<uniform> doyBuf: doy_Uniform;/);
        expect(inputs.doy.type).toBe('uniform');
        expect(inputs.doy.data[0]).toBe(172);
    });
});
