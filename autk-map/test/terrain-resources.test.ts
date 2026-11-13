import { afterEach, expect, it, vi } from 'vitest';
import { TerrainRenderer } from '../src/renderer-terrain';
import type { Heightfield } from '@urban-toolkit/autk-core';

afterEach(() => vi.unstubAllGlobals());

it('releases every terrain buffer allocated before constructor failure', () => {
    vi.stubGlobal('GPUBufferUsage', { UNIFORM: 1, COPY_DST: 2, VERTEX: 4, INDEX: 8 });
    vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2 });
    const buffers: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    const device = {
        createBuffer: () => { const buffer = { destroy: vi.fn() }; buffers.push(buffer); return buffer; },
        createTexture: () => { throw new Error('allocation failed'); },
        queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;
    const field = { originX: 0, originY: 0, width: 2, height: 2, cellSizeX: 1, cellSizeY: 1,
        data: new Float32Array(4), bounds: [0, 0, 1, 1], minHeight: 0, maxHeight: 0 } as Heightfield;
    expect(() => new TerrainRenderer(device, 'bgra8unorm', 'depth32float', 4, field, {} as GPUTextureView, {} as GPUTextureView)).toThrow('allocation failed');
    expect(buffers.length).toBeGreaterThan(4);
    expect(buffers.every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
});
