import { FeatureCollection } from 'geojson';
import { compute } from '../../../shared/compute';
import { ComputeFunctionIntoPropertiesParams } from '../../interfaces';

export class ComputeFunctionIntoPropertiesUseCase {
  async exec(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
    const {
      geojson,
      variableMapping,
      arrayVariables = {},
      matrixVariables = {},
      outputColumnName,
      wglsFunction,
    } = params;

    const features = geojson.features ?? [];
    const featureCount = features.length;
    if (featureCount === 0) return geojson;

    // Extract input data from features
    const { orderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars } = this.extractInputData(
      features,
      variableMapping,
      arrayVariables,
      matrixVariables,
      featureCount,
    );

    // Build and run GPU computation
    const shader = this.buildShader(scalarVars, arrayVars, matrixVars, wglsFunction);
    const result = await this.runComputation(orderedVarNames, inputArrays, shader, featureCount);

    // Apply results to features
    return this.applyResultsToFeatures(geojson, features, result, outputColumnName);
  }

  private extractInputData(
    features: any[],
    variableMapping: Record<string, string>,
    arrayVariables: Record<string, number>,
    matrixVariables: Record<string, { rows: number; cols: number }>,
    featureCount: number,
  ) {
    const orderedVarNames = Object.keys(variableMapping);
    const inputArrays: { [varName: string]: Float32Array } = {};
    const scalarVars: string[] = [];
    const arrayVars: Array<{ name: string; length: number }> = [];
    const matrixVars: Array<{ name: string; rows: number; cols: number }> = [];

    for (const varName of orderedVarNames) {
      const path = this.normalizePropertyPath(variableMapping[varName]);
      const isArray = varName in arrayVariables;
      const isMatrix = varName in matrixVariables;

      if (isMatrix) {
        // Handle matrix variable: create flattened 3D buffer
        const { rows, cols } = matrixVariables[varName];
        const matrixSize = rows * cols;
        const values = new Float32Array(featureCount * matrixSize);

        for (let featureIdx = 0; featureIdx < featureCount; featureIdx++) {
          const value = this.readPathValue(features[featureIdx], path);
          const sourceMatrix = Array.isArray(value) ? value : [];

          // Iterate through rows and columns
          for (let row = 0; row < rows; row++) {
            const sourceRow = Array.isArray(sourceMatrix[row]) ? sourceMatrix[row] : [];
            for (let col = 0; col < cols; col++) {
              const offset = featureIdx * matrixSize + row * cols + col;
              const val = col < sourceRow.length ? Number(sourceRow[col]) : 0;
              values[offset] = Number.isFinite(val) ? val : 0;
            }
          }
        }

        inputArrays[varName] = values;
        matrixVars.push({ name: varName, rows, cols });
      } else if (isArray) {
        // Handle array variable: create flattened 2D buffer
        const arrayLength = arrayVariables[varName];
        const values = new Float32Array(featureCount * arrayLength);

        for (let featureIdx = 0; featureIdx < featureCount; featureIdx++) {
          const value = this.readPathValue(features[featureIdx], path);
          const sourceArray = Array.isArray(value) ? value : [];

          // Copy values from source array, pad with zeros if needed
          for (let elemIdx = 0; elemIdx < arrayLength; elemIdx++) {
            const offset = featureIdx * arrayLength + elemIdx;
            const val = elemIdx < sourceArray.length ? Number(sourceArray[elemIdx]) : 0;
            values[offset] = Number.isFinite(val) ? val : 0;
          }
        }

        inputArrays[varName] = values;
        arrayVars.push({ name: varName, length: arrayLength });
      } else {
        // Handle scalar variable (original behavior)
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

    return { orderedVarNames, inputArrays, scalarVars, arrayVars, matrixVars };
  }

  private async runComputation(
    orderedVarNames: string[],
    inputArrays: { [varName: string]: Float32Array },
    shader: string,
    featureCount: number,
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

    const outputBinding = orderedVarNames.length;
    const outputs: any = {
      out: {
        size: featureCount * 4,
        binding: outputBinding,
        group: 0,
        arrayType: Float32Array,
      },
    };

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
    outputColumnName: string,
  ): FeatureCollection {
    const outArray = result['out'] as Float32Array;

    const newFeatures = features.map((f: any, i: number) => {
      const properties = f.properties ? { ...f.properties } : {};
      const computeProps = properties.compute ? { ...properties.compute } : {};
      computeProps[outputColumnName] = outArray[i];
      properties.compute = computeProps;
      return { ...f, properties };
    });

    return { ...(geojson as any), features: newFeatures as any };
  }

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

  private buildShader(
    scalarVars: string[],
    arrayVars: Array<{ name: string; length: number }>,
    matrixVars: Array<{ name: string; rows: number; cols: number }>,
    wglsFunction: string,
  ): string {
    let bindingIdx = 0;
    const bufferDecls: string[] = [];
    const locals: string[] = [];
    const arrayCopyCode: string[] = [];
    const computeFunctionParams: string[] = [];
    const computeFunctionArgs: string[] = [];
    const arrayTypeDecls: string[] = [];

    // Struct definition
    const structDef = `struct ArrayF32 {
            data: array<f32>
        }`;

    // Handle scalar variables
    for (const name of scalarVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);
      locals.push(`  let ${name}: f32 = ${name}Buf.data[idx];`);
      computeFunctionParams.push(`${name}: f32`);
      computeFunctionArgs.push(name);
      bindingIdx++;
    }

    // Handle array variables - create real array copies
    for (const { name, length } of arrayVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);

      // Declare array type alias for this specific length
      arrayTypeDecls.push(`alias ${name}_Array = array<f32, ${length}>;`);

      // Calculate offset
      locals.push(`  let ${name}_offset: u32 = idx * ${length}u;`);

      // Create local array and copy data from buffer
      arrayCopyCode.push(`  var ${name}: ${name}_Array;`);
      arrayCopyCode.push(`  for (var i = 0u; i < ${length}u; i++) {`);
      arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[${name}_offset + i];`);
      arrayCopyCode.push(`  }`);

      // Pass both the array AND its length to compute function
      computeFunctionParams.push(`${name}: ${name}_Array`);
      computeFunctionParams.push(`${name}_length: u32`);

      computeFunctionArgs.push(name);
      computeFunctionArgs.push(`${length}u`);

      bindingIdx++;
    }

    // Handle matrix variables - create real matrix copies (as flattened arrays)
    for (const { name, rows, cols } of matrixVars) {
      bufferDecls.push(`@group(0) @binding(${bindingIdx}) var<storage, read> ${name}Buf: ArrayF32;`);

      // Declare matrix type alias (flattened array)
      const matrixSize = rows * cols;
      arrayTypeDecls.push(`alias ${name}_Matrix = array<f32, ${matrixSize}>;`);

      // Calculate offset
      locals.push(`  let ${name}_offset: u32 = idx * ${matrixSize}u;`);

      // Create local matrix (flattened) and copy data from buffer
      arrayCopyCode.push(`  var ${name}: ${name}_Matrix;`);
      arrayCopyCode.push(`  for (var i = 0u; i < ${matrixSize}u; i++) {`);
      arrayCopyCode.push(`    ${name}[i] = ${name}Buf.data[${name}_offset + i];`);
      arrayCopyCode.push(`  }`);

      // Pass matrix, rows, and cols to compute function
      computeFunctionParams.push(`${name}: ${name}_Matrix`);
      computeFunctionParams.push(`${name}_rows: u32`);
      computeFunctionParams.push(`${name}_cols: u32`);

      computeFunctionArgs.push(name);
      computeFunctionArgs.push(`${rows}u`);
      computeFunctionArgs.push(`${cols}u`);

      bindingIdx++;
    }

    const outputBinding = bindingIdx;

    return `
        ${structDef}
        ${arrayTypeDecls.join('\n        ')}

        ${bufferDecls.join('\n        ')}
        @group(0) @binding(${outputBinding}) var<storage, read_write> outBuf: ArrayF32;

        fn compute_value(${computeFunctionParams.join(', ')}) -> f32 {
            ${wglsFunction}
        }

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
            let idx: u32 = gid.x;
            if (idx >= arrayLength(&outBuf.data)) { return; }
${locals.join('\n')}
${arrayCopyCode.join('\n')}
            let result = compute_value(${computeFunctionArgs.join(', ')});
            outBuf.data[idx] = result;
        }`;
  }
}
