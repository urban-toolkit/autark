import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';

beforeEach(() => {
    vi.stubGlobal('GPUTextureUsage', { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2 });
    vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

interface FakeTexture {
    label: string;
    destroy: ReturnType<typeof vi.fn>;
}

/** A renderer whose device records every texture it creates. */
function fakeRenderer() {
    const textures: FakeTexture[] = [];
    const device = {
        createTexture: vi.fn((descriptor: { label: string }) => {
            const texture = { label: descriptor.label, createView: () => ({}), destroy: vi.fn() };
            textures.push(texture);
            return texture;
        }),
        createSampler: vi.fn(() => ({})),
        createBindGroupLayout: vi.fn(descriptor => descriptor),
        createBindGroup: vi.fn(descriptor => descriptor),
        createShaderModule: vi.fn(descriptor => descriptor),
        createPipelineLayout: vi.fn(descriptor => descriptor),
        createRenderPipeline: vi.fn(descriptor => descriptor),
    };
    const renderer = {
        device, pixelWidth: 400, pixelHeight: 300, canvasFormat: 'bgra8unorm', sampleCount: 4,
        commandEncoder: { beginRenderPass: vi.fn(() => ({})) },
    } as any;
    return { renderer, textures };
}

const destroyed = (textures: FakeTexture[]) => textures.map(texture => texture.destroy.mock.calls.length);

describe('shared SSAO state', () => {
    it('is released with its three textures destroyed, once', () => {
        const { renderer, textures } = fakeRenderer();
        PipelineBuildingSSAO.beginSharedGeometryPass(renderer);
        expect(textures.map(texture => texture.label)).toEqual([
            'Shared colors texture', 'Shared normals texture', 'Shared building depth texture',
        ]);

        PipelineBuildingSSAO.releaseSharedState(renderer);
        PipelineBuildingSSAO.releaseSharedState(renderer);

        expect(destroyed(textures)).toEqual([1, 1, 1]);
    });

    it('is made again, with new textures, when a released renderer draws again', () => {
        const { renderer, textures } = fakeRenderer();
        PipelineBuildingSSAO.beginSharedGeometryPass(renderer);
        PipelineBuildingSSAO.releaseSharedState(renderer);

        PipelineBuildingSSAO.beginSharedGeometryPass(renderer);

        expect(destroyed(textures)).toEqual([1, 1, 1, 0, 0, 0]);
    });

    it('is released for one renderer only', () => {
        const first = fakeRenderer();
        const second = fakeRenderer();
        PipelineBuildingSSAO.beginSharedGeometryPass(first.renderer);
        PipelineBuildingSSAO.beginSharedGeometryPass(second.renderer);

        PipelineBuildingSSAO.releaseSharedState(first.renderer);

        expect(destroyed(first.textures)).toEqual([1, 1, 1]);
        expect(destroyed(second.textures)).toEqual([0, 0, 0]);
    });

    it('is left alone when a renderer never drew buildings', () => {
        const { renderer, textures } = fakeRenderer();

        expect(() => PipelineBuildingSSAO.releaseSharedState(renderer)).not.toThrow();
        expect(textures).toEqual([]);
    });
});
