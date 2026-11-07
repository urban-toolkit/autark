/// <reference types="@webgpu/types" />

/**
 * @module PipelineTiles
 * WebGPU pipeline that draws map tiles.
 *
 * It uses the raster shaders: a textured quad with a layer opacity, premultiplied
 * alpha and no depth write. Unlike the raster pipeline, the geometry changes
 * every frame, so the vertex and index buffers are rewritten from a
 * {@link TileFrame} and each tile is a separate draw with its own texture bind
 * group.
 */

import rasterVertexSource from './shaders/raster.vert.wgsl';
import rasterFragmentSource from './shaders/raster.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';
import type { Layer } from './layer';
import type { TileFrame } from './tile-frame';
import { nextPowerOfTwo } from './utils-math';

import { Camera } from '@urban-toolkit/autk-core';

/** A tile image on the GPU and the bind group that samples it. */
export interface TileTexture {
    /** The texture; destroy it when the tile leaves the cache. */
    texture: GPUTexture;
    /** Bind group for group 2 of the raster shader. */
    bindGroup: GPUBindGroup;
    /** Image width in pixels. */
    width: number;
    /** Image height in pixels. */
    height: number;
}

/** Bytes per pixel of the `rgba8unorm` format tile textures use. */
export const TILE_TEXTURE_BYTES_PER_PIXEL = 4;

const INITIAL_VERTICES = 1024;
const INITIAL_INDICES = 2048;

/** Draws a {@link TileFrame}. */
export class PipelineTiles extends Pipeline {
    private _vertModule!: GPUShaderModule;
    private _fragModule!: GPUShaderModule;
    private _pipeline!: GPURenderPipeline;

    private _positionBuffer: GPUBuffer | null = null;
    private _texCoordBuffer: GPUBuffer | null = null;
    private _indicesBuffer: GPUBuffer | null = null;
    private _vertexCapacity = 0;
    private _indexCapacity = 0;

    private _tileBindGroupLayout!: GPUBindGroupLayout;
    private _sampler!: GPUSampler;

    /**
     * Creates the pipeline.
     *
     * @param renderer - Renderer providing the device and canvas format.
     */
    constructor(renderer: Renderer) {
        super(renderer);
    }

    /**
     * Builds shaders, uniform bind groups and the render pipeline.
     *
     * @param layer - Layer whose render state seeds the uniforms.
     */
    build(layer: Layer): void {
        const device = this._renderer.device;
        this._vertModule = device.createShaderModule({ code: rasterVertexSource });
        this._fragModule = device.createShaderModule({ code: rasterFragmentSource });

        this.createColorUniformBindGroup();
        this.createCameraUniformBindGroup();
        this.createTileBindGroupLayout();
        this.createPipeline();
        this.updateColorUniforms(layer);
    }

    /** No fixed geometry: buffers are sized by the first frame. */
    createVertexBuffers(): void {}

    /** Geometry is uploaded per frame by {@link renderFrame}. */
    updateVertexBuffers(): void {}

