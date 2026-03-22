import { FeatureCollection } from 'geojson';
import { compute } from '../../../shared/compute';
import { ComputeFunctionIntoPropertiesParams } from '../../interfaces';

type GlobalVarMeta =
  | { kind: 'scalar'; name: string }
  | { kind: 'array';  name: string; length: number }
  | { kind: 'matrix'; name: string; rows: number; cols: number };

export class ComputeFunctionIntoPropertiesUseCase {
  async exec(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
    const {
      geojson,
      attributes,
      attributeArrays = {},
      attributeMatrices = {},
      wglsFunction,
    } = params;

    const outputColumns = params.outputColumns ?? (params.outputColumnName ? [params.outputColumnName] : []);
    if (outputColumns.length === 0) throw new Error('outputColumnName or outputColumns must be provided');

    const features = geojson.features ?? [];
    const featureCount = features.length;
    if (featureCount === 0) return geojson;

    // Extract per-feature input data
    const { orderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars } = this.extractInputData(
      features,
      attributes,
      attributeArrays,
      attributeMatrices,
      featureCount,
    );

    // Extract global (shared) input data
    const { globalVarNames, globalInputArrays, globalMeta } = this.extractGlobalData(params);

    // Build shader and run GPU computation
    const shader = this.buildShader(scalarVars, arrayVars, matrixVars, globalMeta, wglsFunction, outputColumns.length);

    const allVarNames  = [...orderedVarNames,  ...globalVarNames];
    const allInputArrays = { ...inputArrays, ...globalInputArrays };

    const result = await this.runComputation(allVarNames, allInputArrays, shader, featureCount, outputColumns.length);

    return this.applyResultsToFeatures(geojson, features, result, outputColumns);
  }

  // ── Per-feature data extraction ──────────────────────────────────────────────

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

    for (const varName of orderedVarNames) {
      const path = this.normalizePropertyPath(variableMapping[varName]);
      const isArray = varName in arrayVariables;
      const isMatrix = varName in matrixVariables;

      if (isMatrix) {
        const { rows, cols } = matrixVariables[varName];
        const isAutoRows = rows === 'auto';
        let maxRows: number;
        let actualRowCounts: Float32Array | null = null;

        if (isAutoRows) {
          const sourceData: any[][] = new Array(featureCount);
          actualRowCounts = new Float32Array(featureCount);
          maxRows = 0;
          for (let i = 0; i < featureCount; i++) {
            const value = this.readPathValue(features[i], path);
            sourceData[i] = Array.isArray(value) ? value : [];
            actualRowCounts[i] = sourceData[i].length;
            if (sourceData[i].length > maxRows) maxRows = sourceData[i].length;
          }
          const matrixSize = maxRows * cols;
          const values = new Float32Array(featureCount * matrixSize);
          for (let featureIdx = 0; featureIdx < featureCount; featureIdx++) {
            const sourceMatrix = sourceData[featureIdx];
            for (let row = 0; row < maxRows; row++) {
              const sourceRow = Array.isArray(sourceMatrix[row]) ? sourceMatrix[row] : [];
              for (let col = 0; col < cols; col++) {
                const offset = featureIdx * matrixSize + row * cols + col;
                const val = col < sourceRow.length ? Number(sourceRow[col]) : 0;
                values[offset] = Number.isFinite(val) ? val : 0;
              }
            }
          }
          inputArrays[varName] = values;
          const rowsVarName = `${varName}__varrows`;
          inputArrays[rowsVarName] = actualRowCounts;
          extraVarNames.push(rowsVarName);
          matrixVars.push({ name: varName, rows: maxRows, cols, variableRows: true, rowsVarName });
        } else {
          maxRows = rows as number;
          const matrixSize = maxRows * cols;
          const values = new Float32Array(featureCount * matrixSize);
          for (let featureIdx = 0; featureIdx < featureCount; featureIdx++) {
            const value = this.readPathValue(features[featureIdx], path);
            const sourceMatrix = Array.isArray(value) ? value : [];
            for (let row = 0; row < maxRows; row++) {
              const sourceRow = Array.isArray(sourceMatrix[row]) ? sourceMatrix[row] : [];
              for (let col = 0; col < cols; col++) {
                const offset = featureIdx * matrixSize + row * cols + col;
                const val = col < sourceRow.length ? Number(sourceRow[col]) : 0;
                values[offset] = Number.isFinite(val) ? val : 0;
              }
            }
          }
          inputArrays[varName] = values;
          matrixVars.push({ name: varName, rows: maxRows, cols });
        }
      } else if (isArray) {
        const arrayLength = arrayVariables[varName];
        const values = new Float32Array(featureCount * arrayLength);
        for (let featureIdx = 0; featureIdx < featureCount; featureIdx++) {
          const value = this.readPathValue(features[featureIdx], path);
          const sourceArray = Array.isArray(value) ? value : [];
          for (let elemIdx = 0; elemIdx < arrayLength; elemIdx++) {
            const offset = featureIdx * arrayLength + elemIdx;
            const val = elemIdx < sourceArray.length ? Number(sourceArray[elemIdx]) : 0;
            values[offset] = Number.isFinite(val) ? val : 0;
          }
        }
        inputArrays[varName] = values;
        arrayVars.push({ name: varName, length: arrayLength });
      } else {
        const values = new Float32Array(featureCount);
        for (let i = 0; i < featureCount; i++) {
          const value = this.readPathValue(features[i], path);
          const numeric = Number(value);
          values[i] = Number.isFinite(numeric) ? numeric : 0;
        }
        inputArrays[varName] = values;
        scalarVars.push(varName);
      }
    }

