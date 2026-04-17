import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

import {
    valueAtPath,
    TypedArray,
} from 'autk-core';

import { GpuPipeline } from './compute-pipeline';

import type { GpgpuPipelineParams } from './api';
import type { GlobalVarMeta, ComputeConfig } from './types-gpgpu';

type ComputeFeature = Feature<Geometry, GeoJsonProperties>;
type GlobalInputArrays = Record<string, Float32Array>;

/**
 * GPGPU compute engine for executing WGSL functions over GeoJSON feature properties.
 *
 * `ComputeGpgpu` transforms feature data into columnar GPU buffers, dispatches a
 * compute shader with one thread per feature, and writes results back to
 * `feature.properties.compute`.
 *
 * The pipeline supports:
 * - Scalar, array, and matrix inputs per feature
 * - Global constants (scalars, arrays, matrices) shared across all features
 * - Auto-sized matrices that adapt to per-feature row counts
 * - Multiple output columns via the `OutputArray` return type
 *
 * @extends GpuPipeline
 *
 * @example
 * // Calculate building floor area ratio
 * const gpgpu = new ComputeGpgpu();
 * const result = await gpgpu.run({
 *   collection: buildings,
 *   variableMapping: { height: 'height', footprint: 'area' },
 *   wgslBody: `return height * footprint;`,
 *   resultField: 'floorAreaRatio'
 * });
 *
 * @example
 * // Multiple outputs: compute hourly solar irradiance
 * const result = await gpgpu.run({
 *   collection: parcels,
 *   variableMapping: { orientation: 'rotation' },
 *   attributeArrays: { hourlyShading: 24 },
 *   uniforms: { sunAzimuth: 180, sunElevation: 45 },
 *   wgslBody: `
 *     var result: OutputArray;
 *     for (var i = 0u; i < 24u; i++) {
 *       result[i] = computeIrradiance(orientation, hourlyShading[i], sunAzimuth, sunElevation);
 *     }
 *     return result;
 *   `,
 *   outputColumns: ['h00', 'h01', 'h02', ...  'h23']
 * });
 */
export class ComputeGpgpu extends GpuPipeline {
    /**
     * Executes a WGSL compute shader over feature properties in a single columnar GPU pass.
     *
     * Each feature in `params.collection` receives one GPU thread. Properties are
     * extracted according to `params.variableMapping` and passed as typed WGSL
     * parameters. Results are written to `feature.properties.compute`.
     *
     * @param params - Computation parameters including the feature collection and WGSL shader body.
     * @param params.collection - GeoJSON FeatureCollection to process.
     * @param params.variableMapping - Maps WGSL variable names to feature property dot-paths.
     * @param params.attributeArrays - Per-feature fixed-length arrays.
     * @param params.attributeMatrices - Per-feature matrices with fixed or auto rows.
     * @param params.uniforms - Global scalar constants uploaded once for the dispatch.
     * @param params.uniformArrays - Global array constants uploaded once for the dispatch.
     * @param params.uniformMatrices - Global matrix constants uploaded once for the dispatch.
     * @param params.wgslBody - WGSL function body returning f32 or OutputArray.
     * @param params.resultField - Single output field name (optional).
     * @param params.outputColumns - Multiple output field names (optional, takes priority).
     * @returns A new FeatureCollection with computed values written to `feature.properties.compute`.
     * @throws If neither `resultField` nor `outputColumns` is provided.
     *
     * @example
     * const result = await gpgpu.run({
     *   collection: buildings,
     *   variableMapping: { height: 'properties.height' },
     *   wgslBody: `return height * 0.5;`,
     *   resultField: 'shadowHeight'
     * });
     */
    async run(params: GpgpuPipelineParams): Promise<FeatureCollection> {
        const { collection, variableMapping, attributeArrays = {}, attributeMatrices = {}, wgslBody } = params;

        const outputColumns = params.outputColumns ?? (params.resultField ? [params.resultField] : []);
        if (outputColumns.length === 0) {
            throw new Error('resultField or outputColumns must be provided');
        }

        const features = collection.features ?? [];
        const featureCount = features.length;
        if (featureCount === 0) {
            return collection;
        }

        const { orderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars } = this.extractInputData(
            features, variableMapping, attributeArrays, attributeMatrices, featureCount,
        );
        const { globalVarNames, globalInputArrays, globalMeta } = this.extractGlobalData(params);

        const shader = this.buildShader(scalarVars, arrayVars, matrixVars, globalMeta, wgslBody, outputColumns.length);
        const allInputArrays = { ...inputArrays, ...globalInputArrays };

        const result = await this.dispatch(
            orderedVarNames,
            globalVarNames,
            allInputArrays,
            shader,
            featureCount,
            outputColumns.length
        );
        return this.applyResultsToFeatures(collection, features, result, outputColumns);
    }

