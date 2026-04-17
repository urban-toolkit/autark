import { FeatureCollection } from 'geojson';
import { valueAtPath, TypedArray } from 'autk-core';
import { GpuPipeline } from './compute-pipeline';
import type { GpgpuPipelineParams } from './api';
import type { GlobalVarMeta, ComputeConfig } from './types-gpgpu';

export class ComputeGpgpu extends GpuPipeline {
    /**
     * Executes a WGSL compute shader over feature properties in a single columnar GPU pass.
     *
     * @param params - Computation parameters including the feature collection and WGSL shader body.
     * @returns A new FeatureCollection with computed values written to `feature.properties.compute`.
     */
    async run(params: GpgpuPipelineParams): Promise<FeatureCollection> {
        const { collection, variableMapping, attributeArrays = {}, attributeMatrices = {}, wgslBody } = params;

        const outputColumns = params.outputColumns ?? (params.resultField ? [params.resultField] : []);
        if (outputColumns.length === 0) throw new Error('resultField or outputColumns must be provided');

        const features = collection.features ?? [];
        const featureCount = features.length;
        if (featureCount === 0) return collection;

        const { orderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars } = this.extractInputData(
            features, variableMapping, attributeArrays, attributeMatrices, featureCount,
        );
        const { globalVarNames, globalInputArrays, globalMeta } = this.extractGlobalData(params);

        const shader = this.buildShader(scalarVars, arrayVars, matrixVars, globalMeta, wgslBody, outputColumns.length);
        const allVarNames    = [...orderedVarNames, ...globalVarNames];
        const allInputArrays = { ...inputArrays, ...globalInputArrays };

        const result = await this.dispatch(allVarNames, allInputArrays, shader, featureCount, outputColumns.length);
        return this.applyResultsToFeatures(collection, features, result, outputColumns);
    }

