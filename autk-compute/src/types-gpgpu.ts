/**
 * @module AutkComputeGpgpu
 * Type definitions for the GPGPU compute pipeline.
 *
 * This module defines the configuration shapes consumed by `ComputeGpgpu`.
 */

/// <reference types="@webgpu/types" />

import {
    TypedArray,
    TypedArrayConstructor,
} from '@urban-toolkit/autk-core';

/**
 * Metadata for a global scalar or read-only storage array exposed to the generated WGSL shader.
 */
export type GlobalVarMeta =
    /** Single f32 uniform value. */
    | { kind: 'scalar'; name: string }
    /** Fixed-length read-only storage array of f32 values. */
    | { kind: 'array'; name: string; length: number }
    /** Fixed-size read-only storage matrix of f32 values in row-major order. */
    | { kind: 'matrix'; name: string; rows: number; cols: number };

/**
 * Complete compute shader configuration consumed by {@link ComputeGpgpu.runCompute}.
 */
export interface ComputeConfig {
    /** WGSL source code for the compute shader. */
    shader: string;

    /** Shader entry-point function name. @default 'main' */
    entryPoint?: string;

    /** Workgroup dispatch dimensions. Omitted trailing values default to `1`. */
    dispatchSize: [number, number?, number?];

    /** Named input buffers keyed by WGSL variable name. */
    inputs: {
        [name: string]: {
            /** Buffer type used by the WGSL declaration. */
            type: 'storage' | 'uniform';
            /** Typed array uploaded before the dispatch runs. */
            data: TypedArray;
            /** Binding index in the shader bind group. */
            binding: number;
            /** Bind group index. @default 0 */
            group?: number;
        };
    };

    /** Named output storage buffers keyed by WGSL variable name. */
    outputs: {
        [name: string]: {
            /** Buffer size in bytes. */
            size: number;
            /** Binding index in the shader bind group. */
            binding: number;
            /** Bind group index. @default 0 */
            group?: number;
            /** TypedArray constructor used to wrap the readback result. */
            arrayType?: TypedArrayConstructor;
        };
    };
}
