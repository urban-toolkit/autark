/// <reference types="@webgpu/types" />

/**
 * @module DeviceManager
 * Shared GPU device acquisition for compute workloads.
 *
 * This module caches a single GPU device promise so concurrent callers share
 * the same adapter and device request.
 */
let sharedDevicePromise: Promise<GPUDevice> | null = null;

/**
 * Returns the shared GPU device, initializing it on first use with retry.
 *
 * @returns Promise resolving to the shared `GPUDevice` instance.
 * @throws If WebGPU is not supported in the current browser.
 * @throws If no GPU adapter can be obtained after retry.
 * @example
 * const device = await getSharedGpuDevice();
 */
export async function getSharedGpuDevice(): Promise<GPUDevice> {
    if (!sharedDevicePromise) {
        let devicePromise!: Promise<GPUDevice>;
        devicePromise = (async () => {
            try {
                if (!('gpu' in navigator)) {
                    throw new Error('WebGPU not supported.');
                }

                let adapter = await navigator.gpu.requestAdapter();
                if (!adapter) {
                    // Chrome sometimes returns null briefly after a device loss.
                    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
                    adapter = await navigator.gpu.requestAdapter();
                }
                if (!adapter) {
                    throw new Error('Failed to get GPU adapter.');
                }

                const device = await adapter.requestDevice({
                    // Request maximum buffer sizes for large compute workloads
                    requiredLimits: {
                        maxBufferSize: adapter.limits.maxBufferSize,
                        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                    },
                });

                // Handle device loss by clearing the cache
                device.lost.then((info) => {
                    console.error(`WebGPU device lost: ${info.message}`);
                    if (sharedDevicePromise === devicePromise) {
                        sharedDevicePromise = null;
                    }
                });

                return device;
            } catch (error) {
                if (sharedDevicePromise === devicePromise) {
                    sharedDevicePromise = null;
                }
                throw error;
            }
        })();
        sharedDevicePromise = devicePromise;
    }
    return sharedDevicePromise;
}