    /**
     * Uploads a decoded tile image to a new texture.
     *
     * @param bitmap - Decoded image. The caller closes it.
     * @returns The texture and the bind group that samples it.
     */
    createTileTexture(bitmap: ImageBitmap): TileTexture {
        const device = this._renderer.device;
        const texture = device.createTexture({
            label: 'Tile texture',
            size: { width: bitmap.width, height: bitmap.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture, premultipliedAlpha: false },
            { width: bitmap.width, height: bitmap.height },
        );
        const bindGroup = device.createBindGroup({
            label: 'Tile bind group',
            layout: this._tileBindGroupLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: this._sampler },
            ],
        });
        return { texture, bindGroup, width: bitmap.width, height: bitmap.height };
    }

    /**
     * Draws a frame.
     *
     * @param camera - Camera for this pass.
     * @param passEncoder - Open render pass.
     * @param frame - Geometry and draw records of the visible tiles.
     */
    renderFrame(camera: Camera, passEncoder: GPURenderPassEncoder, frame: TileFrame<TileTexture>): void {
        if (frame.draws.length === 0) return;
        this.uploadFrame(frame);

        passEncoder.setPipeline(this._pipeline);
        this.updateCameraUniforms(camera);
        passEncoder.setVertexBuffer(0, this._positionBuffer!);
        passEncoder.setVertexBuffer(1, this._texCoordBuffer!);
        passEncoder.setIndexBuffer(this._indicesBuffer!, 'uint32');
        passEncoder.setBindGroup(0, this._renderInfoBindGroup);
        passEncoder.setBindGroup(1, this._cameraBindGroup);

        for (const draw of frame.draws) {
            passEncoder.setBindGroup(2, draw.ref.bindGroup);
            passEncoder.drawIndexed(draw.indexCount, 1, draw.firstIndex, draw.baseVertex, 0);
        }
    }

    /** Required by the base class; frames are drawn with {@link renderFrame}. */
    renderPass(): void {}

    override destroy(): void {
        this._positionBuffer?.destroy();
        this._texCoordBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._positionBuffer = this._texCoordBuffer = this._indicesBuffer = null;
        super.destroy();
    }

    private uploadFrame(frame: TileFrame<TileTexture>): void {
        const device = this._renderer.device;
        const vertices = frame.positions.length / 2;
        const indices = frame.indices.length;

        if (!this._positionBuffer || vertices > this._vertexCapacity) {
            this._positionBuffer?.destroy();
            this._texCoordBuffer?.destroy();
            this._vertexCapacity = Math.max(INITIAL_VERTICES, nextPowerOfTwo(vertices));
            this._positionBuffer = device.createBuffer({
                label: 'Tile position buffer',
                size: this._vertexCapacity * 2 * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this._texCoordBuffer = device.createBuffer({
                label: 'Tile texture coordinate buffer',
                size: this._vertexCapacity * 2 * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        if (!this._indicesBuffer || indices > this._indexCapacity) {
            this._indicesBuffer?.destroy();
            this._indexCapacity = Math.max(INITIAL_INDICES, nextPowerOfTwo(indices));
            this._indicesBuffer = device.createBuffer({
                label: 'Tile index buffer',
                size: this._indexCapacity * 4,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
        }

        device.queue.writeBuffer(this._positionBuffer, 0, frame.positions as Float32Array<ArrayBuffer>);
        device.queue.writeBuffer(this._texCoordBuffer!, 0, frame.texCoords as Float32Array<ArrayBuffer>);
        device.queue.writeBuffer(this._indicesBuffer, 0, frame.indices as Uint32Array<ArrayBuffer>);
    }

    private createTileBindGroupLayout(): void {
        const device = this._renderer.device;
        this._sampler = device.createSampler({
            label: 'Tile sampler',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
        this._tileBindGroupLayout = device.createBindGroupLayout({
            label: 'Tile bind group layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });
    }

    private createPipeline(): void {
        const device = this._renderer.device;
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [
                { attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], arrayStride: 8, stepMode: 'vertex' },
                { attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }], arrayStride: 8, stepMode: 'vertex' },
            ],
        };
        const blend: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
        const fragment: GPUFragmentState = {
            module: this._fragModule,
            entryPoint: 'main',
            targets: [{ format: this._renderer.canvasFormat, blend: { color: blend, alpha: blend } }],
        };
        const layout = device.createPipelineLayout({
            bindGroupLayouts: [this._renderInfoBindGroupLayout, this._cameraBindGroupLayout, this._tileBindGroupLayout],
        });
        this._pipeline = device.createRenderPipeline({
            label: 'Pipeline Tiles',
            layout,
            vertex,
            fragment,
            primitive: { frontFace: 'cw', cullMode: 'none', topology: 'triangle-list' },
            depthStencil: { depthWriteEnabled: false, depthCompare: 'greater-equal', format: 'depth32float' },
            multisample: { count: this._renderer.sampleCount },
        });
    }
}
