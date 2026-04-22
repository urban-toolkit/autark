/// <reference types="@webgpu/types" />

import { getSharedGpuDevice } from './device-manager';

/**
 * Abstract base class providing shared WebGPU utilities for all compute pipelines.
 *
 * `GpuPipeline` eliminates repetitive buffer-creation and readback boilerplate
 * by providing a small set of helper methods. Subclasses gain access to a
 * lazily-initialised shared GPU device via {@link getDevice}.
 *
 * @example
 * // Custom compute pipeline extending GpuPipeline
 * class MyComputePipeline extends GpuPipeline {
 *   async runCustomCompute(data: Float32Array): Promise<Float32Array> {
 *     const device = await this.getDevice();
 *     const inputBuf = this.createBuffer(device, data.byteLength,
 *       GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, data);
 *     const outputBuf = this.createBuffer(device, data.byteLength,
 *       GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
 *     // ... create pipeline, dispatch, readback
 *     return this.mapReadBuffer(stagingBuf, Float32Array);
 *   }
 * }
 *
 * @see {@link ComputeGpgpu} for the GPGPU analytical pipeline implementation.
 * @see {@link ComputeRender} for the render pipeline implementation.
 */
export abstract class GpuPipeline {
    /**
     * Returns the shared GPU device, initialising it on first call.
     *
     * The device is obtained via {@link getSharedGpuDevice} and cached at the
     * module level. All compute pipelines share the same device instance.
     *
     * @returns Promise resolving to the GPUDevice instance.
     * @protected
     */
    protected async getDevice(): Promise<GPUDevice> {
        return getSharedGpuDevice();
    }

    /**
     * Creates a GPU buffer with the given usage flags.
     *
     * If `data` is supplied, the buffer contents are written immediately
     * using `device.queue.writeBuffer`.
     *
     * @param device - The GPUDevice to create the buffer on.
     * @param size - Size of the buffer in bytes.
     * @param usage - Buffer usage flags (e.g., `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST`).
     * @param data - Optional initial data to upload. Must be an ArrayBufferView.
     * @returns The created GPUBuffer instance.
     *
     * @example
     * // Create an empty storage buffer
     * const buffer = this.createBuffer(device, 1024, GPUBufferUsage.STORAGE);
     *
     * @example
     * // Create a buffer with initial data
     * const data = new Float32Array([1, 2, 3, 4]);
     * const buffer = this.createBuffer(device, data.byteLength,
     *   GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, data);
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
     * Shorthand for creating a staging buffer used to read GPU data back to the CPU.
     *
     * Equivalent to `createBuffer(device, size, COPY_DST | MAP_READ)`.
     *
     * @param device - The GPUDevice to create the buffer on.
     * @param size - Size of the buffer in bytes.
     * @returns The created GPUBuffer instance configured for readback.
     *
     * @example
     * const stagingBuf = this.createStagingBuffer(device, outputSize);
     * encoder.copyBufferToBuffer(gpuBuffer, 0, stagingBuf, 0, outputSize);
     */
    protected createStagingBuffer(device: GPUDevice, size: number): GPUBuffer {
        return device.createBuffer({
            size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    /**
     * Maps a staging buffer, copies its contents into a new typed array, then unmaps it.
     *
     * This is the standard pattern for reading compute results back from the GPU:
     * 1. Submit a command that copies GPU data to a MAP_READ staging buffer
     * 2. Call this method to read and unmap the staging buffer
     *
     * @param staging - A buffer created with MAP_READ usage, already populated via a submitted command.
     * @param Ctor - The TypedArray constructor to wrap the result (e.g., `Float32Array`, `Uint32Array`).
     * @returns Promise resolving to the typed array containing the buffer contents.
     *
     * @example
     * // After submitting commands that copy results to stagingBuf:
     * const results = await this.mapReadBuffer(stagingBuf, Float32Array);
     * console.log(results); // Float32Array with GPU compute results
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
     * Rounds `value` up to the nearest multiple of `alignment`.
     *
     * This is required for WebGPU uniform buffer offsets, which must be
     * aligned to `device.limits.minUniformBufferOffsetAlignment` (typically 256).
     *
     * @param value - The value to align.
     * @param alignment - The alignment boundary (e.g., 4, 16, 256).
     * @returns The aligned value.
     *
     * @example
     * this.alignTo(100, 256); // 256
     * this.alignTo(300, 256); // 512
     * this.alignTo(512, 256); // 512 (already aligned)
     */
    protected alignTo(value: number, alignment: number): number {
        const r = value % alignment;
        return r === 0 ? value : value + (alignment - r);
    }
}