    /**
     * Low-level compute dispatch: creates GPU buffers, runs the shader, and reads back results.
     *
     * This method is exposed as `protected` to allow subclasses to build custom compute
     * pipelines that bypass the high-level {@link run} interface.
     *
     * @param config - Compute configuration including shader, dispatch size, and buffer bindings.
     * @param config.shader - WGSL shader source code.
     * @param config.entryPoint - Shader entry point (default: 'main').
     * @param config.dispatchSize - Workgroup dispatch dimensions.
     * @param config.inputs - Named input buffers.
     * @param config.outputs - Named output buffers with readback configuration.
     * @returns Object mapping output names to typed arrays.
     * @protected
     */
    protected async runCompute(config: ComputeConfig): Promise<{ [outputName: string]: TypedArray }> {
        const device = await this.getDevice();
        const { shader, entryPoint = 'main', dispatchSize, inputs, outputs } = config;

        const shaderModule = device.createShaderModule({ code: shader });
        const pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint },
        });

        const inputBuffers = new Map<string, GPUBuffer>();
        const outputBuffers = new Map<string, GPUBuffer>();
        const outputSizes = new Map<string, number>();
        const groupEntries = new Map<number, GPUBindGroupEntry[]>();

        for (const [name, input] of Object.entries(inputs)) {
            const group = input.group ?? 0;
            const usage = input.type === 'uniform'
                ? GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
            const aligned = this.alignTo(input.data.byteLength, input.type === 'uniform' ? 16 : 4);
            const buf = this.createBuffer(device, aligned, usage, input.data);
            inputBuffers.set(name, buf);
            const entries = groupEntries.get(group) ?? [];
            entries.push({ binding: input.binding, resource: { buffer: buf } });
            groupEntries.set(group, entries);
        }

        for (const [name, output] of Object.entries(outputs)) {
            const group = output.group ?? 0;
            const aligned = this.alignTo(output.size, 4);
            const buf = this.createBuffer(device, aligned, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
            outputBuffers.set(name, buf);
            outputSizes.set(name, aligned);
            const entries = groupEntries.get(group) ?? [];
            entries.push({ binding: output.binding, resource: { buffer: buf } });
            groupEntries.set(group, entries);
        }

        const groups = [...groupEntries.keys()].sort((a, b) => a - b);
        const bindGroups = new Map<number, GPUBindGroup>();
        for (const g of groups) {
            bindGroups.set(g, device.createBindGroup({
                layout: pipeline.getBindGroupLayout(g),
                entries: groupEntries.get(g)!,
            }));
        }

        // Build staging buffers and encode the full command buffer in one pass.
        const stagingBuffers = new Map<string, GPUBuffer>();
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        for (const g of groups) {
            pass.setBindGroup(g, bindGroups.get(g)!);
        }
        pass.dispatchWorkgroups(dispatchSize[0] ?? 1, dispatchSize[1] ?? 1, dispatchSize[2] ?? 1);
        pass.end();

        for (const [key, buf] of outputBuffers) {
            const size = outputSizes.get(key)!;
            const staging = this.createStagingBuffer(device, size);
            stagingBuffers.set(key, staging);
            encoder.copyBufferToBuffer(buf, 0, staging, 0, size);
        }

        device.queue.submit([encoder.finish()]);

        // Read back all outputs (sequentially — GPU serialises anyway).
        const result: Record<string, TypedArray> = {};
        for (const [key, staging] of stagingBuffers) {
            const cfg = outputs[key];
            const Ctor = cfg.arrayType ?? Uint8Array;
            result[key] = await this.mapReadBuffer(staging, Ctor as new (ab: ArrayBuffer) => TypedArray);
        }

        for (const buf of inputBuffers.values()) {
            buf.destroy();
        }
        for (const buf of outputBuffers.values()) {
            buf.destroy();
        }

        return result;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Builds the {@link runCompute} config and dispatches the compute shader.
     *
     * @param orderedVarNames - Ordered list of variable names for buffer bindings.
     * @param inputArrays - Input data arrays keyed by variable name.
     * @param shader - WGSL shader source code.
     * @param featureCount - Number of features (determines dispatch size and output buffer size).
     * @param numOutputs - Number of output columns to create.
     * @returns Object mapping output names (`out0`, `out1`, ...) to Float32Array results.
     * @private
     */
    private async dispatch(
        featureVarNames: string[],
        globalVarNames: string[],
        inputArrays: { [varName: string]: Float32Array },
        shader: string,
        featureCount: number,
        numOutputs: number,
    ) {
        const inputs: ComputeConfig['inputs'] = {};
        let binding = 0;

        featureVarNames.forEach((varName) => {
            inputs[varName] = { type: 'storage', data: inputArrays[varName], binding: binding++ };
        });
        globalVarNames.forEach((varName) => {
            inputs[varName] = { type: 'uniform', data: inputArrays[varName], binding: binding++ };
        });

        const outputs: ComputeConfig['outputs'] = {};
        for (let o = 0; o < numOutputs; o++) {
            outputs[`out${o}`] = {
                size: featureCount * 4,
                binding: binding + o,
                arrayType: Float32Array,
            };
        }

        return this.runCompute({
            shader,
            dispatchSize: [Math.ceil(featureCount / 64), 1, 1],
            inputs,
            outputs,
        });
    }

    /**
     * Extracts and flattens per-feature input data into columnar typed arrays.
     *
     * This method performs three passes:
     * 1. Resolve max row count for auto-sized matrices
     * 2. Allocate contiguous typed array buffers
     * 3. Populate buffers in a single feature iteration
     *
     * @param features - Array of GeoJSON features to extract data from.
     * @param variableMapping - Maps WGSL variable names to property paths.
     * @param arrayVariables - Per-feature array variable definitions.
     * @param matrixVariables - Per-feature matrix variable definitions.
     * @param featureCount - Total number of features.
     * @returns Object containing ordered variable names, input arrays, and variable metadata.
     * @private
     */
    private extractInputData(
        features: ComputeFeature[],
        variableMapping: Record<string, string>,
        arrayVariables: Record<string, number>,
        matrixVariables: Record<string, { rows: number | 'auto'; cols: number }>,
        featureCount: number,
    ) {
        const orderedVarNames = Object.keys(variableMapping);
        const inputArrays: { [varName: string]: Float32Array } = {};
        const scalarVars: string[] = [];
        const arrayVars: Array<{ name: string; length: number }> = [];
        const matrixVars: Array<{
            name: string;
            rows: number;
            cols: number;
            variableRows?: boolean;
            rowsVarName?: string;
        }> = [];

        const accessors = orderedVarNames.map((varName) => {
            const path = this.normalizePropertyPath(variableMapping[varName]);
            const isArray = varName in arrayVariables;
            const isMatrix = varName in matrixVariables;
            let kind: 'scalar' | 'array' | 'matrix_fixed' | 'matrix_auto' = 'scalar';
            let cols = 0;
            let rows = 0;
            let length = 0;

            if (isMatrix) {
                const m = matrixVariables[varName];
                cols = m.cols;
                if (m.rows === 'auto') {
                    kind = 'matrix_auto';
                } else {
                    kind = 'matrix_fixed';
                    rows = m.rows as number;
                }
            } else if (isArray) {
                kind = 'array';
                length = arrayVariables[varName];
            }

            return {
                varName,
                path,
                kind,
                cols,
                rows,
                length,
                maxRows: 0,
                actualRows: new Float32Array(featureCount),
            };
        });

        // Pass 1: resolve max row count for auto-sized matrices.
        for (let i = 0; i < featureCount; i++) {
            const feat = features[i];
            for (const acc of accessors) {
                if (acc.kind === 'matrix_auto') {
                    const val = valueAtPath(feat, acc.path);
                    const len = Array.isArray(val) ? val.length : 0;
                    acc.actualRows[i] = len;
                    if (len > acc.maxRows) {
                        acc.maxRows = len;
                    }
                }
            }
        }

        // Pass 2: allocate contiguous typed array buffers.
        for (const acc of accessors) {
            if (acc.kind === 'scalar') {
                inputArrays[acc.varName] = new Float32Array(featureCount);
                scalarVars.push(acc.varName);
            } else if (acc.kind === 'array') {
                inputArrays[acc.varName] = new Float32Array(featureCount * acc.length);
                arrayVars.push({ name: acc.varName, length: acc.length });
            } else if (acc.kind === 'matrix_fixed') {
                inputArrays[acc.varName] = new Float32Array(featureCount * acc.rows * acc.cols);
                matrixVars.push({ name: acc.varName, rows: acc.rows, cols: acc.cols });
            } else if (acc.kind === 'matrix_auto') {
                inputArrays[acc.varName] = new Float32Array(featureCount * acc.maxRows * acc.cols);
                const rowsVarName = `${acc.varName}__varrows`;
                inputArrays[rowsVarName] = acc.actualRows;
                matrixVars.push({
                    name: acc.varName,
                    rows: acc.maxRows,
                    cols: acc.cols,
                    variableRows: true,
                    rowsVarName,
                });
            }
        }

        // Pass 3: populate buffers in a single feature iteration.
        for (let i = 0; i < featureCount; i++) {
            const feat = features[i];
            for (const acc of accessors) {
                const val = valueAtPath(feat, acc.path);
                const arr = inputArrays[acc.varName];

                if (acc.kind === 'scalar') {
                    const numeric = Number(val);
                    arr[i] = Number.isFinite(numeric) ? numeric : 0;
                } else if (acc.kind === 'array') {
                    const source = Array.isArray(val) ? val : [];
                    const offset = i * acc.length;
                    for (let e = 0; e < acc.length; e++) {
                        const num = e < source.length ? Number(source[e]) : 0;
                        arr[offset + e] = Number.isFinite(num) ? num : 0;
                    }
                } else if (acc.kind === 'matrix_fixed' || acc.kind === 'matrix_auto') {
                    const rCount = acc.kind === 'matrix_fixed' ? acc.rows : acc.maxRows;
                    const sourceMatrix = Array.isArray(val) ? val : [];
                    const offset = i * rCount * acc.cols;
                    for (let r = 0; r < rCount; r++) {
                        const sourceRow = Array.isArray(sourceMatrix[r]) ? sourceMatrix[r] : [];
                        for (let c = 0; c < acc.cols; c++) {
                            const num = c < sourceRow.length ? Number(sourceRow[c]) : 0;
                            arr[offset + r * acc.cols + c] = Number.isFinite(num) ? num : 0;
                        }
                    }
                }
            }
        }

        const reorderedVarNames: string[] = [...scalarVars];
        for (const av of arrayVars) {
            reorderedVarNames.push(av.name);
        }
        for (const mv of matrixVars) {
            reorderedVarNames.push(mv.name);
            if (mv.variableRows && mv.rowsVarName) {
                reorderedVarNames.push(mv.rowsVarName);
            }
        }

        return { orderedVarNames: reorderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars };
    }

    /**
     * Extracts global constant data (scalars, arrays, matrices) from pipeline parameters.
     *
     * @param params - GPGPU pipeline parameters containing uniform definitions.
     * @returns Object containing variable names, input arrays, and metadata for global constants.
     * @private
     */
    private extractGlobalData(params: GpgpuPipelineParams) {
        const { uniforms = {}, uniformArrays = {}, uniformMatrices = {} } = params;
        const globalVarNames: string[] = [];
        const globalInputArrays: GlobalInputArrays = {};
        const globalMeta: GlobalVarMeta[] = [];

        for (const [name, value] of Object.entries(uniforms)) {
            globalInputArrays[name] = this.packUniformFloats([Number.isFinite(value) ? value : 0]);
            globalMeta.push({ kind: 'scalar', name });
            globalVarNames.push(name);
        }

        for (const [name, data] of Object.entries(uniformArrays)) {
            globalInputArrays[name] = this.packUniformFloats(
                data.map((v) => Number.isFinite(Number(v)) ? Number(v) : 0)
            );
            globalMeta.push({ kind: 'array', name, length: data.length });
            globalVarNames.push(name);
        }

        for (const [name, { data, cols }] of Object.entries(uniformMatrices)) {
            const rows = data.length;
            const flattened = new Float32Array(rows * cols);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const v = Number(data[r]?.[c] ?? 0);
                    flattened[r * cols + c] = Number.isFinite(v) ? v : 0;
                }
            }
            globalInputArrays[name] = this.packUniformFloats(flattened);
            globalMeta.push({ kind: 'matrix', name, rows, cols });
            globalVarNames.push(name);
        }

        return { globalVarNames, globalInputArrays, globalMeta };
    }

    /**
     * Writes computed results back to feature properties under `.compute`.
     *
     * @param geojson - Original FeatureCollection to write results into.
     * @param features - Array of features to update.
     * @param result - Computed output arrays from the GPU.
     * @param outputColumns - Names for each output column.
     * @returns New FeatureCollection with results written to `feature.properties.compute`.
     * @private
     */
    private applyResultsToFeatures(
        geojson: FeatureCollection,
        features: ComputeFeature[],
        result: Record<string, TypedArray>,
        outputColumns: string[],
    ): FeatureCollection {
        const newFeatures = features.map((feature, i) => {
            const properties = feature.properties ? { ...feature.properties } : {};
            const computeProps = properties.compute ? { ...properties.compute } : {};
            outputColumns.forEach((col, o) => {
                computeProps[col] = (result[`out${o}`] as Float32Array)[i];
            });
            properties.compute = computeProps;
            return { ...feature, properties };
        });
        return { ...geojson, features: newFeatures } as FeatureCollection;
    }

    /**
     * Generates WGSL shader code from variable metadata and the user-provided function body.
     *
     * The generated shader:
     * 1. Declares `ArrayF32` struct for buffer access
     * 2. Creates buffer bindings for all inputs and outputs
     * 3. Generates type aliases for array/matrix variables
     * 4. Wraps `wgslBody` in a `compute_value` function
     * 5. Implements the `main` compute entry point with index bounds checking
     *
     * @param scalarVars - Names of scalar variables.
     * @param arrayVars - Array variable metadata (name, length).
     * @param matrixVars - Matrix variable metadata (name, rows, cols, variableRows).
     * @param globalMeta - Global uniform metadata.
     * @param wgslBody - User-provided WGSL function body.
     * @param numOutputs - Number of output columns (determines OutputArray size).
     * @returns Complete WGSL shader source code.
     * @private
     */
    private buildShader(
        scalarVars: string[],
        arrayVars: Array<{ name: string; length: number }>,
        matrixVars: Array<{
            name: string;
            rows: number;
            cols: number;
            variableRows?: boolean;
            rowsVarName?: string;
        }>,
        globalMeta: GlobalVarMeta[],
        wgslBody: string,
        numOutputs: number,
    ): string {
        let bindingIdx = 0;
        const bufferDecls: string[] = [];
        const locals: string[] = [];
        const arrayCopyCode: string[] = [];
        const computeFunctionParams: string[] = [];
        const computeFunctionArgs: string[] = [];
        const arrayTypeDecls: string[] = [];
        const uniformHelpers: string[] = [];

        const structDef = 'struct ArrayF32 { data: array<f32> }';

        for (const name of scalarVars) {
            bufferDecls.push(
                `@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`
            );
            locals.push(`  let ${name}: f32 = ${name}Buf.data[idx];`);
            computeFunctionParams.push(`${name}: f32`);
            computeFunctionArgs.push(name);
        }

        for (const { name, length } of arrayVars) {
            bufferDecls.push(
                `@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`
            );
            arrayTypeDecls.push(`alias ${name}_Array = array<f32, ${length}>;`);
            locals.push(`  let ${name}_offset: u32 = idx * ${length}u;`);
            arrayCopyCode.push(`  var ${name}: ${name}_Array;`);
            arrayCopyCode.push(
                `  for (var i = 0u; i < ${length}u; i++) { ${name}[i] = ${name}Buf.data[${name}_offset + i]; }`
            );
            computeFunctionParams.push(`${name}: ${name}_Array`, `${name}_length: u32`);
            computeFunctionArgs.push(name, `${length}u`);
        }

        for (const { name, rows, cols, variableRows, rowsVarName } of matrixVars) {
            bufferDecls.push(
                `@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`
            );
            if (variableRows && rowsVarName) {
                bufferDecls.push(
                    `@group(0) @binding(${bindingIdx++}) var<storage, read> ${rowsVarName}Buf: ArrayF32;`
                );
                locals.push(`  let ${name}_rows: u32 = u32(${rowsVarName}Buf.data[idx]);`);
            }
            const matrixSize = rows * cols;
            arrayTypeDecls.push(`alias ${name}_Matrix = array<f32, ${matrixSize}>;`);
            locals.push(`  let ${name}_offset: u32 = idx * ${matrixSize}u;`);
            arrayCopyCode.push(`  var ${name}: ${name}_Matrix;`);
            arrayCopyCode.push(
                `  for (var i = 0u; i < ${matrixSize}u; i++) { ${name}[i] = ${name}Buf.data[${name}_offset + i]; }`
            );
            computeFunctionParams.push(
                `${name}: ${name}_Matrix`,
                `${name}_rows: u32`,
                `${name}_cols: u32`
            );
            computeFunctionArgs.push(name, variableRows ? `${name}_rows` : `${rows}u`, `${cols}u`);
        }

        for (const meta of globalMeta) {
            const packedLength = meta.kind === 'scalar'
                ? 1
                : meta.kind === 'array'
                    ? meta.length
                    : meta.rows * meta.cols;
            const packedVec4Count = Math.max(1, Math.ceil(packedLength / 4));
            const uniformStruct = `${meta.name}_Uniform`;
            bufferDecls.push(
                `struct ${uniformStruct} { data: array<vec4f, ${packedVec4Count}>; }`
            );
            bufferDecls.push(
                `@group(0) @binding(${bindingIdx++}) var<uniform> ${meta.name}Buf: ${uniformStruct};`
            );
            uniformHelpers.push(
                `fn ${meta.name}_uniform_at(index: u32) -> f32 {
                    let chunk = ${meta.name}Buf.data[index / 4u];
                    let lane = index % 4u;
                    if (lane == 0u) { return chunk.x; }
                    if (lane == 1u) { return chunk.y; }
                    if (lane == 2u) { return chunk.z; }
                    return chunk.w;
                }`
            );
            if (meta.kind === 'scalar') {
                locals.push(`  let ${meta.name}: f32 = ${meta.name}_uniform_at(0u);`);
                computeFunctionParams.push(`${meta.name}: f32`);
                computeFunctionArgs.push(meta.name);
            } else if (meta.kind === 'array') {
                arrayTypeDecls.push(`alias ${meta.name}_Array = array<f32, ${meta.length}>;`);
                arrayCopyCode.push(`  var ${meta.name}: ${meta.name}_Array;`);
                arrayCopyCode.push(
                    `  for (var i = 0u; i < ${meta.length}u; i++) { ${meta.name}[i] = ${meta.name}_uniform_at(i); }`
                );
                computeFunctionParams.push(`${meta.name}: ${meta.name}_Array`, `${meta.name}_length: u32`);
                computeFunctionArgs.push(meta.name, `${meta.length}u`);
            } else {
                const size = meta.rows * meta.cols;
                arrayTypeDecls.push(`alias ${meta.name}_Matrix = array<f32, ${size}>;`);
                arrayCopyCode.push(`  var ${meta.name}: ${meta.name}_Matrix;`);
                arrayCopyCode.push(
                    `  for (var i = 0u; i < ${size}u; i++) { ${meta.name}[i] = ${meta.name}_uniform_at(i); }`
                );
                computeFunctionParams.push(
                    `${meta.name}: ${meta.name}_Matrix`,
                    `${meta.name}_rows: u32`,
                    `${meta.name}_cols: u32`
                );
                computeFunctionArgs.push(meta.name, `${meta.rows}u`, `${meta.cols}u`);
            }
        }

        const outputBindingStart = bindingIdx;
        const multiOutput = numOutputs > 1;
        const outBufDecls = Array.from({ length: numOutputs }, (_, o) =>
            `@group(0) @binding(${outputBindingStart + o}) var<storage, read_write> out${o}Buf: ArrayF32;`
        );
        const returnType = multiOutput ? 'OutputArray' : 'f32';
        const outputTypeDecl = multiOutput ? `alias OutputArray = array<f32, ${numOutputs}>;` : '';
        const resultLines = multiOutput
            ? Array.from({ length: numOutputs }, (_, o) =>
                `            out${o}Buf.data[idx] = result[${o}];`
            ).join('\n')
            : `            out0Buf.data[idx] = result;`;

        return `
        ${structDef}
        ${outputTypeDecl}
        ${arrayTypeDecls.join('\n        ')}
        ${bufferDecls.join('\n        ')}
        ${uniformHelpers.join('\n        ')}
        ${outBufDecls.join('\n        ')}

        fn compute_value(${computeFunctionParams.join(', ')}) -> ${returnType} { ${wgslBody} }

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
            let idx: u32 = gid.x;
            if (idx >= arrayLength(&out0Buf.data)) { return; }
            ${locals.join('\n')}
            ${arrayCopyCode.join('\n')}
            let result = compute_value(${computeFunctionArgs.join(', ')});
            ${resultLines}
        }`;
    }

    private packUniformFloats(values: ArrayLike<number>): Float32Array {
        const packed = new Float32Array(Math.max(4, Math.ceil(values.length / 4) * 4));
        for (let i = 0; i < values.length; i++) {
            packed[i] = Number(values[i]) || 0;
        }
        return packed;
    }

    /**
     * Normalizes a property path to ensure it has the correct prefix.
     *
     * Paths that already start with `properties.`, `geometry.`, or equal `id`
     * are returned unchanged. All other paths are prefixed with `properties.`.
     *
     * @param path - The property path to normalize.
     * @returns Normalized path with appropriate prefix.
     * @private
     *
     * @example
     * this.normalizePropertyPath('height');           // 'properties.height'
     * this.normalizePropertyPath('properties.height'); // 'properties.height'
     * this.normalizePropertyPath('geometry.type');     // 'geometry.type'
     * this.normalizePropertyPath('id');                // 'id'
     */
    private normalizePropertyPath(path: string): string {
        return (path.startsWith('properties.') ||
            path.startsWith('geometry.') ||
            path === 'id')
            ? path
            : `properties.${path}`;
    }
}