    // Reorder: scalars → arrays → (matrix, matrix_rows)*
    const reorderedVarNames: string[] = [...scalarVars];
    for (const av of arrayVars) reorderedVarNames.push(av.name);
    for (const mv of matrixVars) {
      reorderedVarNames.push(mv.name);
      if (mv.variableRows && mv.rowsVarName) reorderedVarNames.push(mv.rowsVarName);
    }

    return { orderedVarNames: reorderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars };
  }

  // ── Global (shared) data extraction ─────────────────────────────────────────

  private extractGlobalData(params: ComputeFunctionIntoPropertiesParams): {
    globalVarNames: string[];
    globalInputArrays: { [varName: string]: Float32Array };
    globalMeta: GlobalVarMeta[];
  } {
    const { uniforms = {}, uniformArrays = {}, uniformMatrices = {} } = params;
    const globalVarNames: string[] = [];
    const globalInputArrays: { [varName: string]: Float32Array } = {};
    const globalMeta: GlobalVarMeta[] = [];

    for (const [name, value] of Object.entries(uniforms)) {
      const buf = new Float32Array(1);
      buf[0] = Number.isFinite(value) ? value : 0;
      globalInputArrays[name] = buf;
      globalMeta.push({ kind: 'scalar', name });
      globalVarNames.push(name);
    }

    for (const [name, data] of Object.entries(uniformArrays)) {
      const buf = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const v = Number(data[i]);
        buf[i] = Number.isFinite(v) ? v : 0;
      }
      globalInputArrays[name] = buf;
      globalMeta.push({ kind: 'array', name, length: data.length });
      globalVarNames.push(name);
    }

    for (const [name, { data, cols }] of Object.entries(uniformMatrices)) {
      const rows = data.length;
      const buf = new Float32Array(rows * cols);
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

  // ── GPU execution ────────────────────────────────────────────────────────────

  private async runComputation(
    orderedVarNames: string[],
    inputArrays: { [varName: string]: Float32Array },
    shader: string,
    featureCount: number,
    numOutputs: number,
  ) {
    const inputs: any = {};
    orderedVarNames.forEach((varName, idx) => {
      inputs[varName] = {
        type: 'storage',
        data: inputArrays[varName],
        binding: idx,
        group: 0,
      };
    });

    const outputs: any = {};
    for (let o = 0; o < numOutputs; o++) {
      outputs[`out${o}`] = {
        size: featureCount * 4,
        binding: orderedVarNames.length + o,
        group: 0,
        arrayType: Float32Array,
      };
    }

    const workgroupSize = 64;
    const xGroups = Math.ceil(featureCount / workgroupSize);

    return await compute.run({
      shader,
      dispatchSize: [xGroups, 1, 1],
      inputs,
      outputs,
    });
  }

  private applyResultsToFeatures(
    geojson: FeatureCollection,
    features: any[],
    result: { [outputName: string]: any },
    outputColumns: string[],
  ): FeatureCollection {
    const newFeatures = features.map((f: any, i: number) => {
      const properties = f.properties ? { ...f.properties } : {};
      const computeProps = properties.compute ? { ...properties.compute } : {};
      outputColumns.forEach((col, o) => {
        computeProps[col] = (result[`out${o}`] as Float32Array)[i];
      });
      properties.compute = computeProps;
      return { ...f, properties };
    });
    return { ...(geojson as any), features: newFeatures as any };
  }

  // ── Shader generation ────────────────────────────────────────────────────────

  private buildShader(
    scalarVars: string[],
    arrayVars: Array<{ name: string; length: number }>,
    matrixVars: Array<{ name: string; rows: number; cols: number; variableRows?: boolean; rowsVarName?: string }>,
    globalMeta: GlobalVarMeta[],
    wglsFunction: string,
    numOutputs: number,
  ): string {
    let bindingIdx = 0;
    const bufferDecls: string[] = [];
    const locals: string[] = [];
    const arrayCopyCode: string[] = [];
    const computeFunctionParams: string[] = [];
    const computeFunctionArgs: string[] = [];
    const arrayTypeDecls: string[] = [];

    const structDef = `struct ArrayF32 {
            data: array<f32>
        }`;

    // ── Per-feature scalars ──────────────────────────────────────────────────
    for (const name of scalarVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
      locals.push(`  let ${name}: f32 = ${name}Buf.data[idx];`);
      computeFunctionParams.push(`${name}: f32`);
      computeFunctionArgs.push(name);
      bindingIdx++;
    }

    // ── Per-feature arrays ───────────────────────────────────────────────────
    for (const { name, length } of arrayVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
      arrayTypeDecls.push(`alias ${name}_Array = array<f32, ${length}>;`);
      locals.push(`  let ${name}_offset: u32 = idx * ${length}u;`);
      arrayCopyCode.push(`  var ${name}: ${name}_Array;`);
      arrayCopyCode.push(`  for (var i = 0u; i < ${length}u; i++) {`);
      arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[${name}_offset + i];`);
      arrayCopyCode.push(`  }`);
      computeFunctionParams.push(`${name}: ${name}_Array`);
      computeFunctionParams.push(`${name}_length: u32`);
      computeFunctionArgs.push(name);
      computeFunctionArgs.push(`${length}u`);
      bindingIdx++;
    }

    // ── Per-feature matrices ─────────────────────────────────────────────────
    for (const { name, rows, cols, variableRows, rowsVarName } of matrixVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
      bindingIdx++;
      if (variableRows && rowsVarName) {
        bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${rowsVarName}Buf: ArrayF32;`);
        locals.push(`  let ${name}_rows: u32 = u32(${rowsVarName}Buf.data[idx]);`);
        bindingIdx++;
      }
      const matrixSize = rows * cols;
      arrayTypeDecls.push(`alias ${name}_Matrix = array<f32, ${matrixSize}>;`);
      locals.push(`  let ${name}_offset: u32 = idx * ${matrixSize}u;`);
      arrayCopyCode.push(`  var ${name}: ${name}_Matrix;`);
      arrayCopyCode.push(`  for (var i = 0u; i < ${matrixSize}u; i++) {`);
      arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[${name}_offset + i];`);
      arrayCopyCode.push(`  }`);
      computeFunctionParams.push(`${name}: ${name}_Matrix`);
      computeFunctionParams.push(`${name}_rows: u32`);
      computeFunctionParams.push(`${name}_cols: u32`);
      computeFunctionArgs.push(name);
      computeFunctionArgs.push(variableRows ? `${name}_rows` : `${rows}u`);
      computeFunctionArgs.push(`${cols}u`);
    }

    // ── Global (shared) variables — uploaded once, no per-feature stride ─────
    for (const meta of globalMeta) {
      if (meta.kind === 'scalar') {
        const { name } = meta;
        bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
        locals.push(`  let ${name}: f32 = ${name}Buf.data[0u];`);
        computeFunctionParams.push(`${name}: f32`);
        computeFunctionArgs.push(name);
        bindingIdx++;
      } else if (meta.kind === 'array') {
        const { name, length } = meta;
        bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
        arrayTypeDecls.push(`alias ${name}_Array = array<f32, ${length}>;`);
        arrayCopyCode.push(`  var ${name}: ${name}_Array;`);
        arrayCopyCode.push(`  for (var i = 0u; i < ${length}u; i++) {`);
        arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[i];`);   // no idx offset
        arrayCopyCode.push(`  }`);
        computeFunctionParams.push(`${name}: ${name}_Array`);
        computeFunctionParams.push(`${name}_length: u32`);
        computeFunctionArgs.push(name);
        computeFunctionArgs.push(`${length}u`);
        bindingIdx++;
      } else {
        const { name, rows, cols } = meta;
        const matrixSize = rows * cols;
        bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
        arrayTypeDecls.push(`alias ${name}_Matrix = array<f32, ${matrixSize}>;`);
        arrayCopyCode.push(`  var ${name}: ${name}_Matrix;`);
        arrayCopyCode.push(`  for (var i = 0u; i < ${matrixSize}u; i++) {`);
        arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[i];`);   // no idx offset
        arrayCopyCode.push(`  }`);
        computeFunctionParams.push(`${name}: ${name}_Matrix`);
        computeFunctionParams.push(`${name}_rows: u32`);
        computeFunctionParams.push(`${name}_cols: u32`);
        computeFunctionArgs.push(name);
        computeFunctionArgs.push(`${rows}u`);
        computeFunctionArgs.push(`${cols}u`);
        bindingIdx++;
      }
    }

    const outputBindingStart = bindingIdx;
    const multiOutput = numOutputs > 1;

    // Output buffer declarations
    const outBufDecls = multiOutput
      ? Array.from({ length: numOutputs }, (_, o) =>
          `@group(0) @binding(${outputBindingStart + o}) var<storage, read_write> out${o}Buf: ArrayF32;`)
      : [`@group(0) @binding(${outputBindingStart}) var<storage, read_write> out0Buf: ArrayF32;`];

    // Return type: f32 for single output, OutputArray for multiple
    const returnType = multiOutput ? 'OutputArray' : 'f32';
    const outputTypeDecl = multiOutput ? `alias OutputArray = array<f32, ${numOutputs}>;` : '';

    // Result distribution in main()
    const resultLines = multiOutput
      ? Array.from({ length: numOutputs }, (_, o) => `            out${o}Buf.data[idx] = result[${o}];`).join('\n')
      : `            out0Buf.data[idx] = result;`;

    // Bounds check uses first output buffer
    return `
        ${structDef}
        ${outputTypeDecl}
        ${arrayTypeDecls.join('\n        ')}

        ${bufferDecls.join('\n        ')}
        ${outBufDecls.join('\n        ')}

        fn compute_value(${computeFunctionParams.join(', ')}) -> ${returnType} {
            ${wglsFunction}
        }

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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private normalizePropertyPath(path: string): string {
    if (path.startsWith('properties.') || path.startsWith('geometry.') || path === 'id') {
      return path;
    }
    return `properties.${path}`;
  }

  private readPathValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: any = obj as any;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }
}
