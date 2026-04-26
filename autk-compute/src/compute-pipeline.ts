/**
 * @module ComputePipeline
 * Shared WebGPU utilities for compute pipeline implementations.
 *
 * This module defines `GpuPipeline`, the shared base for compute pipelines that
 * need common buffer, staging, and alignment helpers.
 */

/// <reference types="@webgpu/types" />

import { getSharedGpuDevice } from './device-manager';

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
     * @returns Promise resolving to the shared GPUDevice instance.
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
     * Rounds a value up to the nearest multiple of an alignment.
     *
     * @param value Value to align.
     * @param alignment Alignment boundary.
     * @returns Aligned value.
     */
    protected alignTo(value: number, alignment: number): number {
        const r = value % alignment;
        return r === 0 ? value : value + (alignment - r);
    }
}
