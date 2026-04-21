/// <reference types="@webgpu/types" />

import pickingVertexSource from './shaders/picking.vert.wgsl';
import pickingFragmentSource from './shaders/picking.frag.wgsl';
import picking3dVertexSource from './shaders/picking-3d.vert.wgsl';

import { Camera } from './types-core';
import { Renderer } from './renderer';
import { Pipeline } from './pipeline';
import { VectorLayer } from './layer-vector';

/**
 * PipelineTrianglePicking is a rendering pipeline for picking triangles in 2D space.
 * It uses WebGPU to render triangles and allows for picking by encoding object IDs in vertex colors.
 */
export class PipelineTrianglePicking extends Pipeline {
    /**
     * Position buffer for vertex data.
     * @type {GPUBuffer}
     */
    private _positionBuffer!: GPUBuffer;

    /**
     * Buffer for object IDs.
     * @type {GPUBuffer}
     */
    private _objectIdsBuffer!: GPUBuffer;

    /**
     * Buffer for primitive indices.
     * @type {GPUBuffer}
     */
    private _indicesBuffer!: GPUBuffer;

    /**
     * Render pipeline for drawing triangles.
     * @type {GPURenderPipeline}
     */
    private _pipeline!: GPURenderPipeline;

    /**
     * Vertex shader module.
     * @type {GPUShaderModule}
     */
    protected _vertModule!: GPUShaderModule;

    /**
     * Fragment shader module.
     * @type {GPUShaderModule}
     */
    protected _fragModule!: GPUShaderModule;

    /**
     * Vertex dimension: 2 for 2D layers (xy), 3 for 3D buildings (xyz).
     */
    private _dimension: number;

    /** Reused upload buffer for positions. */
    private _positionData: Float32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for indices. */
    private _indicesData: Uint32Array<ArrayBuffer> | null = null;
    /** Reused upload buffer for encoded object-id colors. */
    private _objectIdsData: Float32Array<ArrayBuffer> | null = null;

    /**
     * Constructor for PipelineTrianglePicking
     * @param {Renderer} renderer The renderer instance
     * @param {number} dimension Vertex dimension — 2 for 2D layers, 3 for 3D buildings.
     */
    constructor(renderer: Renderer, dimension: number = 2) {
        super(renderer);
        this._dimension = dimension;
    }

    /** Releases GPU resources owned by this pipeline. */
    override destroy(): void {
        this._positionBuffer?.destroy();
        this._objectIdsBuffer?.destroy();
        this._indicesBuffer?.destroy();
        super.destroy();
    }

    /**
     * Builds the pipeline with the provided mesh data.
     * @param {VectorLayer} mesh The mesh data containing positions, thematic, and indices
     */
    build(mesh: VectorLayer): void {
        this.createShaders();

        this.createVertexBuffers(mesh);
        this.createCameraUniformBindGroup();
        this.updateVertexBuffers(mesh);

        this.createPipeline();
    }

    /**
     * Creates the vertex and fragment shaders for the pipeline.
     */
    createShaders(): void {
        // Vertex shader
        const vsmDesc = {
            code: this._dimension === 3 ? picking3dVertexSource : pickingVertexSource,
        };
        this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

        // Fragment shader
        const fsmDesc = {
            code: pickingFragmentSource,
        };
        this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
    }

    /**
     * Creates the vertex buffers for the pipeline.
     * @param {VectorLayer} mesh The mesh data containing positions, thematic, and indices
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
     * Updates the vertex buffers with the provided mesh data.
     * @param {VectorLayer} layer The mesh data containing positions, thematic, and indices
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
                const base = vertexIndex * 3;
                this._objectIdsData[base + 0] = color[0];
                this._objectIdsData[base + 1] = color[1];
                this._objectIdsData[base + 2] = color[2];
            }
        }

        this._renderer.device.queue.writeBuffer(this._objectIdsBuffer, 0, this._objectIdsData);
    }

    /**
     * Encodes an object ID to RGB color for picking.
     * @param {number} id The object ID to encode
     * @returns {[number, number, number]} The encoded RGB color
     */
    private _encodeIdToRGB(id: number): [number, number, number] {
        const shifted = id + 1; // reserve 0 for "no hit"
        const r = (shifted & 0xff) / 255;
        const g = ((shifted >> 8) & 0xff) / 255;
        const b = ((shifted >> 16) & 0xff) / 255;
        return [r, g, b];
    }

    /**
     * Creates the render pipeline for drawing triangles.
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
            depthWriteEnabled: false,
            depthCompare: 'greater-equal',
            format: 'depth32float',
        };

        // Uniform Data
        const pipelineLayoutDesc = {
            bindGroupLayouts: [this._cameraBindGroupLayout],
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
     * Renders the picking pass for the pipeline.
     * @param {Camera} camera The camera instance
     */
    renderPass(camera: Camera): void {
        if (!this._renderer) {
            return;
        }

        // Create a new command encoder
        const commandEncoder = this._renderer.commandEncoder;

        // Render pass description
        const pickingPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._renderer.pickingBuffer],
            depthStencilAttachment: this._renderer.pickingDepthBuffer,
        };

        // Create a new pass commands encoder
        const passEncoder = commandEncoder.beginRenderPass(pickingPassDesc);

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

        // draw command
        const indexCount = this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT;
        if (indexCount > 0) { passEncoder.drawIndexed(indexCount); }
        passEncoder.end();
    }

}
