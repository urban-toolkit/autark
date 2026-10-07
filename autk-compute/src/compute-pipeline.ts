/**
 * @module ComputePipeline
 * Shared WebGPU utilities for compute pipeline implementations.
 *
 * This module defines `GpuPipeline`, the shared base for compute pipelines that
 * need common buffer, staging, and alignment helpers.
 */

/// <reference types="@webgpu/types" />

import { getSharedGpuDevice } from './device-manager';

/** Error scopes opened around submitted work, in push order. */
const GPU_ERROR_FILTERS: GPUErrorFilter[] = ['validation', 'out-of-memory', 'internal'];

/**
 * Shared base class for WebGPU compute pipelines.
 *
 * `GpuPipeline` centralizes device access and small helpers for buffer
 * creation, readback, and alignment.
 */
export abstract class GpuPipeline {
    /**
     * Returns the shared GPU device used by compute pipelines.
     *
     * @returns Promise resolving to the shared `GPUDevice` instance.
     * @throws If WebGPU is not supported or no adapter can be obtained.
     * @protected
     */
    protected async getDevice(): Promise<GPUDevice> {
        return getSharedGpuDevice();
    }

    /**
     * Creates a GPU buffer and optionally uploads initial data.
     *
     * @param device GPU device used to create the buffer.
     * @param size Buffer size in bytes.
     * @param usage Buffer usage flags.
     * @param data Optional initial contents.
     * @returns Created GPU buffer.
     * @throws If the device cannot allocate a buffer of the requested size.
     * @example
     * const buf = this.createBuffer(device, 1024, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
     */
    protected createBuffer(
        device: GPUDevice,
        size: number,
        usage: GPUFlagsConstant,
        data?: ArrayBufferView,
    ): GPUBuffer {
        const buffer = device.createBuffer({ size, usage });
        if (data) {
            device.queue.writeBuffer(
                buffer, 0,
                data.buffer as ArrayBuffer,
                data.byteOffset,
                data.byteLength
            );
        }
        return buffer;
    }

    /**
     * Creates a staging buffer for GPU-to-CPU readback.
     *
     * @param device GPU device used to create the buffer.
     * @param size Buffer size in bytes.
     * @returns Readback buffer configured for `COPY_DST | MAP_READ`.
     * @throws If the device cannot allocate the staging buffer.
     * @example
     * const staging = this.createStagingBuffer(device, 4096);
     */
    protected createStagingBuffer(device: GPUDevice, size: number): GPUBuffer {
        return device.createBuffer({
            size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    /**
     * Reads a mapped staging buffer into a new typed array and unmaps it.
     *
     * @param staging Mapped readback buffer populated by a copy command.
     * @param Ctor Typed array constructor used for the returned copy.
     * @returns Promise resolving to the copied typed array.
     * @throws If the buffer map operation times out or the device is lost.
     * @example
     * const data = await this.mapReadBuffer(stagingBuf, Float32Array);
     */
    protected async mapReadBuffer<T extends ArrayBufferView>(
        staging: GPUBuffer,
        Ctor: new (ab: ArrayBuffer) => T,
    ): Promise<T> {
        await staging.mapAsync(GPUMapMode.READ);
        const result = new Ctor(staging.getMappedRange().slice(0));
        staging.unmap();
        return result;
    }

    /**
     * Runs synchronous GPU work inside validation, out-of-memory and internal error scopes.
     *
     * WebGPU does not throw for an invalid shader, binding or allocation: it reports the
     * error on the device and the submitted pass does nothing, so its output reads back
     * as zeros. The scopes are pushed and popped within this one synchronous stretch, so
     * work that other callers submit to the shared device cannot land in them.
     *
     * @param device GPU device that receives the work.
     * @param label Prefix for the rejection message.
     * @param work Synchronous function that creates resources and encodes and submits commands.
     * @returns Promise resolving to the value returned by `work` once no scope caught an error.
     * @throws If a scope caught a GPU error; the message names the error type and includes the GPU's message.
     * @throws If `work` throws; the scopes are popped first.
     * @example
     * await this.submitInErrorScopes(device, 'ComputeGpgpu', () => device.queue.submit([encoder.finish()]));
     */
    protected async submitInErrorScopes<T>(device: GPUDevice, label: string, work: () => T): Promise<T> {
        for (const filter of GPU_ERROR_FILTERS) {
            device.pushErrorScope(filter);
        }
        let value: T;
        let popped: Promise<(GPUError | null)[]>;
        try {
            value = work();
        } finally {
            // Scopes form a stack: the first pop returns the last filter pushed.
            popped = Promise.all(GPU_ERROR_FILTERS.map(() => device.popErrorScope()).reverse());
        }
        const messages = (await popped).flatMap((error, i) =>
            error ? [`GPU ${GPU_ERROR_FILTERS[i]} error: ${error.message}`] : []
        );
        if (messages.length > 0) {
            throw new Error(`${label}: ${messages.join('\n')}`);
        }
        return value;
    }

    /**
     * Rounds a value up to the nearest multiple of an alignment.
     *
     * @param value Value to align.
     * @param alignment Alignment boundary.
     * @returns Aligned value.
     * @throws Never throws.
     * @example
     * alignTo(63, 16);  // 64
     * alignTo(64, 16);  // 64
     */
    protected alignTo(value: number, alignment: number): number {
        const r = value % alignment;
        return r === 0 ? value : value + (alignment - r);
    }
}
