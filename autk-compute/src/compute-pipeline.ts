/// <reference types="@webgpu/types" />

import { getSharedGpuDevice } from './device-manager';

/**
 * Abstract base class providing shared WebGPU utilities for all compute pipelines.
 *
 * Subclasses gain access to a lazily-initialised shared GPU device and a small set of
 * helpers that eliminate repetitive buffer-creation and readback boilerplate.
 */
export abstract class GpuPipeline {
    /** Returns the shared GPU device, initialising it on first call. */
    protected async getDevice(): Promise<GPUDevice> {
        return getSharedGpuDevice();
    }

    /**
     * Creates a GPU buffer with the given usage flags.
     * If `data` is supplied the buffer is written in the same call.
     */
    protected createBuffer(
        device: GPUDevice,
        size: number,
        usage: GPUFlagsConstant,
        data?: ArrayBufferView,
    ): GPUBuffer {
        const buffer = device.createBuffer({ size, usage });
        if (data) device.queue.writeBuffer(buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
        return buffer;
    }

    /**
     * Shorthand for creating a staging buffer used to read GPU data back to the CPU.
     * Equivalent to `createBuffer(device, size, COPY_DST | MAP_READ)`.
     */
    protected createStagingBuffer(device: GPUDevice, size: number): GPUBuffer {
        return device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    }

    /**
     * Maps a staging buffer, copies its contents into a new typed array, then unmaps
     * and destroys the buffer.
     *
     * @param staging - A buffer created with MAP_READ usage, already populated via a submitted command.
     * @param Ctor - The TypedArray constructor to wrap the result (e.g. `Float32Array`, `Uint32Array`).
     */
    protected async mapReadBuffer<T extends ArrayBufferView>(
        staging: GPUBuffer,
        Ctor: new (ab: ArrayBuffer) => T,
    ): Promise<T> {
        await staging.mapAsync(GPUMapMode.READ);
        const result = new Ctor(staging.getMappedRange().slice(0));
        staging.unmap();
        staging.destroy();
        return result;
    }

    /** Rounds `value` up to the nearest multiple of `alignment`. */
    protected alignTo(value: number, alignment: number): number {
        const r = value % alignment;
        return r === 0 ? value : value + (alignment - r);
    }
}
