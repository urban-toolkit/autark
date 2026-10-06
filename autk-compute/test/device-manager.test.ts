import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

it('requests the adapter storage binding limit alongside buffer limits', async () => {
    vi.resetModules();
    const limits = { maxBufferSize: 1024 * 1024, maxStorageBufferBindingSize: 65536, maxStorageBuffersPerShaderStage: 10 };
    const device = { lost: new Promise(() => undefined) };
    const requestDevice = vi.fn().mockResolvedValue(device);
    const requestAdapter = vi.fn().mockResolvedValue({ limits, requestDevice });
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    const { getSharedGpuDevice } = await import('../src/device-manager');
    expect(await getSharedGpuDevice()).toBe(device);
    expect(requestDevice).toHaveBeenCalledWith({ requiredLimits: limits });
    expect(await getSharedGpuDevice()).toBe(device);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
});
