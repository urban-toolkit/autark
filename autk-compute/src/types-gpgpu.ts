import { TypedArray, TypedArrayConstructor } from 'autk-core';

/** Metadata describing a single global (uniform) variable in the generated WGSL shader. */
export type GlobalVarMeta =
    | { kind: 'scalar'; name: string }
    | { kind: 'array';  name: string; length: number }
    | { kind: 'matrix'; name: string; rows: number; cols: number };

/** Configuration object passed to {@link ComputeGpgpu.runCompute}. */
export interface ComputeConfig {
    /** WGSL source for the compute shader. */
    shader: string;
    /** Shader entry-point function name (default: `'main'`). */
    entryPoint?: string;
    /** Workgroup dispatch dimensions `[x, y?, z?]`. */
    dispatchSize: [number, number?, number?];
    /** Named input storage / uniform buffers keyed by variable name. */
    inputs: {
        [name: string]: {
            type: 'storage' | 'uniform';
            data: TypedArray;
            binding: number;
            group?: number;
        };
    };
    /** Named output storage buffers keyed by variable name. */
    outputs: {
        [name: string]: {
            /** Buffer size in bytes. */
            size: number;
            binding: number;
            group?: number;
            arrayType?: TypedArrayConstructor;
        };
    };
}
