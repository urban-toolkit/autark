import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineTriangleFlat } from '../src/pipeline-triangle-flat';
import { PipelineTriangleBorder } from '../src/pipeline-triangle-border';
import { PipelineTriangleRaster } from '../src/pipeline-triangle-raster';
import { PipelineSprite } from '../src/pipeline-sprite';
import { PipelineSpritePicking } from '../src/pipeline-sprite-picking';
import { PipelineTrianglePicking } from '../src/pipeline-triangle-picking';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';
import { FlatMapRenderPath } from '../src/map-flat';
import { Triangles3DLayer } from '../src/layer-triangles3D';

beforeEach(() => {
    vi.stubGlobal('GPUBufferUsage', { UNIFORM: 1, COPY_DST: 2 });
    vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function renderer() {
    const device = {
        createBuffer: vi.fn(descriptor => descriptor),
        createBindGroupLayout: vi.fn(descriptor => descriptor),
        createBindGroup: vi.fn(descriptor => descriptor),
        createPipelineLayout: vi.fn(descriptor => descriptor),
        createRenderPipeline: vi.fn(descriptor => descriptor),
    };
    return { device, canvasFormat: 'bgra8unorm', sampleCount: 4 } as any;
}

describe('map depth policies', () => {
    it.each([PipelineTriangleFlat, PipelineTriangleBorder, PipelineTriangleRaster, PipelineSprite, PipelineSpritePicking])(
        '%s draws 2D primitives without competing through depth', Constructor => {
            const target = renderer();
            const pipeline = new Constructor(target) as any;
            pipeline.createPipeline();
            expect(target.device.createRenderPipeline.mock.calls[0][0].depthStencil).toEqual({
                format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always',
            });
        },
    );

    it.each([2, 3])('keeps physical depth for 3D picking only (dimension %s)', dimension => {
        const target = renderer();
        const pipeline = new PipelineTrianglePicking(target, dimension) as any;
        pipeline.createPipeline();
        expect(target.device.createRenderPipeline.mock.calls[0][0].depthStencil).toEqual({
            format: 'depth32float', depthWriteEnabled: dimension === 3,
            depthCompare: dimension === 3 ? 'greater-equal' : 'always',
        });
    });

    it('retains nearest-surface depth for building geometry', () => {
        const target = renderer();
        new PipelineBuildingSSAO(target).createPipeline01();
        expect(target.device.createRenderPipeline.mock.calls[0][0].depthStencil).toEqual({
            format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater-equal',
        });
    });

    it('allocates camera matrix bindings without a layer-height uniform', () => {
        const target = renderer();
        new PipelineTriangleFlat(target).createCameraUniformBindGroup();
        expect(target.device.createBuffer.mock.calls.map(([buffer]: any[]) => buffer.size)).toEqual([64, 64]);
        expect(target.device.createBindGroupLayout.mock.calls[0][0].entries.map((entry: any) => entry.binding)).toEqual([0, 1]);
        expect(target.device.createBindGroup.mock.calls[0][0].entries.map((entry: any) => entry.binding)).toEqual([0, 1]);
    });
});

it('draws the sorted 2D stack before compositing buildings, regardless of their position in the list', () => {
    const calls: string[] = [];
    const layer = (id: string) => ({
        layerRenderInfo: {}, prepareRender: vi.fn(), renderPass: () => calls.push(id),
    });
    const building = Object.assign(Object.create(Triangles3DLayer.prototype), {
        _layerRenderInfo: {}, prepareRender: vi.fn(),
        renderSceneGeometry: () => calls.push('building geometry'),
    });
    vi.spyOn(PipelineBuildingSSAO, 'beginSharedGeometryPass').mockReturnValue({ end: vi.fn() } as any);
    vi.spyOn(PipelineBuildingSSAO, 'compositeSharedPass').mockImplementation(() => { calls.push('building composite'); });
    const target = {
        start: vi.fn(), beginMainRenderPass: () => ({ end: vi.fn() }), finish: vi.fn(),
    };
    const picking = { consumePendingPick: () => null, resolvePickingReadback: vi.fn() };
    const path = new FlatMapRenderPath(target as any, {} as any,
        { layers: [layer('lower'), building, layer('upper')] } as any, picking as any);
    path.renderFrame();
    expect(calls).toEqual(['building geometry', 'lower', 'upper', 'building composite']);
});
