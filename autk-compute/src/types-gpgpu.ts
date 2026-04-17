/// <reference types="@webgpu/types" />

import {
    TypedArray,
    TypedArrayConstructor,
} from 'autk-core';

/**
 * Metadata describing a single global uniform in the generated WGSL shader.
 *
 * Global uniforms are constants shared across all features during a GPGPU computation,
 * such as sun angles, thresholds, or day-of-year values.
 *
 * @example
 * // Scalar uniform for a sun elevation angle
 * const sunMeta: GlobalVarMeta = { kind: 'scalar', name: 'sunElevation' };
 *
 * @example
 * // Array uniform for hourly temperature values
 * const tempMeta: GlobalVarMeta = { kind: 'array', name: 'hourlyTemp', length: 24 };
 *
 * @example
 * // Matrix uniform for a 4x4 transformation
 * const transformMeta: GlobalVarMeta = { kind: 'matrix', name: 'transform', rows: 4, cols: 4 };
 */
export type GlobalVarMeta =
    /** A single scalar value (f32 in WGSL). */
    | { kind: 'scalar'; name: string }
    /** A fixed-length array of f32 values. */
    | { kind: 'array'; name: string; length: number }
    /** A fixed-size matrix of f32 values stored in row-major order. */
    | { kind: 'matrix'; name: string; rows: number; cols: number };

/**
 * Configuration object passed to {@link ComputeGpgpu.runCompute}.
 *
 * This interface describes the complete compute dispatch: the WGSL shader source,
 * entry point, dispatch dimensions, and all input/output buffer bindings.
 *
 * @example
 * const config: ComputeConfig = {
 *   shader: `
 *     @group(0) @binding(0) var<storage, read> inputBuf: ArrayF32;
 *     @group(0) @binding(1) var<storage, read_write> outputBuf: ArrayF32;
 *
 *     @compute @workgroup_size(64)
 *     fn main(@builtin(global_invocation_id) id: vec3<u32>) {
 *       let idx = id.x;
 *       outputBuf.data[idx] = inputBuf.data[idx] * 2.0;
 *     }
 *   `,
 *   dispatchSize: [128],
 *   inputs: {
 *     input: { type: 'storage', data: new Float32Array(128), binding: 0 }
 *   },
 *   outputs: {
 *     output: { size: 128 * 4, binding: 1, arrayType: Float32Array }
 *   }
 * };
 */
export interface ComputeConfig {
    /**
     * WGSL source code for the compute shader.
     *
     * The shader must declare storage/uniform bindings matching the `inputs` and `outputs`
     * configuration. Storage buffers typically use the `ArrayF32` struct pattern.
     */
    shader: string;

    /**
     * Shader entry-point function name.
     * @default 'main'
     */
    entryPoint?: string;

    /**
     * Workgroup dispatch dimensions for the compute shader.
     *
     * The total number of invocations is `dispatchSize[0] * dispatchSize[1] * dispatchSize[2]`.
     * For 1D dispatches, only the first element is required.
     *
     * @example [128] — 128 invocations along X
     * @example [32, 32] — 1024 invocations in a 2D grid
     */
    dispatchSize: [number, number?, number?];

    /**
     * Named input storage or uniform buffers keyed by variable name.
     *
     * Each input specifies the buffer type, data payload, and binding point.
     * The data is uploaded to the GPU when the compute dispatch is created.
     */
    inputs: {
        [name: string]: {
            /** Buffer type: 'storage' for read-only storage, 'uniform' for uniform buffers. */
            type: 'storage' | 'uniform';
            /** Typed array containing the data to upload. */
            data: TypedArray;
            /** Binding index in the WGSL shader's bind group. */
            binding: number;
            /** Bind group index (default: 0). */
            group?: number;
        };
    };

    /**
     * Named output storage buffers keyed by variable name.
     *
     * Output buffers are allocated on the GPU and read back after the compute dispatch completes.
     */
    outputs: {
        [name: string]: {
            /** Buffer size in bytes. For Float32Array, use `elementCount * 4`. */
            size: number;
            /** Binding index in the WGSL shader's bind group. */
            binding: number;
            /** Bind group index (default: 0). */
            group?: number;
            /**
             * TypedArray constructor used to wrap the result after readback.
             * If omitted, the buffer is returned as raw bytes.
             */
            arrayType?: TypedArrayConstructor;
        };
    };
}
