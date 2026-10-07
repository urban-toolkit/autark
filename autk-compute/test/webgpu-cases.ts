import { ComputeGpgpu } from '../src/compute-gpgpu';
import { getSharedGpuDevice } from '../src/device-manager';
import type { GpgpuPipelineParams } from '../src/api';

/** Actual GPU checks; run with node autk-compute/test/run-webgpu.mjs (not Vitest's Node mocks). */
export async function runWebGpuCases() {
    const device = await getSharedGpuDevice();
    const uncaptured: string[] = [];
    device.addEventListener('uncapturederror', event => uncaptured.push(event.error.message));
    const collection: GpgpuPipelineParams['collection'] = { type: 'FeatureCollection', features: [1, 2].map(h => ({
        type: 'Feature', properties: { h }, geometry: { type: 'Point', coordinates: [0, 0] },
    })) };
    const cases: Array<{ name: string; globals: Partial<GpgpuPipelineParams>; body: string; expected: number[] }> = [];
    for (const length of [3000, 7648, 20000]) {
        cases.push({ name: `array-${length}`, globals: { uniformArrays: { weights: Array.from({ length }, (_, i) => i + 0.5) } },
            body: 'return h + weights[0] + weights[weights_length - 1u];', expected: [length + 1, length + 2] });
    }
    cases.push({ name: 'matrix-above-64KiB', globals: { uniformMatrices: { matrix: { data: Array.from({ length: 10000 }, (_, i) => [i, i + 0.5]), cols: 2 } } },
        body: 'return h + matrix[matrix_rows * matrix_cols - 1u];', expected: [10000.5, 10001.5] });
    cases.push({ name: 'mixed-scalar-array-matrix', globals: { uniforms: { scale: 3 }, uniformArrays: { weights: [0.5, 1.5, 2.5] }, uniformMatrices: { matrix: { data: [[4], [5, 6]], cols: 2 } } },
        body: 'return h * scale + weights[weights_length - 1u] + matrix[0] + matrix[1] + matrix[matrix_rows * matrix_cols - 1u];', expected: [15.5, 18.5] });
    cases.push({ name: 'unused-globals', globals: { uniformArrays: { unused: [1, 2] }, uniformMatrices: { matrix: { data: [[3, 4]], cols: 2 } } },
        body: 'return h;', expected: [1, 2] });
    cases.push({ name: 'scalar-only', globals: { uniforms: { scale: 2 } }, body: 'return h * scale;', expected: [2, 4] });
    cases.push({ name: 'empty-globals', globals: { uniformArrays: { empty: [] }, uniformMatrices: { matrix: { data: [], cols: 2 } } },
        body: 'return h + f32(empty_length + matrix_rows);', expected: [1, 2] });
    const limit = device.limits.maxStorageBuffersPerShaderStage;
    const globals = Object.fromEntries(Array.from({ length: limit - 2 }, (_, i) => [`g${i}`, [i + 1]]));
    cases.push({ name: 'storage-binding-limit', globals: { uniformArrays: globals },
        body: `return h + ${Object.keys(globals).map(name => `${name}[0]`).join(' + ')};`,
        expected: [1, 2].map(h => h + (limit - 2) * (limit - 1) / 2) });
    const passed: string[] = [];
    for (const test of cases) {
        device.pushErrorScope('validation');
        let values: number[];
        let validationError: GPUError | null;
        try {
            const result = await new ComputeGpgpu().run({ collection, variableMapping: { h: 'properties.h' },
                ...test.globals, wgslBody: test.body, resultField: 'out' });
            values = result.features.map(feature => feature.properties?.compute.out);
        } finally {
            validationError = await device.popErrorScope();
        }
        if (validationError) throw new Error(`${test.name}: GPU validation: ${validationError.message}`);
        if (JSON.stringify(values) !== JSON.stringify(test.expected)) {
            throw new Error(`${test.name}: expected ${JSON.stringify(test.expected)}, got ${JSON.stringify(values)}`);
        }
        passed.push(test.name);
    }
    try {
        await new ComputeGpgpu().run({ collection, variableMapping: { h: 'properties.h' }, uniformArrays: { ...globals, excess: [1] },
            wgslBody: 'return h;', resultField: 'out' });
        throw new Error('Excess storage bindings were not rejected');
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes(`requires ${limit + 1} storage buffers`)) throw error;
        passed.push('storage-binding-limit-exceeded');
    }
    try {
        // The GPU rejects this shader; run must reject with its message, not read back zeros.
        const result = await new ComputeGpgpu().run({ collection, variableMapping: { h: 'properties.h' },
            wgslBody: 'return h + undefined_gpu_symbol;', resultField: 'out' });
        throw new Error(`Invalid WGSL resolved with ${JSON.stringify(result.features.map(feature => feature.properties?.compute.out))}`);
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('GPU validation error') || !error.message.includes('undefined_gpu_symbol')) throw error;
        passed.push('gpu-validation-error-rejected');
    }
    await device.queue.onSubmittedWorkDone();
    if (uncaptured.length) throw new Error(`Uncaptured GPU errors: ${uncaptured.join('; ')}`);
    const info = device.adapterInfo;
    return { passed, storageLimit: limit, adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } };
}
