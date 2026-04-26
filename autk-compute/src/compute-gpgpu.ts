/**
 * @module AutkComputeGpgpu
 * GeoJSON-to-WGSL compute pipeline for feature-level GPU analysis.
 *
 * This module defines `ComputeGpgpu`, which packs feature data into GPU
 * buffers, generates a compute shader, and writes results back to
 * `feature.properties.compute`.
 */

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

const WGSL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WGSL_RESERVED_WORDS = new Set([
    'array', 'atomic', 'bitcast', 'bool', 'break', 'case', 'const', 'continue', 'continuing',
    'default', 'discard', 'else', 'enable', 'f16', 'f32', 'false', 'fn', 'for', 'if', 'i32',
    'let', 'loop', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2',
    'mat4x3', 'mat4x4', 'override', 'private', 'ptr', 'return', 'sampler', 'sampler_comparison',
    'storage', 'struct', 'switch', 'texture_1d', 'texture_2d', 'texture_2d_array', 'texture_3d',
    'texture_cube', 'texture_cube_array', 'texture_depth_2d', 'texture_depth_2d_array',
    'texture_depth_cube', 'texture_depth_cube_array', 'texture_depth_multisampled_2d',
    'texture_external', 'texture_multisampled_2d', 'texture_storage_1d', 'texture_storage_2d',
    'texture_storage_2d_array', 'texture_storage_3d', 'true', 'type', 'u32', 'uniform', 'var',
    'vec2', 'vec2f', 'vec2h', 'vec2i', 'vec2u', 'vec3', 'vec3f', 'vec3h', 'vec3i', 'vec3u',
    'vec4', 'vec4f', 'vec4h', 'vec4i', 'vec4u', 'while', '_',
]);
const INTERNAL_WGSL_SYMBOLS = new Set(['ArrayF32', 'OutputArray', 'compute_value', 'main', 'idx', 'id', 'i']);

/**
 * GPGPU compute engine for feature-level GeoJSON analysis.
 *
 * `ComputeGpgpu` converts collection data into GPU inputs, builds a compute
 * shader around the user body, and writes the results into a copied feature
 * collection.
 */
