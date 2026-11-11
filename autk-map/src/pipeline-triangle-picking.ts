/**
 * @module PipelineTrianglePicking
 * Picking render pipeline for triangle-based vector layers.
 *
 * This module defines `PipelineTrianglePicking`, a WebGPU pipeline that renders
 * triangle geometry into the renderer's picking target instead of the visible
 * color buffer. Each component is encoded as a unique RGB value so the picking
 * system can recover the hit component from the rendered pixel color. The
 * pipeline supports both 2D triangle layers and 3D triangle geometry such as
 * buildings by switching between 2-component and 3-component vertex layouts.
 */

/// <reference types="@webgpu/types" />

import pickingVertexSource from './shaders/picking.vert.wgsl';
import pickingFragmentSource from './shaders/picking.frag.wgsl';
import picking3dTerrainVertexSource from './shaders/picking-3d-terrain.vert.wgsl';

import { Camera } from '@urban-toolkit/autk-core';
import { Renderer } from './renderer';
import { Pipeline } from './pipeline';
import { VectorLayer } from './layer-vector';
import type { Heightfield } from '@urban-toolkit/autk-core';

/**
 * Picking pipeline for triangle-based vector geometry.
 *
 * `PipelineTrianglePicking` renders mesh components into the picking framebuffer
 * using per-vertex encoded identifiers instead of display colors. The rendered
 * output is used by higher-level picking logic to map a pixel hit back to a
 * layer component. The pipeline can be configured for either 2D triangle data
 * (`xy`) or 3D triangle data (`xyz`).
 */
export class PipelineTrianglePicking extends Pipeline {
    /** Vertex position buffer for the current mesh. */
    private _positionBuffer!: GPUBuffer;

    /** Per-vertex encoded component-id colors used by the picking pass. */
    private _objectIdsBuffer!: GPUBuffer;

    /** Triangle index buffer for indexed drawing. */
    private _indicesBuffer!: GPUBuffer;

    /** Render pipeline used for the picking pass. */
    private _pipeline!: GPURenderPipeline;

    /** Vertex shader module for 2D or 3D picking geometry. */
    protected _vertModule!: GPUShaderModule;

    /** Fragment shader module that writes encoded picking colors. */
    protected _fragModule!: GPUShaderModule;

    /** Vertex component count: `2` for `xy` data, `3` for `xyz` data. */
    private _dimension: number;
    /** Uniform buffer describing the active terrain heightfield for 3D picking. */
    private _terrainUniformBuffer?: GPUBuffer;
    /** Bind group layout for terrain height uniforms and texture sampling. */
    private _terrainBindGroupLayout?: GPUBindGroupLayout;
    /** Bind group containing the active or dummy terrain height source. */
    private _terrainBindGroup?: GPUBindGroup;
    /** Fallback height texture used when terrain mode is disabled. */
    private _dummyTerrainTexture?: GPUTexture;
    /** Reused CPU-side terrain uniform upload buffer. */
    private _terrainUniformData = new Float32Array(8);

    /** Reused CPU-side upload buffer for positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    /** Reused CPU-side upload buffer for encoded component-id colors. */
    private _objectIdsData: Float32Array<ArrayBuffer> | null = null;

    /**
     * Creates a triangle picking pipeline.
     *
     * The `dimension` controls which vertex shader is used and how position
     * data is interpreted when vertex buffers are created and uploaded.
     *
     * @param renderer Renderer that owns the WebGPU device and picking targets.
     * @param dimension Vertex component count. Use `2` for planar triangle
     * layers and `3` for 3D triangle geometry.
     */
    constructor(renderer: Renderer, dimension: number = 2) {
        super(renderer);
        this._dimension = dimension;
    }

    /**
     * Releases GPU resources owned by this pipeline.
     *
     * @returns Destroys the pipeline's vertex and index buffers, then delegates
     * to the base pipeline cleanup.
     */
    override destroy(): void {
        this._positionBuffer?.destroy();
        this._objectIdsBuffer?.destroy();
        this._indicesBuffer?.destroy();
        this._terrainUniformBuffer?.destroy();
        this._dummyTerrainTexture?.destroy();
        super.destroy();
    }

    /**
     * Initializes GPU resources for a triangle layer.
     *
     * This creates shader modules, allocates GPU buffers sized for the provided
     * layer, uploads the current mesh data, and creates the render pipeline used
     * by subsequent picking passes.
     *
     * @param mesh Vector layer that provides triangle positions, indices, and
     * component ranges.
     * @returns Prepares the pipeline for rendering picking passes for `mesh`.
     */
    build(mesh: VectorLayer): void {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createCameraUniformBindGroup();
        if (this._dimension === 3) {
            this.createTerrainHeightBindGroup();
        }
        this.updateVertexBuffers(mesh);

        this.createPipeline();
    }

