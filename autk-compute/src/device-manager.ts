/// <reference types="@webgpu/types" />

/**
 * Module-level cache for the shared GPU device promise.
 *
 * This ensures that only one GPU device is requested per page load,
 * even if multiple compute pipelines are initialized concurrently.
 */
let sharedDevicePromise: Promise<GPUDevice> | null = null;

/**
 * Returns a shared GPU device instance, initializing it on first call.
 *
 * The device is cached at the module level to prevent redundant adapter
 * requests and ensure consistent device limits across all compute pipelines.
 *
 * The device is configured with the maximum buffer size limits exposed by the adapter.
 *
 * @returns Promise resolving to the shared GPUDevice instance.
 * @throws If WebGPU is not supported in the current browser.
 * @throws If no GPU adapter can be obtained.
 *
 * @example
 * // Get the shared device for custom compute pipelines
 * const device = await getSharedGpuDevice();
 *
 * @example
 * // Multiple calls return the same device promise
 * const device1 = await getSharedGpuDevice();
 * const device2 = await getSharedGpuDevice();
 * console.log(device1 === device2); // true
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