export class ComputeGpgpu extends GpuPipeline {
    /**
     * Executes a WGSL compute shader over a feature collection.
     *
     * @param params Compute parameters.
     * @param params.collection Source GeoJSON feature collection.
     * @param params.variableMapping WGSL variable-to-property mapping.
     * @param params.wgslBody WGSL function body.
     * @param params.resultField Output field name for single-value results.
     * @param params.outputColumns Output field names for multi-value results.
     * @returns Promise resolving to a copied collection with results in `feature.properties.compute`.
     * @throws If neither `resultField` nor `outputColumns` is provided.
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

        this.validateShaderIdentifiers(params);

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
     * Runs a prepared compute configuration and reads back typed output buffers.
     *
     * @param config Compute configuration.
     * @param config.shader WGSL shader source code.
     * @param config.entryPoint Shader entry point.
     * @param config.dispatchSize Workgroup dispatch dimensions.
     * @param config.inputs Named input buffers.
     * @param config.outputs Named output buffers.
     * @returns Output names mapped to readback typed arrays.
     * @protected
     */
    protected async runCompute(config: ComputeConfig): Promise<{ [outputName: string]: TypedArray }> {
        const device = await this.getDevice();
        const { shader, entryPoint = 'main', dispatchSize, inputs, outputs } = config;

        const inputBuffers = new Map<string, GPUBuffer>();
        const outputBuffers = new Map<string, GPUBuffer>();
        const stagingBuffers = new Map<string, GPUBuffer>();
        try {
            const shaderModule = device.createShaderModule({ code: shader });
            const pipeline = device.createComputePipeline({
                layout: 'auto',
                compute: { module: shaderModule, entryPoint },
            });

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

            const result: Record<string, TypedArray> = {};
            for (const [key, staging] of stagingBuffers) {
                const cfg = outputs[key];
                const Ctor = cfg.arrayType ?? Uint8Array;
                result[key] = await this.mapReadBuffer(staging, Ctor as new (ab: ArrayBuffer) => TypedArray);
            }

            return result;
        } finally {
            for (const buf of stagingBuffers.values()) {
                buf.destroy();
            }
            for (const buf of inputBuffers.values()) {
                buf.destroy();
            }
            for (const buf of outputBuffers.values()) {
                buf.destroy();
            }
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Builds a compute dispatch from packed inputs and generated shader code.
     *
     * @param featureVarNames Ordered feature-variable names.
     * @param globalVarNames Ordered global-variable names.
     * @param inputArrays Packed input buffers keyed by variable name.
     * @param shader Complete WGSL shader source code.
     * @param featureCount Number of features to dispatch.
     * @param numOutputs Number of output columns.
     * @returns Output names mapped to `Float32Array` results.
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
     * Validates user-facing WGSL names before shader generation.
     *
     * @param params Pipeline parameters to validate.
     */
    private validateShaderIdentifiers(params: GpgpuPipelineParams): void {
        const {
            variableMapping,
            attributeArrays = {},
            attributeMatrices = {},
            uniforms = {},
            uniformArrays = {},
            uniformMatrices = {},
        } = params;

        const featureNames = Object.keys(variableMapping);
        const globalNames = [
            ...Object.keys(uniforms),
            ...Object.keys(uniformArrays),
            ...Object.keys(uniformMatrices),
        ];

        for (const name of featureNames) {
            this.validateWgslIdentifier(name, 'variableMapping');
        }
        for (const name of globalNames) {
            const context = name in uniforms
                ? 'uniforms'
                : name in uniformArrays
                    ? 'uniformArrays'
                    : 'uniformMatrices';
            this.validateWgslIdentifier(name, context);
        }

        const claimedSymbols = new Map<string, string>();
        for (const symbol of INTERNAL_WGSL_SYMBOLS) {
            claimedSymbols.set(symbol, 'internal WGSL symbol');
        }

        for (const name of featureNames) {
            const kind = name in attributeMatrices
                ? 'matrix'
                : name in attributeArrays
                    ? 'array'
                    : 'scalar';
            this.claimGeneratedSymbols(claimedSymbols, this.getFeatureGeneratedSymbols(name, kind), `feature "${name}"`);
        }

        for (const name of Object.keys(uniforms)) {
            this.claimGeneratedSymbols(claimedSymbols, this.getGlobalGeneratedSymbols(name, 'scalar'), `uniform "${name}"`);
        }
        for (const name of Object.keys(uniformArrays)) {
            this.claimGeneratedSymbols(claimedSymbols, this.getGlobalGeneratedSymbols(name, 'array'), `uniform array "${name}"`);
        }
        for (const name of Object.keys(uniformMatrices)) {
            this.claimGeneratedSymbols(claimedSymbols, this.getGlobalGeneratedSymbols(name, 'matrix'), `uniform matrix "${name}"`);
        }
    }

    /**
     * Validates that a string is a legal WGSL identifier.
     *
     * @param name Candidate WGSL identifier.
     * @param context Identifier source used in error messages.
     */
    private validateWgslIdentifier(name: string, context: string): void {
        if (!WGSL_IDENTIFIER_PATTERN.test(name)) {
            throw new Error(`ComputeGpgpu: invalid WGSL identifier "${name}" in ${context}.`);
        }
        if (WGSL_RESERVED_WORDS.has(name)) {
            throw new Error(`ComputeGpgpu: WGSL identifier "${name}" is reserved and cannot be used in ${context}.`);
        }
    }

    /**
     * Reserves generated WGSL symbols and rejects collisions.
     *
     * @param claimedSymbols Shared registry of already claimed symbols.
     * @param symbols Newly generated symbols to reserve.
     * @param owner Owner label used in collision errors.
     */
    private claimGeneratedSymbols(
        claimedSymbols: Map<string, string>,
        symbols: string[],
        owner: string,
    ): void {
        for (const symbol of symbols) {
            const existingOwner = claimedSymbols.get(symbol);
            if (existingOwner) {
                throw new Error(
                    `ComputeGpgpu: generated WGSL symbol collision for "${symbol}" between ${existingOwner} and ${owner}.`
                );
            }
            claimedSymbols.set(symbol, owner);
        }
    }

    /**
     * Returns the WGSL helper symbols generated for a feature variable.
     *
     * @param name Variable name.
     * @param kind Variable shape used by the shader builder.
     * @returns Generated symbol names for the feature variable.
     */
    private getFeatureGeneratedSymbols(name: string, kind: 'scalar' | 'array' | 'matrix'): string[] {
        const symbols = [name, `${name}Buf`];
        if (kind !== 'scalar') {
            symbols.push(`${name}_offset`);
        }
        if (kind === 'array') {
            symbols.push(`${name}_Array`, `${name}_length`);
        } else if (kind === 'matrix') {
            const rowsVarName = `${name}__varrows`;
            symbols.push(`${name}_Matrix`, `${name}_rows`, `${name}_cols`, rowsVarName, `${rowsVarName}Buf`);
        }
        return symbols;
    }

    /**
     * Returns the WGSL helper symbols generated for a global variable.
     *
     * @param name Variable name.
     * @param kind Variable shape used by the shader builder.
     * @returns Generated symbol names for the global variable.
     */
    private getGlobalGeneratedSymbols(name: string, kind: 'scalar' | 'array' | 'matrix'): string[] {
        const symbols = [name, `${name}Buf`, `${name}_Uniform`, `${name}_uniform_at`];
        if (kind === 'array') {
            symbols.push(`${name}_Array`, `${name}_length`);
        } else if (kind === 'matrix') {
            symbols.push(`${name}_Matrix`, `${name}_rows`, `${name}_cols`);
        }
        return symbols;
    }

    /**
     * Extracts and flattens per-feature input data into columnar typed arrays.
     *
     * @param features Source features to read from.
     * @param variableMapping Maps WGSL variable names to property paths.
     * @param arrayVariables Per-feature array lengths keyed by variable name.
     * @param matrixVariables Per-feature matrix definitions keyed by variable name.
     * @param featureCount Total number of features in the dispatch.
     * @returns Packed input arrays, ordered variable names, and shader metadata.
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
     * @param params Pipeline parameters containing uniform definitions.
     * @returns Ordered global variable names, packed input arrays, and shader metadata.
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
     * @param geojson Original FeatureCollection used as the base for the return value.
     * @param features Features that were dispatched to the GPU.
     * @param result Computed output arrays read back from the GPU.
     * @param outputColumns Output field names aligned with `out0`, `out1`, and so on.
     * @returns New FeatureCollection with results written to `feature.properties.compute`.
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
     * @param scalarVars Scalar variable names.
     * @param arrayVars Array variable metadata.
     * @param matrixVars Matrix variable metadata.
     * @param globalMeta Global uniform metadata.
     * @param wgslBody User-provided WGSL function body.
     * @param numOutputs Number of output columns.
     * @returns Complete WGSL shader source code.
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
                `struct ${uniformStruct} { data: array<vec4f, ${packedVec4Count}>, }`
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

    /**
     * Packs uniform values into a `vec4`-aligned float buffer.
     *
     * @param values Numeric values to pack.
     * @returns Padded `Float32Array` ready for uniform upload.
     */
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
     * @param path Property path to normalize.
     * @returns Normalized path with the expected prefix.
     */
    private normalizePropertyPath(path: string): string {
        return (path.startsWith('properties.') ||
            path.startsWith('geometry.') ||
            path === 'id')
            ? path
            : `properties.${path}`;
    }
}
