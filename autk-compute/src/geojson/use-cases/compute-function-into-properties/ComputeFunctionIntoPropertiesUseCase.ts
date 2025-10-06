import { FeatureCollection } from 'geojson';
import { compute } from '../../../shared/compute';
import { ComputeFunctionIntoPropertiesParams } from './interfaces';

export class ComputeFunctionIntoPropertiesUseCase {
    async exec(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
        const { geojson, variableMapping, outputColumnName, wglsFunction } = params;

        const features = geojson.features ?? [];
        const featureCount = features.length;
        if (featureCount === 0) return geojson;

        // Extract input data from features
        const { orderedVarNames, inputArrays } = this.extractInputData(features, variableMapping, featureCount);

        // Build and run GPU computation
        const shader = this.buildShader(orderedVarNames, wglsFunction);
        const result = await this.runComputation(orderedVarNames, inputArrays, shader, featureCount);

        // Apply results to features
        return this.applyResultsToFeatures(geojson, features, result, outputColumnName);
    }

    private extractInputData(features: any[], variableMapping: Record<string, string>, featureCount: number) {
        const orderedVarNames = Object.keys(variableMapping);
        const inputArrays: { [varName: string]: Float32Array } = {};

        for (const varName of orderedVarNames) {
            const path = this.normalizePropertyPath(variableMapping[varName]);
            const values = new Float32Array(featureCount);

            for (let i = 0; i < featureCount; i++) {
                const value = this.readPathValue(features[i], path);
                const numeric = Number(value);
                values[i] = Number.isFinite(numeric) ? numeric : 0;
            }

            inputArrays[varName] = values;
        }

        return { orderedVarNames, inputArrays };
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

    private buildShader(varNames: string[], expression: string): string {
        const bufferDecls = varNames
            .map((name, idx) => `@group(0) @binding(${idx}) var<storage, read> ${name}Buf: ArrayF32;`)
            .join('\n');
        const locals = varNames.map((name) => `  let ${name}: f32 = ${name}Buf.data[idx];`).join('\n');

        const outputBinding = varNames.length;

        return `
        struct ArrayF32 {
            data: array<f32>
        }

        ${bufferDecls}
        @group(0) @binding(${outputBinding}) var<storage, read_write> outBuf: ArrayF32;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
            let idx: u32 = gid.x;
            if (idx >= arrayLength(&outBuf.data)) { return; }
            ${locals}
            let result: f32 = ${expression};
            outBuf.data[idx] = result;
        }`;
    }
}
    