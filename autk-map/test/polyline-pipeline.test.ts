import type { FeatureCollection } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolylineBuilder, ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { PolylineLayer } from '../src/layer-polyline';
import { PipelinePolyline } from '../src/pipeline-polyline';
import { MapStyle } from '../src/map-style';

beforeEach(() => {
    vi.stubGlobal('GPUBufferUsage', { VERTEX: 1, INDEX: 2, COPY_DST: 4, UNIFORM: 8, STORAGE: 16 });
    vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
    vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture() {
    const source: FeatureCollection = { type: 'FeatureCollection', features: [
        { type: 'Feature', id: 'a', geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0]] }, properties: {} },
        { type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[0, 10], [10, 10]] }, properties: {} },
    ] };
    const data = PolylineBuilder.build(source, [0, 0]);
    const layer = new PolylineLayer({ id: 'roads', typeLayer: 'roads' }, {
        opacity: 1, polylinesWidthByComponent: new Float32Array([20, 7]),
        colormap: { config: { interpolator: ColorMapInterpolator.SEQ_REDS, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } } },
    }, { geometry: data.geometry, components: data.components, polylineAttributes: data.attributes,
        thematic: [{ value: 2, valid: 1 }, { value: 5, valid: 1 }] });
    const uploads: Array<{ label: string; data: number[] }> = [];
    const device = {
        createBuffer: vi.fn(descriptor => ({ ...descriptor, destroy: vi.fn() })),
        createShaderModule: vi.fn(descriptor => descriptor),
        createBindGroupLayout: vi.fn(descriptor => descriptor),
        createBindGroup: vi.fn(descriptor => descriptor),
        createPipelineLayout: vi.fn(descriptor => descriptor),
        createRenderPipeline: vi.fn(descriptor => descriptor),
        createSampler: vi.fn(() => ({})),
        createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
        queue: { writeBuffer: vi.fn((buffer, _offset, data) => uploads.push({ label: buffer.label, data: Array.from(data) })), writeTexture: vi.fn() },
    };
    const renderer = { device, style: new MapStyle(), canvasFormat: 'bgra8unorm', sampleCount: 4 } as any;
    return { layer, device, renderer, uploads };
}