    /**
     * Creates the shader modules used by the picking pipeline.
     *
     * The vertex shader source depends on the configured vertex dimension. The
     * fragment shader always writes encoded picking colors.
     *
     * @returns Creates and stores the WebGPU shader modules on this instance.
     */
    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: this._dimension === 3 ? picking3dTerrainVertexSource : pickingVertexSource,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: pickingFragmentSource,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Allocates GPU buffers for the provided layer geometry.
     *
     * Buffer sizes are derived from the current layer's position and index
     * arrays, and from the configured vertex dimension used to derive the number
     * of vertices.
     *
     * @param mesh Vector layer that provides the triangle positions and indices.
     * @returns Creates empty GPU buffers ready to receive uploaded mesh data.
     */
    createVertexBuffers(mesh: VectorLayer): void {
        this._positionBuffer = this._renderer.device.createBuffer({
            label: 'Position buffer',
            size: mesh.position.length * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this._objectIdsBuffer = this._renderer.device.createBuffer({
            label: 'Object id buffer',
            size: (mesh.position.length / this._dimension) * 3 * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this._indicesBuffer = this._renderer.device.createBuffer({
            label: 'Primitive indices buffer',
            size: mesh.indices.length * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Creates terrain height bindings for 3D picking.
     *
     * @returns Nothing. A dummy flat height source is bound initially.
     * @throws If GPU buffer, texture, or bind group creation fails.
     * @example
     * pipeline.createTerrainHeightBindGroup();
     */
    createTerrainHeightBindGroup(): void {
        this._terrainUniformBuffer = this._renderer.device.createBuffer({
            label: 'Picking terrain height uniform',
            size: 8 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._dummyTerrainTexture = this._renderer.device.createTexture({
            label: 'Picking dummy terrain height texture',
            size: [2, 2],
            format: 'r32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this._terrainBindGroupLayout = this._renderer.device.createBindGroupLayout({
            label: 'Picking terrain height bind group layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
            ],
        });
        this._terrainBindGroup = this._renderer.device.createBindGroup({
            label: 'Picking terrain height bind group',
            layout: this._terrainBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this._terrainUniformBuffer } },
                { binding: 1, resource: this._dummyTerrainTexture.createView() },
            ],
        });
        this.clearTerrainHeightSource();
    }

    /**
     * Binds a heightfield texture used to offset 3D picking geometry.
     *
     * @param source Heightfield metadata used by the vertex shader.
     * @param heightTextureView GPU texture view containing height samples.
     * @returns Nothing. Calls are ignored before terrain bindings are created.
     * @throws If bind group creation fails.
     * @example
     * pipeline.setTerrainHeightSource(heightfield, terrainHeightTextureView);
     */
    setTerrainHeightSource(source: Heightfield, heightTextureView: GPUTextureView): void {
        if (!this._terrainUniformBuffer || !this._terrainBindGroupLayout) {
            return;
        }

        this._terrainUniformData.set([
            source.originX,
            source.originY,
            source.cellSizeX,
            source.cellSizeY,
            source.width,
            source.height,
            1,
            0,
        ]);
        this._renderer.device.queue.writeBuffer(this._terrainUniformBuffer, 0, this._terrainUniformData);
        this._terrainBindGroup = this._renderer.device.createBindGroup({
            label: 'Picking terrain height bind group',
            layout: this._terrainBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this._terrainUniformBuffer } },
                { binding: 1, resource: heightTextureView },
            ],
        });
    }

    /**
     * Restores the dummy flat height source for 3D picking.
     *
     * @returns Nothing. Calls are ignored before terrain bindings are created.
     * @throws If bind group creation fails.
     * @example
     * pipeline.clearTerrainHeightSource();
     */
    clearTerrainHeightSource(): void {
        if (!this._terrainUniformBuffer || !this._terrainBindGroupLayout || !this._dummyTerrainTexture) {
            return;
        }

        this._terrainUniformData.fill(0);
        this._terrainUniformData[4] = 2;
        this._terrainUniformData[5] = 2;
        this._renderer.device.queue.writeBuffer(this._terrainUniformBuffer, 0, this._terrainUniformData);
        this._terrainBindGroup = this._renderer.device.createBindGroup({
            label: 'Picking terrain height bind group',
            layout: this._terrainBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this._terrainUniformBuffer } },
                { binding: 1, resource: this._dummyTerrainTexture.createView() },
            ],
        });
    }

    /**
     * Uploads mesh data and per-component picking colors to the GPU.
     *
     * Position and index buffers are synchronized directly from the layer. The
     * object-id buffer is rebuilt by walking the layer's component triangle
     * ranges and assigning the same encoded RGB identifier to every vertex index
     * referenced by triangles in that component. Identifier `0` is reserved for
     * "no hit", so encoded component ids start at `1`. Vertices of skipped
     * components keep `0`, so a feature that is hidden cannot be picked.
     *
     * @param layer Vector layer that provides positions, indices, and component
     * triangle boundaries.
     * @returns Updates the pipeline's GPU buffers in place for the current layer state.
     */
    updateVertexBuffers(layer: VectorLayer): void {
        this._positionData = this._syncFloatData(this._positionData, layer.position);
        this._indicesData = this._syncUintData(this._indicesData, layer.indices);

        this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, this._positionData);
        this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, this._indicesData);

        // Prepare per-vertex object IDs
        const numVertices = layer.position.length / this._dimension;
        this._objectIdsData = this._syncFloatLength(this._objectIdsData, numVertices * 3);
        this._objectIdsData.fill(0);

        for (let compId = 0; compId < layer.components.length; compId++) {
            const color = this._encodeIdToRGB(compId);
            const comp = layer.components[compId];

            const sTri = compId > 0 ? layer.components[compId - 1].nTriangles : 0;
            const eTri = comp.nTriangles;

            for (let t = sTri * 3; t < eTri * 3; t++) {
                const vertexIndex = layer.indices[t];
                // A skipped feature is not drawn, so it must not be pickable: its vertices keep the "no hit" id.
                if (layer.skippedVertices[vertexIndex] > 0) { continue; }
                const base = vertexIndex * 3;
                this._objectIdsData[base + 0] = color[0];
                this._objectIdsData[base + 1] = color[1];
                this._objectIdsData[base + 2] = color[2];
            }
        }

        this._renderer.device.queue.writeBuffer(this._objectIdsBuffer, 0, this._objectIdsData);
    }

    /**
     * Encodes a component id as a normalized RGB picking color.
     *
     * The encoded value is offset by one so the all-zero color remains reserved
     * for pixels where no geometry was hit.
     *
     * @param id Zero-based component identifier.
     * @returns Three normalized color channels representing the encoded id.
     */
    private _encodeIdToRGB(id: number): [number, number, number] {
        const shifted = id + 1; // reserve 0 for "no hit"
        const r = (shifted & 0xff) / 255;
        const g = ((shifted >> 8) & 0xff) / 255;
        const b = ((shifted >> 16) & 0xff) / 255;
        return [r, g, b];
    }

    /**
     * Creates the WebGPU render pipeline for triangle picking.
     *
     * The pipeline uses two vertex buffers: positions and encoded picking
     * colors. It renders into the renderer's `rgba8unorm` picking target and
     * shares the camera bind group layout defined by the base pipeline.
     *
     * @returns Creates and stores the render pipeline used by `renderPass`.
     */
    private createPipeline(): void {
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0,
            offset: 0,
            format: this._dimension === 3 ? 'float32x3' : 'float32x2',
        };
        const idAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: 0,
            format: 'float32x3',
        };

        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc],
            arrayStride: 4 * this._dimension,
            stepMode: 'vertex',
        };

        const idBufferDesc: GPUVertexBufferLayout = {
            attributes: [idAttribDesc],
            arrayStride: 4 * 3,
            stepMode: 'vertex',
        };

        // Vertex Shader
        const vertex: GPUVertexState = {
            module: this._vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc, idBufferDesc],
        };

        // Fragment Shader
        const fragment: GPUFragmentState = {
            module: this._fragModule,
            entryPoint: 'main',
            targets: [
                {
                    format: 'rgba8unorm',
                },
            ],
        };

        // Rasterization
        const primitive: GPUPrimitiveState = {
            frontFace: 'cw',
            cullMode: 'none',
            topology: 'triangle-list',
        };

        // Depth test
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: this._dimension === 3,
            depthCompare: this._dimension === 3 ? 'greater-equal' : 'always',
            format: 'depth32float',
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: this._dimension === 3
                ? [this._cameraBindGroupLayout, this._terrainBindGroupLayout!]
                : [this._cameraBindGroupLayout],
        };

        // Pipeline
        const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout,
            vertex,
            fragment,
            primitive,
            depthStencil,
            label: 'Pipeline triangle picking',
        };
        this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
    }

    /**
     * Renders this layer into the picking framebuffer.
     *
     * The pass uses the renderer's dedicated picking color and depth targets,
     * updates camera uniforms for the supplied view, and issues an indexed draw
     * only when the index buffer contains data. The optional pass encoder
     * parameter is ignored because this method creates and completes its own
     * render pass.
     *
     * @param camera Camera providing the current view and projection uniforms.
     * @param _passEncoder Unused external pass encoder.
     * @returns Records a picking render pass on the renderer's current command encoder.
     */
    renderPass(camera: Camera, passEncoder?: GPURenderPassEncoder): void {
        if (!this._renderer) {
            return;
        }

        const ownsPass = !passEncoder;
        passEncoder ??= this._renderer.commandEncoder.beginRenderPass({
            colorAttachments: [this._renderer.pickingBuffer],
            depthStencilAttachment: this._renderer.pickingDepthBuffer,
        });

        // sets the current pipeline
        passEncoder.setPipeline(this._pipeline);

        // updates camera
        this.updateCameraUniforms(camera);

        // sets the vertex buffers
        passEncoder.setVertexBuffer(0, this._positionBuffer);
        passEncoder.setVertexBuffer(1, this._objectIdsBuffer);

        // sets primitive indices buffer
        passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

        // sets the uniform buffers
        passEncoder.setBindGroup(0, this._cameraBindGroup);
        if (this._dimension === 3 && this._terrainBindGroup) {
            passEncoder.setBindGroup(1, this._terrainBindGroup);
        }

        // draw command
        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) { passEncoder.drawIndexed(indexCount); }
        if (ownsPass) {
            passEncoder.end();
        }
    }

}
