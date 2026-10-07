import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from '../src/compute-gpgpu';
import type { GpgpuPipelineParams } from '../src/api';
import type { ComputeConfig } from '../src/types-gpgpu';

const collection: FeatureCollection = { type: 'FeatureCollection', features: [1, 2].map(h => ({
    type: 'Feature', properties: { h }, geometry: { type: 'Point', coordinates: [0, 0] },
})) };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

type ErrorFilter = 'validation' | 'out-of-memory' | 'internal';
type FakeDevice = ReturnType<typeof fakeDevice>;
const STORAGE = 128;

/**
 * A GPUDevice stand-in that reports errors the way WebGPU does: a failing call returns
 * normally and records its error in the innermost error scope with a matching filter
 * (first error only), or as uncaptured. Read-back is `readBack` (zeros by default),
 * which is what a pass the GPU rejected leaves in the output buffers.
 */
function fakeDevice({ maxStorageBufferBindingSize = 1024, freeBytes = Infinity, pipelineError = '', writeError = '', readBack = 0 } = {}) {
    const scopes: Array<{ filter: ErrorFilter; error: { message: string } | null }> = [];
    const uncaptured: string[] = [];
    const report = (filter: ErrorFilter, message: string) => {
        const scope = [...scopes].reverse().find(open => open.filter === filter);
        if (!scope) uncaptured.push(message);
        else if (!scope.error) scope.error = { message };
    };
    return {
        scopes, uncaptured,
        limits: { maxStorageBuffersPerShaderStage: 8, maxStorageBufferBindingSize },
        pushErrorScope: (filter: ErrorFilter) => { scopes.push({ filter, error: null }); },
        popErrorScope: async () => {
            const scope = scopes.pop();
            if (!scope) throw new Error('OperationError: no error scope to pop');
            return scope.error;
        },
        createShaderModule: ({ code }: { code: string }) => {
            if (code.includes('undefined_gpu_symbol')) report('validation', "Error while parsing WGSL: unresolved value 'undefined_gpu_symbol'");
            return {};
        },
        createComputePipeline: () => {
            if (pipelineError) report('internal', pipelineError);
            return { getBindGroupLayout: () => ({}) };
        },
        createBuffer: ({ size, usage }: { size: number; usage: number }) => {
            if (size > freeBytes) report('out-of-memory', `Not enough memory left to allocate a buffer of ${size} bytes.`);
            return { size, usage, mapAsync: async () => undefined, unmap: () => undefined, destroy: () => undefined,
                getMappedRange: () => new Float32Array(size / 4).fill(readBack).buffer };
        },
        createBindGroup: ({ entries }: { entries: Array<{ resource: { buffer: { size: number; usage: number } } }> }) => {
            for (const { resource: { buffer } } of entries) {
                if (buffer.usage & STORAGE && buffer.size > maxStorageBufferBindingSize) {
                    report('validation', `Binding size (${buffer.size}) is larger than the maximum storage buffer binding size (${maxStorageBufferBindingSize}).`);
                }
            }
            return {};
        },
        createCommandEncoder: () => ({
            beginComputePass: () => ({ setPipeline: () => undefined, setBindGroup: () => undefined, dispatchWorkgroups: () => undefined, end: () => undefined }),
            copyBufferToBuffer: () => undefined,
            finish: () => ({}),
        }),
        queue: {
            writeBuffer: () => { if (writeError) throw new Error(writeError); },
            submit: () => undefined,
        },
    };
}

/** Runs the pipeline on `device` and returns what the caller gets: the read-back values, or the rejection. */
async function runOn(device: FakeDevice, params: Partial<GpgpuPipelineParams> = {}): Promise<number[] | Error> {
    const pipeline = new ComputeGpgpu();
    vi.spyOn(pipeline as any, 'getDevice').mockResolvedValue(device);
    try {
        const result = await pipeline.run({ collection, variableMapping: { h: 'properties.h' }, wgslBody: 'return h;', resultField: 'out', ...params });
        return result.features.map(feature => feature.properties?.compute.out);
    } catch (error) {
        return error as Error;
    }
}

describe('GPU errors reject run instead of reading back zeros', () => {
    // 32 floats are a 128-byte storage binding, over the 64-byte limit these cases give the device.
    const oversized = { uniformArrays: { boxes: Array.from({ length: 32 }, (_, i) => i) }, wgslBody: 'return h + boxes[0];' };
    beforeEach(() => {
        vi.stubGlobal('GPUBufferUsage', { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE, INDIRECT: 256, QUERY_RESOLVE: 512 });
        vi.stubGlobal('GPUMapMode', { READ: 1, WRITE: 2 });
    });

    it('rejects with the validation message for a global array over the storage binding size', async () => {
        const device = fakeDevice({ maxStorageBufferBindingSize: 64 });
        const outcome = await runOn(device, oversized);
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toContain('GPU validation error: Binding size (128) is larger than the maximum storage buffer binding size (64).');
        expect(device.uncaptured).toEqual([]);
        expect(device.scopes).toEqual([]);
    });

    it('rejects with the validation message for a WGSL body that does not compile', async () => {
        const device = fakeDevice();
        const outcome = await runOn(device, { wgslBody: 'return h + undefined_gpu_symbol;' });
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toContain("GPU validation error: Error while parsing WGSL: unresolved value 'undefined_gpu_symbol'");
        expect(device.uncaptured).toEqual([]);
        expect(device.scopes).toEqual([]);
    });

    it('rejects with the out-of-memory message when a buffer cannot be allocated', async () => {
        const device = fakeDevice({ freeBytes: 4 });
        const outcome = await runOn(device);
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toContain('GPU out-of-memory error: Not enough memory left to allocate a buffer of 8 bytes.');
        expect(device.uncaptured).toEqual([]);
        expect(device.scopes).toEqual([]);
    });

    it('rejects with the internal message when the driver cannot build the pipeline', async () => {
        const device = fakeDevice({ pipelineError: 'Error creating pipeline state Compute function exceeds available stack space' });
        const outcome = await runOn(device);
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toContain('GPU internal error: Error creating pipeline state Compute function exceeds available stack space');
        expect(device.uncaptured).toEqual([]);
        expect(device.scopes).toEqual([]);
    });

    it('fails only the run whose pass failed when runs share the device', async () => {
        const device = fakeDevice({ maxStorageBufferBindingSize: 64, readBack: 7 });
        const [failed, passed] = await Promise.all([runOn(device, oversized), runOn(device, { uniformArrays: { boxes: [1, 2] }, wgslBody: 'return h + boxes[0];' })]);
        expect(failed).toBeInstanceOf(Error);
        expect((failed as Error).message).toContain('GPU validation error: Binding size (128)');
        expect(passed).toEqual([7, 7]);
        expect(device.scopes).toEqual([]);
    });

    it('resolves with the read-back values when the pass succeeds', async () => {
        const device = fakeDevice({ readBack: 7 });
        expect(await runOn(device, { uniformArrays: { boxes: [1, 2] }, wgslBody: 'return h + boxes[0];' })).toEqual([7, 7]);
        expect(device.uncaptured).toEqual([]);
        expect(device.scopes).toEqual([]);
    });

    it('closes its error scopes when a GPU call throws', async () => {
        const device = fakeDevice({ writeError: 'OperationError: data range is out of bounds' });
        const outcome = await runOn(device);
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toBe('OperationError: data range is out of bounds');
        expect(device.scopes).toEqual([]);
    });
});