    /**
     * Low-level compute dispatch: creates GPU buffers, runs the shader, and reads back results.
     * Exposed as `protected` to allow subclasses to build custom compute pipelines.
     */
    protected async runCompute(config: ComputeConfig): Promise<{ [outputName: string]: TypedArray }> {
        const device = await this.getDevice();
        const { shader, entryPoint = 'main', dispatchSize, inputs, outputs } = config;

        const shaderModule = device.createShaderModule({ code: shader });
        const pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint },
        });

        const inputBuffers  = new Map<string, GPUBuffer>();
        const outputBuffers = new Map<string, GPUBuffer>();
        const outputSizes   = new Map<string, number>();
        const groupEntries  = new Map<number, GPUBindGroupEntry[]>();

        for (const [name, input] of Object.entries(inputs)) {
            const group   = input.group ?? 0;
            const usage   = input.type === 'uniform'
                ? GPUBufferUsage.UNIFORM  | GPUBufferUsage.COPY_DST
                : GPUBufferUsage.STORAGE  | GPUBufferUsage.COPY_DST;
            const aligned = this.alignTo(input.data.byteLength, 4);
            const buf = this.createBuffer(device, aligned, usage, input.data);
            inputBuffers.set(name, buf);
            const entries = groupEntries.get(group) ?? [];
            entries.push({ binding: input.binding, resource: { buffer: buf } });
            groupEntries.set(group, entries);
        }

        for (const [name, output] of Object.entries(outputs)) {
            const group   = output.group ?? 0;
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
        for (const g of groups) pass.setBindGroup(g, bindGroups.get(g)!);
        pass.dispatchWorkgroups(dispatchSize[0] ?? 1, dispatchSize[1] ?? 1, dispatchSize[2] ?? 1);
        pass.end();

        for (const [key, buf] of outputBuffers) {
            const size    = outputSizes.get(key)!;
            const staging = this.createStagingBuffer(device, size);
            stagingBuffers.set(key, staging);
            encoder.copyBufferToBuffer(buf, 0, staging, 0, size);
        }

        device.queue.submit([encoder.finish()]);

        // Read back all outputs (sequentially — GPU serialises anyway).
        const result: { [outputName: string]: TypedArray } = {};
        for (const [key, staging] of stagingBuffers) {
            const cfg  = outputs[key];
            const Ctor = cfg.arrayType ?? Uint8Array;
            result[key] = await this.mapReadBuffer(staging, Ctor as new (ab: ArrayBuffer) => TypedArray);
        }

        for (const buf of inputBuffers.values())  buf.destroy();
        for (const buf of outputBuffers.values()) buf.destroy();

        return result;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Builds the `runCompute` config and dispatches. */
    private async dispatch(
        orderedVarNames: string[],
        inputArrays: { [varName: string]: Float32Array },
        shader: string,
        featureCount: number,
        numOutputs: number,
    ) {
        const inputs: ComputeConfig['inputs'] = {};
        orderedVarNames.forEach((varName, idx) => {
            inputs[varName] = { type: 'storage', data: inputArrays[varName], binding: idx };
        });

        const outputs: ComputeConfig['outputs'] = {};
        for (let o = 0; o < numOutputs; o++) {
            outputs[`out${o}`] = { size: featureCount * 4, binding: orderedVarNames.length + o, arrayType: Float32Array };
        }

        return this.runCompute({ shader, dispatchSize: [Math.ceil(featureCount / 64), 1, 1], inputs, outputs });
    }

    private extractInputData(
        features: any[],
        variableMapping: Record<string, string>,
        arrayVariables: Record<string, number>,
        matrixVariables: Record<string, { rows: number | 'auto'; cols: number }>,
        featureCount: number,
    ) {
        const orderedVarNames = Object.keys(variableMapping);
        const extraVarNames: string[] = [];
        const inputArrays: { [varName: string]: Float32Array } = {};
        const scalarVars: string[] = [];
        const arrayVars: Array<{ name: string; length: number }> = [];
        const matrixVars: Array<{ name: string; rows: number; cols: number; variableRows?: boolean; rowsVarName?: string }> = [];

        const accessors = orderedVarNames.map(varName => {
            const path   = this.normalizePropertyPath(variableMapping[varName]);
            const parts  = path.split('.');
            const isArray  = varName in arrayVariables;
            const isMatrix = varName in matrixVariables;
            let kind: 'scalar' | 'array' | 'matrix_fixed' | 'matrix_auto' = 'scalar';
            let cols = 0, rows = 0, length = 0;
            if (isMatrix) {
                const m = matrixVariables[varName];
                cols = m.cols;
                if (m.rows === 'auto') kind = 'matrix_auto';
                else { kind = 'matrix_fixed'; rows = m.rows as number; }
            } else if (isArray) {
                kind = 'array';
                length = arrayVariables[varName];
            }
            return { varName, path, parts, kind, cols, rows, length, maxRows: 0, actualRows: new Float32Array(featureCount) };
        });

        // Pass 1: resolve max row count for auto-sized matrices.
        for (let i = 0; i < featureCount; i++) {
            const feat = features[i];
            for (const acc of accessors) {
                if (acc.kind === 'matrix_auto') {
                    const val = valueAtPath(feat, acc.path);
                    const len = Array.isArray(val) ? val.length : 0;
                    acc.actualRows[i] = len;
                    if (len > acc.maxRows) acc.maxRows = len;
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
                extraVarNames.push(rowsVarName);
                matrixVars.push({ name: acc.varName, rows: acc.maxRows, cols: acc.cols, variableRows: true, rowsVarName });
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
                    const rCount      = acc.kind === 'matrix_fixed' ? acc.rows : acc.maxRows;
                    const sourceMatrix = Array.isArray(val) ? val : [];
                    const offset       = i * rCount * acc.cols;
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
        for (const av of arrayVars) reorderedVarNames.push(av.name);
        for (const mv of matrixVars) {
            reorderedVarNames.push(mv.name);
            if (mv.variableRows && mv.rowsVarName) reorderedVarNames.push(mv.rowsVarName);
        }

        return { orderedVarNames: reorderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars };
    }

    private extractGlobalData(params: GpgpuPipelineParams) {
        const { uniforms = {}, uniformArrays = {}, uniformMatrices = {} } = params;
        const globalVarNames: string[] = [];
        const globalInputArrays: { [varName: string]: Float32Array } = {};
        const globalMeta: GlobalVarMeta[] = [];

        for (const [name, value] of Object.entries(uniforms)) {
            globalInputArrays[name] = new Float32Array([Number.isFinite(value) ? value : 0]);
            globalMeta.push({ kind: 'scalar', name });
            globalVarNames.push(name);
        }

        for (const [name, data] of Object.entries(uniformArrays)) {
            globalInputArrays[name] = new Float32Array(data.map(v => Number.isFinite(Number(v)) ? Number(v) : 0));
            globalMeta.push({ kind: 'array', name, length: data.length });
            globalVarNames.push(name);
        }

        for (const [name, { data, cols }] of Object.entries(uniformMatrices)) {
            const rows = data.length;
            const buf  = new Float32Array(rows * cols);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const v = Number(data[r]?.[c] ?? 0);
                    buf[r * cols + c] = Number.isFinite(v) ? v : 0;
                }
            }
            globalInputArrays[name] = buf;
            globalMeta.push({ kind: 'matrix', name, rows, cols });
            globalVarNames.push(name);
        }

        return { globalVarNames, globalInputArrays, globalMeta };
    }

    private applyResultsToFeatures(
        geojson: FeatureCollection,
        features: any[],
        result: { [outputName: string]: any },
        outputColumns: string[],
    ): FeatureCollection {
        const newFeatures = features.map((f: any, i: number) => {
            const properties   = f.properties ? { ...f.properties } : {};
            const computeProps = properties.compute ? { ...properties.compute } : {};
            outputColumns.forEach((col, o) => { computeProps[col] = (result[`out${o}`] as Float32Array)[i]; });
            properties.compute = computeProps;
            return { ...f, properties };
        });
        return { ...geojson, features: newFeatures } as FeatureCollection;
    }

    private buildShader(
        scalarVars: string[],
        arrayVars: Array<{ name: string; length: number }>,
        matrixVars: Array<{ name: string; rows: number; cols: number; variableRows?: boolean; rowsVarName?: string }>,
        globalMeta: GlobalVarMeta[],
        wgslBody: string,
        numOutputs: number,
    ): string {
        let bindingIdx = 0;
        const bufferDecls:          string[] = [];
        const locals:               string[] = [];
        const arrayCopyCode:        string[] = [];
        const computeFunctionParams: string[] = [];
        const computeFunctionArgs:  string[] = [];
        const arrayTypeDecls:       string[] = [];

        const structDef = `struct ArrayF32 { data: array<f32> }`;

        for (const name of scalarVars) {
            bufferDecls.push(`@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`);
            locals.push(`  let ${name}: f32 = ${name}Buf.data[idx];`);
            computeFunctionParams.push(`${name}: f32`);
            computeFunctionArgs.push(name);
        }

        for (const { name, length } of arrayVars) {
            bufferDecls.push(`@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`);
            arrayTypeDecls.push(`alias ${name}_Array = array<f32, ${length}>;`);
            locals.push(`  let ${name}_offset: u32 = idx * ${length}u;`);
            arrayCopyCode.push(`  var ${name}: ${name}_Array;`);
            arrayCopyCode.push(`  for (var i = 0u; i < ${length}u; i++) { ${name}[i] = ${name}Buf.data[${name}_offset + i]; }`);
            computeFunctionParams.push(`${name}: ${name}_Array`, `${name}_length: u32`);
            computeFunctionArgs.push(name, `${length}u`);
        }

        for (const { name, rows, cols, variableRows, rowsVarName } of matrixVars) {
            bufferDecls.push(`@group(0) @binding(${bindingIdx++}) var<storage, read> ${name}Buf: ArrayF32;`);
            if (variableRows && rowsVarName) {
                bufferDecls.push(`@group(0) @binding(${bindingIdx++}) var<storage, read> ${rowsVarName}Buf: ArrayF32;`);
                locals.push(`  let ${name}_rows: u32 = u32(${rowsVarName}Buf.data[idx]);`);
            }
            const matrixSize = rows * cols;
            arrayTypeDecls.push(`alias ${name}_Matrix = array<f32, ${matrixSize}>;`);
            locals.push(`  let ${name}_offset: u32 = idx * ${matrixSize}u;`);
            arrayCopyCode.push(`  var ${name}: ${name}_Matrix;`);
            arrayCopyCode.push(`  for (var i = 0u; i < ${matrixSize}u; i++) { ${name}[i] = ${name}Buf.data[${name}_offset + i]; }`);
            computeFunctionParams.push(`${name}: ${name}_Matrix`, `${name}_rows: u32`, `${name}_cols: u32`);
            computeFunctionArgs.push(name, variableRows ? `${name}_rows` : `${rows}u`, `${cols}u`);
        }

        for (const meta of globalMeta) {
            bufferDecls.push(`@group(0) @binding(${bindingIdx++}) var<storage, read> ${meta.name}Buf: ArrayF32;`);
            if (meta.kind === 'scalar') {
                locals.push(`  let ${meta.name}: f32 = ${meta.name}Buf.data[0u];`);
                computeFunctionParams.push(`${meta.name}: f32`);
                computeFunctionArgs.push(meta.name);
            } else if (meta.kind === 'array') {
                arrayTypeDecls.push(`alias ${meta.name}_Array = array<f32, ${meta.length}>;`);
                arrayCopyCode.push(`  var ${meta.name}: ${meta.name}_Array;`);
                arrayCopyCode.push(`  for (var i = 0u; i < ${meta.length}u; i++) { ${meta.name}[i] = ${meta.name}Buf.data[i]; }`);
                computeFunctionParams.push(`${meta.name}: ${meta.name}_Array`, `${meta.name}_length: u32`);
                computeFunctionArgs.push(meta.name, `${meta.length}u`);
            } else {
                const size = meta.rows * meta.cols;
                arrayTypeDecls.push(`alias ${meta.name}_Matrix = array<f32, ${size}>;`);
                arrayCopyCode.push(`  var ${meta.name}: ${meta.name}_Matrix;`);
                arrayCopyCode.push(`  for (var i = 0u; i < ${size}u; i++) { ${meta.name}[i] = ${meta.name}Buf.data[i]; }`);
                computeFunctionParams.push(`${meta.name}: ${meta.name}_Matrix`, `${meta.name}_rows: u32`, `${meta.name}_cols: u32`);
                computeFunctionArgs.push(meta.name, `${meta.rows}u`, `${meta.cols}u`);
            }
        }

        const outputBindingStart = bindingIdx;
        const multiOutput  = numOutputs > 1;
        const outBufDecls  = Array.from({ length: numOutputs }, (_, o) =>
            `@group(0) @binding(${outputBindingStart + o}) var<storage, read_write> out${o}Buf: ArrayF32;`);
        const returnType     = multiOutput ? 'OutputArray' : 'f32';
        const outputTypeDecl = multiOutput ? `alias OutputArray = array<f32, ${numOutputs}>;` : '';
        const resultLines    = multiOutput
            ? Array.from({ length: numOutputs }, (_, o) => `            out${o}Buf.data[idx] = result[${o}];`).join('\n')
            : `            out0Buf.data[idx] = result;`;

        return `
        ${structDef}
        ${outputTypeDecl}
        ${arrayTypeDecls.join('\n        ')}
        ${bufferDecls.join('\n        ')}
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

    private normalizePropertyPath(path: string): string {
        return (path.startsWith('properties.') || path.startsWith('geometry.') || path === 'id')
            ? path
            : `properties.${path}`;
    }
}
