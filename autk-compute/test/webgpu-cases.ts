import { ComputeGpgpu } from '../src/compute-gpgpu';
import { getSharedGpuDevice } from '../src/device-manager';
import type { Geometry } from 'geojson';
import type { GpgpuPipelineParams } from '../src/api';
import { ROAD_LENGTH_WGSL } from '../../gallery/src/autk-map/road-length';
import shadowWgsl from '../../usecases/src/shadows/shadow.wgsl?raw';

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
    const geometryCollection: GpgpuPipelineParams<Geometry | null>['collection'] = {
        type: 'FeatureCollection', features: [
            { type: 'Feature', properties: {}, geometry: {
                type: 'MultiLineString', coordinates: [[[10000, 0], [10003, 0]], [[0, 0], [0, 4]]],
            } },
            { type: 'Feature', properties: {}, geometry: null },
        ],
    };
    const roadResult = await new ComputeGpgpu().run({
        collection: geometryCollection, variableMapping: { road: 'geometry' },
        wgslBody: ROAD_LENGTH_WGSL, resultField: 'out',
    });
    const lengths = roadResult.features.map(feature => feature.properties?.compute.out);
    if (lengths[0] !== 7 || lengths[1] !== 0) throw new Error(`Unexpected multipart lengths: ${lengths}`);
    passed.push('multipart-road-length');

    const shadowResult = await new ComputeGpgpu().run({
        collection: geometryCollection, variableMapping: { road: 'geometry' },
        uniforms: { bld_height: 20, doy: 172, sjoin_avg: 600 },
        uniformMatrices: { ring: { cols: 2, data: [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] } },
        wgslBody: shadowWgsl, outputColumns: ['minutes', 'contribution'],
    });
    const minutes = shadowResult.features.map(feature => feature.properties?.compute.minutes);
    if (!(minutes[0] > 0) || minutes[1] !== 0) throw new Error(`Unexpected multipart shadow minutes: ${minutes}`);
    passed.push('shadow-on-second-road-part');

    const absentResult = await new ComputeGpgpu().run({
        collection: { type: 'FeatureCollection', features: [geometryCollection.features[1]] },
        variableMapping: { road: 'geometry' }, wgslBody: 'return f32(road.kind + road.pointEnd - road.pointStart);', resultField: 'out',
    });
    if (absentResult.features[0].properties?.compute.out !== 0) throw new Error('Unexpected null geometry data');
    passed.push('null-only-geometry-buffer');

    const ring = [[0, 0], [10, 0], [0, 10], [0, 0]];
    const hole = [[1, 1], [1, 2], [2, 1], [1, 1]];
    const otherRing = ring.map(([x, y]) => [x + 20, y]);
    const polygonResult = await new ComputeGpgpu().run({
        collection: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: {
            type: 'MultiPolygon', coordinates: [[ring, hole], [otherRing]],
        } }] },
        variableMapping: { area: 'geometry' }, resultField: 'holes', wgslBody: `
            var holes = 0u;
            for (var p = area.index + 1u; p < area.next; p = area_node(p).next) {
                let polygon = area_node(p);
                for (var r = p + 2u; r < polygon.next; r = area_node(r).next) {
                    holes += 1u;
                }
            }
            return f32(holes);`,
    });
    if (polygonResult.features[0].properties?.compute.holes !== 1) throw new Error('Unexpected polygon hole count');
    passed.push('multipolygon-ring-ownership');
    await device.queue.onSubmittedWorkDone();
    if (uncaptured.length) throw new Error(`Uncaptured GPU errors: ${uncaptured.join('; ')}`);
    const info = device.adapterInfo;
    return { passed, storageLimit: limit, adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } };
}
