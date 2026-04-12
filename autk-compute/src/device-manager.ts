let sharedDevicePromise: Promise<GPUDevice> | null = null;

export async function getSharedGpuDevice(): Promise<GPUDevice> {
    if (!sharedDevicePromise) {
        sharedDevicePromise = (async () => {
            if (!('gpu' in navigator)) throw new Error('WebGPU not supported.');
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) throw new Error('Failed to get GPU adapter.');
            
            const device = await adapter.requestDevice({
                requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [],
                requiredLimits: {
                    maxBufferSize: adapter.limits.maxBufferSize,
                    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                },
            });

            device.lost.then((info) => {
                console.error(`WebGPU device lost: ${info.message}`);
                sharedDevicePromise = null;
            });

            return device;
        })();
    }
    return sharedDevicePromise;
}