describe('shader-expanded polyline GPU boundary', () => {
    it('uses identical expansion for visible and picking pipelines and correct attribute strides', () => {
        const { layer, device, renderer } = fixture();
        new PipelinePolyline(renderer).build(layer);
        new PipelinePolyline(renderer, true).build(layer);
        const [visible, picking] = device.createRenderPipeline.mock.calls.map(call => call[0]);
        const expansion = (source: string) => source.slice(0, source.indexOf('@group'));
        expect(expansion(visible.vertex.module.code)).toBe(expansion(picking.vertex.module.code));
        expect(visible.vertex.module.code).toMatch(/denominator\s*>=\s*0\.25/);
        expect(picking.fragment.module.code).toContain('discard');
        expect(visible.vertex.buffers.map((buffer: GPUVertexBufferLayout) => buffer.arrayStride)).toEqual([8, 4, 16]);
        expect(picking.vertex.buffers.map((buffer: GPUVertexBufferLayout) => buffer.arrayStride)).toEqual([8, 4, 16]);
        expect(visible.layout.bindGroupLayouts[2].entries[1].buffer.type).toBe('read-only-storage');
        expect(visible.multisample.count).toBe(4);
        expect(picking.multisample.count).toBe(1);
        for (const pipeline of [visible, picking]) {
            expect(pipeline.depthStencil).toEqual({ format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' });
        }
    });

    it('uploads OSM defaults once and only uniforms for explicit width changes in both passes', () => {
        const { layer, renderer, uploads } = fixture();
        const visible = new PipelinePolyline(renderer);
        const picking = new PipelinePolyline(renderer, true);
        visible.build(layer);
        picking.build(layer);
        const defaultWidths = uploads.find(upload => upload.label === 'Polyline default widths')!.data;
        expect(defaultWidths).toEqual([...Array(10).fill(20), ...Array(10).fill(7)]);
        uploads.length = 0;
        layer.updateLayerRenderInfo({ polylinesWidth: 12 });
        visible.updateWidth(layer);
        picking.updateWidth(layer);
        expect(uploads).toEqual([
            { label: 'Polyline width override', data: [12] },
            { label: 'Polyline width override', data: [12] },
        ]);
    });

    it('uses the centralized generic width when no width is supplied to the renderer', () => {
        const { layer, renderer, uploads } = fixture();
        layer.updateLayerInfo({ typeLayer: 'polylines' });
        layer.updateLayerRenderInfo({ polylinesWidthByComponent: undefined });
        const pipeline = new PipelinePolyline(renderer);
        pipeline.build(layer);
        expect(uploads.find(upload => upload.label === 'Polyline default widths')!.data).toEqual(Array(20).fill(12));
        layer.updateLayerRenderInfo({ polylinesWidth: 24 });
        pipeline.updateWidth(layer);
        expect(uploads.at(-1)).toEqual({ label: 'Polyline width override', data: [24] });
    });

    it('reads the hover mask once per visible upload and never for picking', () => {
        const { layer, renderer, uploads } = fixture();
        const visible = new PipelinePolyline(renderer);
        const picking = new PipelinePolyline(renderer, true);
        visible.build(layer);
        picking.build(layer);
        layer.setSelection([0]);
        layer.setHoveredIds([0, 1]);
        const indexed = new Set(layer.indices);
        const mask = vi.spyOn(layer, 'highlightedVertices', 'get');

        visible.updateVertexBuffers(layer);
        expect(mask).toHaveBeenCalledOnce();
        expect(uploads.findLast(upload => upload.label === 'Polyline feature state')!.data.filter((_, i) => i % 4 === 1))
            .toEqual(Array.from({ length: 20 }, (_, i) => indexed.has(i) ? 2 : 0));

        picking.updateVertexBuffers(layer);
        expect(mask).toHaveBeenCalledOnce();

        layer.setHoveredIds([]);
        visible.updateVertexBuffers(layer);
        expect(uploads.findLast(upload => upload.label === 'Polyline feature state')!.data.filter((_, i) => i % 4 === 1))
            .toEqual(Array.from({ length: 20 }, (_, i) => i < 10 && indexed.has(i) ? 1 : 0));
    });

    it('encodes feature IDs and skip masks for indexed picking vertices', () => {
        const { layer, renderer, uploads } = fixture();
        layer.setSkipped([1]);
        const picking = new PipelinePolyline(renderer, true);
        picking.build(layer);
        const state = uploads.find(upload => upload.label === 'Polyline feature state')!.data;
        expect(state.slice(0, 4)).toEqual([Math.fround(1 / 255), 0, 0, 0]);
        expect(state.slice(48, 52)).toEqual([Math.fround(2 / 255), 0, 0, 1]);
    });

    it.each([false, true])('uploads only changed feature state across passes (picking first: %s)', pickingFirst => {
        const { layer, renderer, uploads } = fixture();
        layer.createPipeline(renderer);
        const camera = { getModelViewMatrix: () => Array(16).fill(0), getProjectionMatrix: () => Array(16).fill(0) } as any;
        const pass = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setIndexBuffer: vi.fn(), setBindGroup: vi.fn(), drawIndexed: vi.fn() } as any;
        const visible = () => layer.renderPass(camera, pass);
        const picking = () => layer.renderPickingPass(camera, pass);
        const draw = () => {
            if (pickingFirst) { picking(); visible(); } else { visible(); picking(); }
        };
        const state = () => uploads.filter(upload => upload.label === 'Polyline feature state').map(upload => upload.data);
        const onChange = vi.fn();
        layer.setChangeListener(onChange);
        draw(); // Flush initial uniforms.

        uploads.length = 0;
        layer.toggleHighlightedIds([0]);
        expect(onChange).toHaveBeenCalled();
        draw();
        expect(uploads.filter(upload => !upload.label.includes('matrix')).map(upload => upload.label)).toEqual(['Polyline feature state']);
        expect(state()[0][9]).toBe(1);

        uploads.length = 0;
        layer.setSelection([1]);
        layer.setHoveredIds([0]);
        draw();
        expect(state()).toHaveLength(1);
        expect(state()[0][9]).toBe(2);
        expect(state()[0][49]).toBe(1);

        for (const skipped of [[1], []]) {
            uploads.length = 0;
            layer.setSkipped(skipped);
            draw();
            expect(uploads.filter(upload => !upload.label.includes('matrix')).map(upload => upload.label))
                .toEqual(['Polyline feature state', 'Polyline feature state']);
            const [a, b] = state();
            const [colorState, pickingState] = pickingFirst ? [b, a] : [a, b];
            expect(colorState[51]).toBe(skipped.length);
            expect(pickingState.slice(48, 52)).toEqual([Math.fround(2 / 255), 0, 0, skipped.length]);
        }

        uploads.length = 0;
        draw();
        expect(state()).toEqual([]);

        layer.makeLayerDataDirty();
        draw();
        expect(uploads.filter(upload => upload.label === 'Polyline centers')).toHaveLength(2);
        expect(state()).toHaveLength(2);
    });

    it('draws centerline topology and releases all owned buffers', () => {
        const { layer, device, renderer } = fixture();
        const pipeline = new PipelinePolyline(renderer, true);
        pipeline.build(layer);
        const pass = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setIndexBuffer: vi.fn(), setBindGroup: vi.fn(), drawIndexed: vi.fn() };
        pipeline.renderPass({ getModelViewMatrix: () => Array(16).fill(0), getProjectionMatrix: () => Array(16).fill(0) } as any, pass as any);
        expect(pass.drawIndexed).toHaveBeenCalledWith(layer.indices.length);
        pipeline.destroy();
        for (const result of device.createBuffer.mock.results) {
            expect(result.value.destroy).toHaveBeenCalledOnce();
        }
    });
});
