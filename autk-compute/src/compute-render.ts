/// <reference types="@webgpu/types" />

import { FeatureCollection } from 'geojson';
import {
    ColorRGB,
    LayerGeometry,
    TriangulatorBuildings,
    TriangulatorPolygons,
    TriangulatorPolylines,
    TriangulatorPoints,
    computeOrigin,
} from 'autk-core';
import { GpuPipeline } from './compute-pipeline';
import { generateViewpoints, buildCameraMatrices } from './viewpoint';
import type { RenderLayer, RenderPipelineParams } from './api';
import type { GpuLayerData } from './types-render';

import VERT_SHADER from './shaders/render-vert.wgsl?raw';
import FRAG_SHADER from './shaders/render-frag.wgsl?raw';
import COUNT_SHADER from './shaders/render-count.wgsl?raw';

type LayerMeshData = { geometries: LayerGeometry[]; color: ColorRGB };

/**
 * Renders a scene from multiple street-level viewpoints into offscreen tiles and
 * counts non-sky pixels per tile using a WebGPU compute shader.
 *
 * Viewpoints are generated automatically from `params.source` via {@link generateViewpoints}.
 * Each viewpoint receives two metrics written to `feature.properties.compute`:
 * - `buildingCoverage` — fraction of tile pixels occupied by geometry [0–1].
 * - `skyViewFactor` — fraction of tile pixels showing sky (1 − buildingCoverage).
 */
export class ComputeRender extends GpuPipeline {
    /**
     * Runs the render pipeline and returns the generated viewpoints annotated with
     * per-viewpoint coverage metrics.
     */
    async run(params: RenderPipelineParams): Promise<FeatureCollection> {
        const {
            layers,
            source,
            samplingInterval = 10,
            eyeHeight = 1.7,
            fov = 90,
            near = 1,
            far = 5000,
            tileSize = 64,
            clearColor = [0, 0, 0, 1],
        } = params;

        if (layers.length === 0) throw new Error('RenderPipeline: at least one layer is required.');
        if (tileSize % 8 !== 0) throw new Error('RenderPipeline: tileSize must be a multiple of 8.');

        const viewpoints = generateViewpoints(source, samplingInterval);
        const N = viewpoints.features.length;
        if (N === 0) return viewpoints;

        const origin = computeOrigin(source);

        const meshes = layers
            .map(l => this.triangulateLayer(l, origin))
            .filter((m): m is LayerMeshData => m !== null);

        if (meshes.length === 0) return viewpoints;

        const cameras   = buildCameraMatrices(viewpoints, origin, eyeHeight, fov, near, far);
        const gridSize  = Math.ceil(Math.sqrt(N));
        const texSize   = gridSize * tileSize;

        const device    = await this.getDevice();
        const alignment = device.limits.minUniformBufferOffsetAlignment;

        // --- GPU resource allocation ---
        const tileTexture = this.createTileTexture(device, texSize);
        const depthTexture = this.createDepthTexture(device, texSize);
        const tileView  = tileTexture.createView();
        const depthView = depthTexture.createView();
        const gpuLayers = meshes.map(m => this.uploadLayerToGpu(device, m));
        const { cameraBuf, cameraStride } = this.buildCameraBuffer(device, cameras, N, alignment);
        const { resultsBuf, paramsBuf } = this.buildCountBuffers(device, N, gridSize, tileSize, clearColor);

        // --- Pipeline creation ---
        const { renderPipeline, camBGL, colorBGL } = this.buildRenderPipeline(device);
        const { countPipeline, countBG } = this.buildCountPipeline(device, tileView, resultsBuf, paramsBuf);
        const camBG = device.createBindGroup({
            layout: camBGL,
            entries: [{ binding: 0, resource: { buffer: cameraBuf, offset: 0, size: 64 } }],
        });
        const colorBGs = gpuLayers.map(({ colorBuf }) =>
            device.createBindGroup({ layout: colorBGL, entries: [{ binding: 0, resource: { buffer: colorBuf } }] }));

        // --- Command encoding ---
        const encoder = device.createCommandEncoder();
        this.encodeRenderPasses(encoder, N, gridSize, tileSize, tileView, depthView, renderPipeline, camBG, cameraStride, colorBGs, gpuLayers, clearColor);
        this.encodeCountPass(encoder, countPipeline, countBG, tileSize, N);

        // --- Readback ---
        const stagingBuf = this.createStagingBuffer(device, N * 4);
        encoder.copyBufferToBuffer(resultsBuf, 0, stagingBuf, 0, N * 4);
        device.queue.submit([encoder.finish()]);

        const rawResults = await this.mapReadBuffer(stagingBuf, Uint32Array);

        // --- Cleanup ---
        tileTexture.destroy();
        depthTexture.destroy();
        cameraBuf.destroy();
        resultsBuf.destroy();
        paramsBuf.destroy();
        for (const { vBuf, iBuf, colorBuf } of gpuLayers) { vBuf.destroy(); iBuf.destroy(); colorBuf.destroy(); }

        return this.applyMetrics(viewpoints, rawResults, tileSize);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Triangulates a layer using the appropriate autk-core strategy. */
    private triangulateLayer(layer: RenderLayer, origin: [number, number]): LayerMeshData | null {
        let geometries;
        switch (layer.type) {
            case 'buildings':
                [geometries] = TriangulatorBuildings.buildMesh(layer.geojson, origin);
                break;
            case 'polygons':
            case 'surface':
            case 'water':
            case 'parks':
                [geometries] = TriangulatorPolygons.buildMesh(layer.geojson, origin);
                break;
            case 'roads':
            case 'polylines':
                [geometries] = TriangulatorPolylines.buildMesh(layer.geojson, origin);
                break;
            case 'points':
                [geometries] = TriangulatorPoints.buildMesh(layer.geojson, origin);
                break;
            default:
                console.warn(`RenderPipeline: unsupported layer type "${layer.type}", skipping.`);
                return null;
        }
        return { geometries, color: layer.color };
    }

    private createTileTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    private createDepthTexture(device: GPUDevice, texSize: number): GPUTexture {
        return device.createTexture({
            size: [texSize, texSize],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    /**
     * Uploads a layer's mesh and colour to GPU buffers.
     * Positions are always promoted to 3D (Z=0 for 2D triangulator output) to satisfy
     * the render shader's float32x3 vertex format.
     */
    private uploadLayerToGpu(device: GPUDevice, { geometries, color }: LayerMeshData): GpuLayerData {
        let totalVerts = 0;
        let totalIndices = 0;
        for (const g of geometries) {
            const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
            totalVerts += (is2D ? g.position.length / 2 : g.position.length / 3) * 3;
            totalIndices += g.indices?.length ?? 0;
        }

        const positions = new Float32Array(totalVerts);
        const indices   = new Uint32Array(totalIndices);
        let vOffset = 0, iOffset = 0, vertexCount = 0;

        for (const g of geometries) {
            const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
            if (is2D) {
                for (let i = 0, j = 0; i < g.position.length; i += 2, j += 3) {
                    positions[vOffset + j]     = g.position[i];
                    positions[vOffset + j + 1] = g.position[i + 1];
                    // positions[vOffset + j + 2] stays 0
                }
            } else {
                positions.set(g.position, vOffset);
            }
            if (g.indices) {
                for (let i = 0; i < g.indices.length; i++) indices[iOffset + i] = g.indices[i] + vertexCount;
                iOffset += g.indices.length;
            }
            const vertsAdded = is2D ? g.position.length / 2 : g.position.length / 3;
            vOffset += vertsAdded * 3;
            vertexCount += vertsAdded;
        }

        const vBuf     = this.createBuffer(device, positions.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, positions);
        const iBuf     = this.createBuffer(device, indices.byteLength,   GPUBufferUsage.INDEX  | GPUBufferUsage.COPY_DST, indices);
        // ColorRGB r/g/b are in [0–255]; normalise to [0–1] for the WGSL vec4f uniform.
        const colorBuf = this.createBuffer(device, 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Float32Array([color.r / 255, color.g / 255, color.b / 255, color.alpha]));
        return { vBuf, iBuf, indexCount: indices.length, colorBuf };
    }

    /** Packs view-projection matrices into a stride-aligned uniform buffer. */
    private buildCameraBuffer(
        device: GPUDevice,
        cameras: Float32Array,
        N: number,
        alignment: number,
    ): { cameraBuf: GPUBuffer; cameraStride: number } {
        const cameraStride = Math.max(64, alignment);
        const raw = new ArrayBuffer(N * cameraStride);
        for (let i = 0; i < N; i++) {
            new Float32Array(raw, i * cameraStride, 16).set(cameras.subarray(i * 16, i * 16 + 16));
        }
        const cameraBuf = this.createBuffer(device, N * cameraStride, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, new Uint8Array(raw));
        return { cameraBuf, cameraStride };
    }

    /** Creates the pixel-count storage buffer and the params uniform buffer. */
    private buildCountBuffers(
        device: GPUDevice,
        N: number,
        gridSize: number,
        tileSize: number,
        clearColor: [number, number, number, number],
    ): { resultsBuf: GPUBuffer; paramsBuf: GPUBuffer } {
        const resultsBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

        const paramsData = new ArrayBuffer(32);
        const pv = new DataView(paramsData);
        pv.setUint32(0,  gridSize,      true);
        pv.setUint32(4,  tileSize,      true);
        pv.setUint32(8,  N,             true);
        // offset 12 is _pad
        pv.setFloat32(16, clearColor[0], true);
        pv.setFloat32(20, clearColor[1], true);
        pv.setFloat32(24, clearColor[2], true);
        pv.setFloat32(28, clearColor[3], true);
        const paramsBuf = this.createBuffer(device, 32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, new Uint8Array(paramsData));

        return { resultsBuf, paramsBuf };
    }

    /** Creates the render pipeline with depth testing and alpha blending. */
    private buildRenderPipeline(device: GPUDevice): {
        renderPipeline: GPURenderPipeline;
        camBGL: GPUBindGroupLayout;
        colorBGL: GPUBindGroupLayout;
    } {
        const camBGL = device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 },
            }],
        });
        const colorBGL = device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform', minBindingSize: 16 },
            }],
        });

        const renderPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [camBGL, colorBGL] }),
            vertex: {
                module: device.createShaderModule({ code: VERT_SHADER }),
                entryPoint: 'main',
                buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
            },
            fragment: {
                module: device.createShaderModule({ code: FRAG_SHADER }),
                entryPoint: 'main',
                targets: [{
                    format: 'rgba8unorm',
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: 'depth32float',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        return { renderPipeline, camBGL, colorBGL };
    }

    /** Creates the pixel-counting compute pipeline and its bind group. */
    private buildCountPipeline(
        device: GPUDevice,
        tileView: GPUTextureView,
        resultsBuf: GPUBuffer,
        paramsBuf: GPUBuffer,
    ): { countPipeline: GPUComputePipeline; countBG: GPUBindGroup } {
        const countBGL = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float', viewDimension: '2d' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 32 } },
            ],
        });

        const countPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [countBGL] }),
            compute: { module: device.createShaderModule({ code: COUNT_SHADER }), entryPoint: 'main' },
        });

        const countBG = device.createBindGroup({
            layout: countBGL,
            entries: [
                { binding: 0, resource: tileView },
                { binding: 1, resource: { buffer: resultsBuf } },
                { binding: 2, resource: { buffer: paramsBuf } },
            ],
        });

        return { countPipeline, countBG };
    }

    /**
     * Encodes one render pass per viewpoint, each restricted to its tile via viewport + scissor.
     *
     * The depth attachment is cleared per pass so each tile's depth is independent.
     * The colour attachment is only cleared on the first pass; subsequent passes load the
     * previously rendered tiles and only write within their scissor region.
     */
    private encodeRenderPasses(
        encoder: GPUCommandEncoder,
        N: number,
        gridSize: number,
        tileSize: number,
        tileView: GPUTextureView,
        depthView: GPUTextureView,
        renderPipeline: GPURenderPipeline,
        camBG: GPUBindGroup,
        cameraStride: number,
        colorBGs: GPUBindGroup[],
        gpuLayers: GpuLayerData[],
        clearColor: [number, number, number, number],
    ): void {
        for (let i = 0; i < N; i++) {
            const col = i % gridSize;
            const row = Math.floor(i / gridSize);

            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: tileView,
                    loadOp: i === 0 ? 'clear' : 'load',
                    storeOp: 'store',
                    clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
                }],
                depthStencilAttachment: {
                    view: depthView,
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear',    // each tile gets a fresh depth buffer
                    depthStoreOp: 'discard', // depth is not needed after the pass
                },
            });

            pass.setPipeline(renderPipeline);
            pass.setViewport(col * tileSize, row * tileSize, tileSize, tileSize, 0, 1);
            pass.setScissorRect(col * tileSize, row * tileSize, tileSize, tileSize);
            pass.setBindGroup(0, camBG, [i * cameraStride]);

            for (let j = 0; j < gpuLayers.length; j++) {
                const { vBuf, iBuf, indexCount } = gpuLayers[j];
                pass.setBindGroup(1, colorBGs[j]);
                pass.setVertexBuffer(0, vBuf);
                pass.setIndexBuffer(iBuf, 'uint32');
                pass.drawIndexed(indexCount);
            }

            pass.end();
        }
    }

    /** Dispatches the pixel-counting compute shader over all tiles. */
    private encodeCountPass(
        encoder: GPUCommandEncoder,
        countPipeline: GPUComputePipeline,
        countBG: GPUBindGroup,
        tileSize: number,
        N: number,
    ): void {
        const ts8 = tileSize / 8;
        const cPass = encoder.beginComputePass();
        cPass.setPipeline(countPipeline);
        cPass.setBindGroup(0, countBG);
        cPass.dispatchWorkgroups(ts8, ts8, N);
        cPass.end();
    }

    /** Writes coverage metrics back into the viewpoint features. */
    private applyMetrics(viewpoints: FeatureCollection, rawResults: Uint32Array, tileSize: number): FeatureCollection {
        const totalPixels = tileSize * tileSize;
        return {
            ...viewpoints,
            features: viewpoints.features.map((feature, i) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    compute: {
                        ...(feature.properties?.compute ?? {}),
                        buildingCoverage: rawResults[i] / totalPixels,
                        skyViewFactor: 1 - rawResults[i] / totalPixels,
                    },
                },
            })),
        } as FeatureCollection;
    }
}
