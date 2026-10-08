/**
 * @module renderer-terrain
 * Low-level WebGPU renderer for heightfield terrain.
 *
 * This module owns terrain-specific GPU resources: patch meshes, height
 * textures, terrain render pipelines, picking pipelines, LOD selection, and the
 * visible-bounds reduction pass used by terrain overlay rendering.
 */

import type { Camera } from '@urban-toolkit/autk-core';
import terrainFragmentSource from './shaders/terrain.frag.wgsl';
import terrainPickingFragmentSource from './shaders/terrain-picking.frag.wgsl';
import terrainVertexSource from './shaders/terrain.vert.wgsl';
import terrainBoundsReduceSource from './shaders/terrain-bounds-reduce.comp.wgsl';
import type { Heightfield } from '@urban-toolkit/autk-core';

/** Number of grid cells per terrain patch side. */
const PATCH_CELLS = 32;
/** Number of patch vertices per side. */
const PATCH_VERTICES = PATCH_CELLS + 1;
/** Largest quadtree LOD level allowed for terrain blocks. */
const MAX_LOD_LEVEL = 7;
/** Maximum terrain block instances uploaded in one frame. */
const MAX_INSTANCES = 4096;
/** Target projected terrain cell size used by LOD splitting. */
const TARGET_CELL_PIXELS = 30;
/** Reference height used when estimating terrain block distances. */
const TERRAIN_LOD_REFERENCE_HEIGHT = 0;
/** Offscreen texture size used to estimate visible terrain bounds. */
const BOUNDS_PREPASS_SIZE = 512;
/** Workgroup size used by the visible-bounds reduction compute shader. */
const REDUCE_WORKGROUP_SIZE = 256;
/** Number of pixels reduced by the first visible-bounds pass. */
const BOUNDS_PIXEL_COUNT = BOUNDS_PREPASS_SIZE * BOUNDS_PREPASS_SIZE;
/** Number of intermediate values emitted by reduction pass one. */
const BOUNDS_PASS_1_COUNT = Math.ceil(BOUNDS_PIXEL_COUNT / REDUCE_WORKGROUP_SIZE);
/** Number of intermediate values emitted by reduction pass two. */
const BOUNDS_PASS_2_COUNT = Math.ceil(BOUNDS_PASS_1_COUNT / REDUCE_WORKGROUP_SIZE);
/** Number of final vector groups emitted by reduction pass three. */
const BOUNDS_PASS_3_COUNT = Math.ceil(BOUNDS_PASS_2_COUNT / REDUCE_WORKGROUP_SIZE);

/** Frustum plane stored as `[a, b, c, d]` for `ax + by + cz + d >= 0`. */
type Plane = [number, number, number, number];

/** GPU buffers and counts for one reusable terrain patch mesh. */
interface TerrainMesh {
    /** Vertex buffer containing patch-local grid coordinates. */
    vertexBuffer: GPUBuffer;
    /** Triangle index buffer used for filled terrain rendering. */
    indexBuffer: GPUBuffer;
    /** Line index buffer used by mesh debug rendering. */
    lineIndexBuffer: GPUBuffer;
    /** Number of triangle indices in `indexBuffer`. */
    indexCount: number;
    /** Number of line indices in `lineIndexBuffer`. */
    lineIndexCount: number;
}

/** Candidate terrain quadtree block selected for rendering. */
interface BlockCandidate {
    /** Local-space block minimum X coordinate. */
    x: number;
    /** Local-space block minimum Y coordinate. */
    y: number;
    /** Local-space block width and height. */
    size: number;
    /** Quadtree LOD level for the block. */
    level: number;
    /** Seam flag for the minimum-X edge. */
    seamXMin: number;
    /** Seam flag for the maximum-X edge. */
    seamXMax: number;
    /** Seam flag for the minimum-Y edge. */
    seamYMin: number;
    /** Seam flag for the maximum-Y edge. */
    seamYMax: number;
}

/**
 * Runtime debug options for terrain rendering.
 */
export interface TerrainDebugOptions {
    /** Draw patch wireframe lines on top of filled terrain. */
    showMesh?: boolean;
    /** Enable frustum culling when selecting terrain blocks. */
    enableCulling?: boolean;
    /** Reuse the previous LOD block selection instead of recomputing it. */
    freezeLod?: boolean;
}

/**
 * Per-frame terrain selection statistics.
 */
export interface TerrainStats {
    /** Number of terrain blocks selected for the current frame. */
    selectedBlocks: number;
    /** Number of triangles emitted by selected blocks. */
    triangles: number;
    /** Number of quadtree blocks rejected by culling. */
    culledBlocks: number;
}

/**
 * Renders heightfield terrain and terrain-specific auxiliary passes.
 *
 * The renderer owns GPU resources derived from one heightfield and exposes pass
 * methods used by the terrain map render path.
 */
export class TerrainRenderer {
    /** Selection statistics from the most recent `update` call. */
    readonly stats: TerrainStats = { selectedBlocks: 0, triangles: 0, culledBlocks: 0 };
    /** Local-space heightfield bounds as `[minX, minY, maxX, maxY]`. */
    readonly bounds: [number, number, number, number];

    /** Main terrain color pipeline. */
    private readonly pipeline: GPURenderPipeline;
    /** Depth-only pipeline used for terrain occlusion. */
    private readonly depthPipeline: GPURenderPipeline;
    /** Wireframe overlay pipeline used by mesh debug mode. */
    private readonly meshPipeline: GPURenderPipeline;
    /** Picking pipeline that maps terrain-projected overlay ids to screen pixels. */
    private readonly pickingPipeline: GPURenderPipeline;
    /** Debug bounds line pipeline. */
    private readonly boundsPipeline: GPURenderPipeline;
    /** Prepass pipeline that writes visible terrain positions for reduction. */
    private readonly visibleBoundsPipeline: GPURenderPipeline;
    /** Compute pipeline that reduces prepass texture pixels into partial bounds. */
    private readonly reduceTexturePipeline: GPUComputePipeline;
    /** Compute pipeline that reduces partial bounds buffers. */
    private readonly reduceBufferPipeline: GPUComputePipeline;
    /** Uniform buffer containing camera, bounds, and heightfield parameters. */
    private readonly cameraBuffer: GPUBuffer;
    /** Bind group used by main, depth, mesh, and bounds passes. */
    private readonly bindGroup: GPUBindGroup;
    /** Bind group used by terrain picking. */
    private readonly pickingBindGroup: GPUBindGroup;
    /** Instance buffer containing selected terrain blocks. */
    private readonly instanceBuffer: GPUBuffer;
    /** Dynamic vertex buffer used to draw frozen overlay bounds. */
    private readonly boundsVertexBuffer: GPUBuffer;
    /** GPU texture containing heightfield sample values. */
    private readonly heightTexture: GPUTexture;
    /** Texture view for `heightTexture`. */
    private readonly heightTextureView: GPUTextureView;
    /** Offscreen color texture used by visible-bounds prepass. */
    private readonly visibleBoundsTexture: GPUTexture;
    /** Depth texture paired with `visibleBoundsTexture`. */
    private readonly visibleBoundsDepthTexture: GPUTexture;
    /** Texture view for visible-bounds color output. */
    private readonly visibleBoundsTextureView: GPUTextureView;
    /** Texture view for visible-bounds depth output. */
    private readonly visibleBoundsDepthTextureView: GPUTextureView;
    /** Compute parameters for reducing visible-bounds texture pixels. */
    private readonly reduceParamsTextureBuffer: GPUBuffer;
    /** Compute parameters for reduction pass two. */
    private readonly reduceParamsPass2Buffer: GPUBuffer;
    /** Compute parameters for reduction pass three. */
    private readonly reduceParamsPass3Buffer: GPUBuffer;
    /** First partial reduction storage buffer. */
    private readonly reducePartialA: GPUBuffer;
    /** Second partial reduction storage buffer. */
    private readonly reducePartialB: GPUBuffer;
    /** Final reduced bounds storage buffer. */
    private readonly reduceFinal: GPUBuffer;
    /** CPU-readable buffer used to retrieve reduced bounds. */
    private readonly reduceReadback: GPUBuffer;
    /** Bind group for reducing the visible-bounds texture. */
    private readonly reduceTextureBindGroup: GPUBindGroup;
    /** Bind group for the second reduction pass. */
    private readonly reducePass2BindGroup: GPUBindGroup;
    /** Bind group for the third reduction pass. */
    private readonly reducePass3BindGroup: GPUBindGroup;
    /** Reusable terrain patch mesh drawn once per selected block. */
    private readonly mesh: TerrainMesh;
    /** CPU-side instance upload buffer for terrain block metadata. */
    private readonly instanceData = new Float32Array(MAX_INSTANCES * 8);
    /** Last selected terrain blocks, reused when LOD freezing is enabled. */
    private readonly lastBlocks: BlockCandidate[] = [];
    /** Most recent GPU-reduced visible bounds, if readback has completed. */
    private latestReducedBounds: [number, number, number, number] | null = null;
    /** Whether a visible-bounds readback has been requested but not consumed. */
    private boundsReadbackPending = false;
    /** Whether the readback buffer is currently mapped or awaiting mapping. */
    private boundsReadbackInFlight = false;
    /** Whether a frame drew while a readback was in flight, so the bounds of its own view were never read back. */
    private boundsReadbackSkipped = false;
    /** Number of block instances uploaded for the current frame. */
    private instanceCount = 0;

    /**
     * Creates terrain GPU resources for one heightfield.
     *
     * @param device WebGPU device used to allocate buffers, textures, and pipelines.
     * @param colorFormat Color format of the main canvas render target.
     * @param depthFormat Depth format used by terrain render passes.
     * @param sampleCount Multisample count used by color pipelines.
     * @param _heightfield Local-space height samples used to build the terrain texture.
     * @param overlayTextureView Texture view containing projected map overlay colors.
     * @param overlayPickingTextureView Texture view containing projected map picking ids.
     * @throws If WebGPU resource or pipeline creation fails.
     * @example
     * const terrain = new TerrainRenderer(device, format, 'depth32float', 4, heightfield, overlayView, pickingView);
     */
    constructor(
        private readonly device: GPUDevice,
        colorFormat: GPUTextureFormat,
        depthFormat: GPUTextureFormat,
        sampleCount: number,
        private readonly _heightfield: Heightfield,
        overlayTextureView: GPUTextureView,
        overlayPickingTextureView: GPUTextureView,
    ) {
        this.bounds = this._heightfield.bounds;
        this.mesh = createPatchMesh(device);
        this.cameraBuffer = device.createBuffer({
            label: 'Terrain camera uniform buffer',
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.instanceBuffer = device.createBuffer({
            label: 'Terrain block instance buffer',
            size: this.instanceData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.boundsVertexBuffer = device.createBuffer({
            label: 'Terrain overlay bounds debug vertices',
            size: 12 * 3 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.heightTexture = device.createTexture({
            label: 'Terrain height field texture',
            size: [this._heightfield.width, this._heightfield.height],
            format: 'r32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.heightTextureView = this.heightTexture.createView();
        device.queue.writeTexture(
            { texture: this.heightTexture },
            this._heightfield.data,
            { bytesPerRow: this._heightfield.width * Float32Array.BYTES_PER_ELEMENT, rowsPerImage: this._heightfield.height },
            { width: this._heightfield.width, height: this._heightfield.height },
        );
        this.visibleBoundsTexture = device.createTexture({
            label: 'Terrain visible bounds prepass texture',
            size: [BOUNDS_PREPASS_SIZE, BOUNDS_PREPASS_SIZE],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.visibleBoundsDepthTexture = device.createTexture({
            label: 'Terrain visible bounds prepass depth texture',
            size: [BOUNDS_PREPASS_SIZE, BOUNDS_PREPASS_SIZE],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.visibleBoundsTextureView = this.visibleBoundsTexture.createView();
        this.visibleBoundsDepthTextureView = this.visibleBoundsDepthTexture.createView();
        this.reduceParamsTextureBuffer = createReduceParamsBuffer(device, BOUNDS_PIXEL_COUNT, BOUNDS_PREPASS_SIZE, BOUNDS_PREPASS_SIZE);
        this.reduceParamsPass2Buffer = createReduceParamsBuffer(device, BOUNDS_PASS_1_COUNT, 0, 0);
        this.reduceParamsPass3Buffer = createReduceParamsBuffer(device, BOUNDS_PASS_2_COUNT, 0, 0);
        this.reducePartialA = createStorageBuffer(device, BOUNDS_PASS_1_COUNT, 'Terrain bounds reduce partial A');
        this.reducePartialB = createStorageBuffer(device, BOUNDS_PASS_2_COUNT, 'Terrain bounds reduce partial B');
        this.reduceFinal = createStorageBuffer(device, BOUNDS_PASS_3_COUNT, 'Terrain bounds reduce final');
        this.reduceReadback = device.createBuffer({
            label: 'Terrain bounds readback buffer',
            size: 4 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const overlaySampler = device.createSampler({
            label: 'Terrain overlay sampler',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'linear',
            minFilter: 'linear',
        });
        const bindGroupLayout = device.createBindGroupLayout({
            label: 'Terrain bind group layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'unfilterable-float' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            ],
        });
        this.bindGroup = device.createBindGroup({
            label: 'Terrain bind group',
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer } },
                { binding: 1, resource: this.heightTextureView },
                { binding: 2, resource: overlaySampler },
                { binding: 3, resource: overlayTextureView },
            ],
        });
        this.pickingBindGroup = device.createBindGroup({
            label: 'Terrain picking bind group',
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer } },
                { binding: 1, resource: this.heightTextureView },
                { binding: 2, resource: overlaySampler },
                { binding: 3, resource: overlayPickingTextureView },
            ],
        });

        const vertexShaderModule = device.createShaderModule({ label: 'Terrain vertex shader', code: terrainVertexSource });
        const fragmentShaderModule = device.createShaderModule({ label: 'Terrain fragment shader', code: terrainFragmentSource });
        const pickingFragmentShaderModule = device.createShaderModule({ label: 'Terrain picking fragment shader', code: terrainPickingFragmentSource });
        const reduceShaderModule = device.createShaderModule({ label: 'Terrain bounds reduce shader', code: terrainBoundsReduceSource });
        const vertexBuffers: GPUVertexBufferLayout[] = [
            {
                arrayStride: 12,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: 'float32x2' },
                    { shaderLocation: 2, offset: 8, format: 'float32' },
                ],
            },
            {
                arrayStride: 32,
                stepMode: 'instance',
                attributes: [
                    { shaderLocation: 1, offset: 0, format: 'float32x4' },
                    { shaderLocation: 3, offset: 16, format: 'float32x4' },
                ],
            },
        ];
        const layout = device.createPipelineLayout({ label: 'Terrain pipeline layout', bindGroupLayouts: [bindGroupLayout] });
        this.pipeline = device.createRenderPipeline({
            label: 'LOD terrain pipeline',
            layout,
            vertex: { module: vertexShaderModule, entryPoint: 'vertexMain', buffers: vertexBuffers },
            fragment: { module: fragmentShaderModule, entryPoint: 'fragmentMain', targets: [{ format: colorFormat }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'greater-equal', format: depthFormat },
            multisample: { count: sampleCount },
        });
        this.depthPipeline = device.createRenderPipeline({
            label: 'LOD terrain composite depth pipeline',
            layout,
            vertex: { module: vertexShaderModule, entryPoint: 'vertexMain', buffers: vertexBuffers },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'greater-equal', format: 'depth32float' },
        });
        this.meshPipeline = device.createRenderPipeline({
            label: 'LOD terrain mesh overlay pipeline',
            layout,
            vertex: { module: vertexShaderModule, entryPoint: 'meshVertexMain', buffers: vertexBuffers },
            fragment: { module: fragmentShaderModule, entryPoint: 'meshFragmentMain', targets: [{ format: colorFormat }] },
            primitive: { topology: 'line-list' },
            depthStencil: { depthWriteEnabled: false, depthCompare: 'greater-equal', format: depthFormat },
            multisample: { count: sampleCount },
        });
        this.pickingPipeline = device.createRenderPipeline({
            label: 'LOD terrain picking pipeline',
            layout,
            vertex: { module: vertexShaderModule, entryPoint: 'vertexMain', buffers: vertexBuffers },
            fragment: { module: pickingFragmentShaderModule, entryPoint: 'pickingFragmentMain', targets: [{ format: 'rgba8unorm' }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'greater-equal', format: 'depth32float' },
        });
        this.boundsPipeline = device.createRenderPipeline({
            label: 'Terrain overlay bounds debug pipeline',
            layout,
            vertex: {
                module: vertexShaderModule,
                entryPoint: 'boundsVertexMain',
                buffers: [
                    {
                        arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                    },
                ],
            },
            fragment: { module: fragmentShaderModule, entryPoint: 'boundsFragmentMain', targets: [{ format: colorFormat }] },
            primitive: { topology: 'line-list' },
            depthStencil: { depthWriteEnabled: false, depthCompare: 'greater-equal', format: depthFormat },
            multisample: { count: sampleCount },
        });
        this.visibleBoundsPipeline = device.createRenderPipeline({
            label: 'Terrain visible bounds prepass pipeline',
            layout,
            vertex: { module: vertexShaderModule, entryPoint: 'visibleBoundsVertexMain', buffers: vertexBuffers },
            fragment: { module: fragmentShaderModule, entryPoint: 'visibleBoundsFragmentMain', targets: [{ format: 'rgba16float' }] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: { depthWriteEnabled: true, depthCompare: 'greater-equal', format: 'depth32float' },
        });
        const reduceTextureBindGroupLayout = device.createBindGroupLayout({
            label: 'Terrain bounds texture reduce bind group layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ],
        });
        const reduceBufferBindGroupLayout = device.createBindGroupLayout({
            label: 'Terrain bounds buffer reduce bind group layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ],
        });
        const emptyBindGroupLayout = device.createBindGroupLayout({
            label: 'Terrain bounds empty bind group layout',
            entries: [],
        });
        this.reduceTexturePipeline = device.createComputePipeline({
            label: 'Terrain bounds texture reduce pipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [reduceTextureBindGroupLayout] }),
            compute: { module: reduceShaderModule, entryPoint: 'reduceTexture' },
        });
        this.reduceBufferPipeline = device.createComputePipeline({
            label: 'Terrain bounds buffer reduce pipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [emptyBindGroupLayout, reduceBufferBindGroupLayout] }),
            compute: { module: reduceShaderModule, entryPoint: 'reduceBuffer' },
        });
        this.reduceTextureBindGroup = device.createBindGroup({
            label: 'Terrain bounds texture reduce bind group',
            layout: reduceTextureBindGroupLayout,
            entries: [
                { binding: 0, resource: this.visibleBoundsTextureView },
                { binding: 1, resource: { buffer: this.reducePartialA } },
                { binding: 2, resource: { buffer: this.reduceParamsTextureBuffer } },
            ],
        });
        this.reducePass2BindGroup = device.createBindGroup({
            label: 'Terrain bounds reduce pass 2 bind group',
            layout: reduceBufferBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.reducePartialA } },
                { binding: 1, resource: { buffer: this.reducePartialB } },
                { binding: 2, resource: { buffer: this.reduceParamsPass2Buffer } },
            ],
        });
        this.reducePass3BindGroup = device.createBindGroup({
            label: 'Terrain bounds reduce pass 3 bind group',
            layout: reduceBufferBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.reducePartialB } },
                { binding: 1, resource: { buffer: this.reduceFinal } },
                { binding: 2, resource: { buffer: this.reduceParamsPass3Buffer } },
            ],
        });
    }

    /**
     * Returns the heightfield used by this terrain renderer.
     *
     * @returns Source heightfield passed to the constructor.
     * @throws Never throws.
     * @example
     * const heightfield = terrain.heightfield;
     */
    get heightfield(): Heightfield {
        return this._heightfield;
    }

    /**
     * Returns the GPU texture view containing height samples.
     *
     * @returns Texture view suitable for terrain-aware building pipelines.
     * @throws Never throws.
     * @example
     * layer.setTerrainHeightSource(terrain.heightfield, terrain.terrainHeightTextureView);
     */
    get terrainHeightTextureView(): GPUTextureView {
        return this.heightTextureView;
    }

    /**
     * Returns the latest GPU-reduced visible bounds, if available.
     *
     * @returns Bounds as `[minX, minY, maxX, maxY]`, or `null` before readback completes.
     * @throws Never throws.
     * @example
     * const bounds = terrain.visibleBounds;
     */
    get visibleBounds(): [number, number, number, number] | null {
        return this.latestReducedBounds;
    }

    /**
     * Updates camera uniforms and terrain block instances for the next passes.
     *
     * @param camera Current perspective camera.
     * @param overlayBounds World bounds covered by the overlay texture.
     * @param overlayUvRect UV rectangle inside the overlay texture.
     * @param waterColor Normalized RGB water color used by terrain shading.
     * @param debug Runtime debug flags controlling LOD, culling, and mesh display.
     * @returns Nothing. GPU buffers are updated through the device queue.
     * @throws Never throws.
     * @example
     * terrain.update(camera, bounds, [0, 0, 1, 1], [0.1, 0.2, 0.3], { enableCulling: true });
     */
    update(
        camera: Camera,
        overlayBounds: readonly [number, number, number, number],
        overlayUvRect: readonly [number, number, number, number],
        waterColor: readonly [number, number, number],
        options: TerrainDebugOptions = {},
    ): void {
        const uniform = new Float32Array(48);
        uniform.set(camera.getViewProjectionMatrix(), 0);
        uniform.set([...camera.getEye(), 1], 16);
        uniform.set([0.42, -0.46, -0.78, 0], 20);
        uniform.set([performance.now() / 1000, MAX_LOD_LEVEL + 1, Math.min(this._heightfield.cellSizeX, this._heightfield.cellSizeY), PATCH_CELLS], 24);
        uniform.set([this._heightfield.originX, this._heightfield.originY, this._heightfield.cellSizeX, this._heightfield.cellSizeY], 28);
        uniform.set([this._heightfield.width, this._heightfield.height, this._heightfield.minHeight, this._heightfield.maxHeight], 32);
        uniform.set([overlayBounds[0], overlayBounds[1], overlayBounds[2] - overlayBounds[0], overlayBounds[3] - overlayBounds[1]], 36);
        uniform.set(overlayUvRect, 40);
        uniform.set([waterColor[0], waterColor[1], waterColor[2], 0.08], 44);
        this.device.queue.writeBuffer(this.cameraBuffer, 0, uniform);

        if (!options.freezeLod || this.lastBlocks.length === 0) {
            this.selectBlocks(camera, options.enableCulling !== false);
        }

        this.instanceCount = Math.min(this.lastBlocks.length, MAX_INSTANCES);
        for (let i = 0; i < this.instanceCount; i += 1) {
            const block = this.lastBlocks[i];
            const offset = i * 8;
            this.instanceData[offset] = block.x;
            this.instanceData[offset + 1] = block.y;
            this.instanceData[offset + 2] = block.size;
            this.instanceData[offset + 3] = block.level;
            this.instanceData[offset + 4] = block.seamXMin;
            this.instanceData[offset + 5] = block.seamXMax;
            this.instanceData[offset + 6] = block.seamYMin;
            this.instanceData[offset + 7] = block.seamYMax;
        }
        this.device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceData.subarray(0, this.instanceCount * 8));
        this.stats.selectedBlocks = this.instanceCount;
        this.stats.triangles = (this.mesh.indexCount / 3) * this.instanceCount;
    }

    /**
     * Draws selected terrain blocks into a color render pass.
     *
     * @param pass Active render pass encoder targeting the main color attachment.
     * @param showMesh Whether to draw terrain patch wireframe lines after fill.
     * @returns Nothing. Draw commands are encoded into `pass`.
     * @throws Never throws.
     * @example
     * terrain.render(mainPass, false);
     */
    render(pass: GPURenderPassEncoder, showMesh = false): void {
        if (this.instanceCount === 0) {
            return;
        }

        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.mesh.vertexBuffer);
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setPipeline(this.pipeline);
        pass.setIndexBuffer(this.mesh.indexBuffer, 'uint32');
        pass.drawIndexed(this.mesh.indexCount, this.instanceCount);

        if (showMesh) {
            pass.setPipeline(this.meshPipeline);
            pass.setIndexBuffer(this.mesh.lineIndexBuffer, 'uint32');
            pass.drawIndexed(this.mesh.lineIndexCount, this.instanceCount);
        }
    }

    /**
     * Draws terrain depth into an active depth-only pass.
     *
     * @param pass Active render pass encoder with a terrain depth attachment.
     * @returns Nothing. Draw commands are encoded into `pass`.
     * @throws Never throws.
     * @example
     * terrain.renderDepth(depthPass);
     */
    renderDepth(pass: GPURenderPassEncoder): void {
        if (this.instanceCount === 0) {
            return;
        }

        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.mesh.vertexBuffer);
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setPipeline(this.depthPipeline);
        pass.setIndexBuffer(this.mesh.indexBuffer, 'uint32');
        pass.drawIndexed(this.mesh.indexCount, this.instanceCount);
    }

    /**
     * Draws terrain picking geometry into an active picking pass.
     *
     * @param pass Active render pass encoder targeting the picking attachment.
     * @returns Nothing. Draw commands are encoded into `pass`.
     * @throws Never throws.
     * @example
     * terrain.renderPicking(pickingPass);
     */
    renderPicking(pass: GPURenderPassEncoder): void {
        if (this.instanceCount === 0) {
            return;
        }

        pass.setBindGroup(0, this.pickingBindGroup);
        pass.setVertexBuffer(0, this.mesh.vertexBuffer);
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setPipeline(this.pickingPipeline);
        pass.setIndexBuffer(this.mesh.indexBuffer, 'uint32');
        pass.drawIndexed(this.mesh.indexCount, this.instanceCount);
    }

    /**
     * Encodes the visible-bounds prepass and compute reductions.
     *
     * The result is copied into a readback buffer and becomes visible after
     * `resolveVisibleBoundsReadback` completes.
     *
     * @param encoder Command encoder for the current terrain frame.
     * @returns Nothing. Commands are appended to `encoder`.
     * @throws If command encoding fails or required GPU resources are invalid.
     * @example
     * terrain.encodeVisibleBoundsReduction(commandEncoder);
     */
    encodeVisibleBoundsReduction(encoder: GPUCommandEncoder): void {
        if (this.instanceCount === 0) {
            return;
        }

        const renderPass = encoder.beginRenderPass({
            label: 'Terrain visible bounds prepass',
            colorAttachments: [
                {
                    view: this.visibleBoundsTextureView,
                    clearValue: { r: 65504, g: 65504, b: -65504, a: -65504 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.visibleBoundsDepthTextureView,
                depthClearValue: 0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.mesh.vertexBuffer);
        renderPass.setVertexBuffer(1, this.instanceBuffer);
        renderPass.setPipeline(this.visibleBoundsPipeline);
        renderPass.setIndexBuffer(this.mesh.indexBuffer, 'uint32');
        renderPass.drawIndexed(this.mesh.indexCount, this.instanceCount);
        renderPass.end();

        const computePass = encoder.beginComputePass({ label: 'Terrain visible bounds reduction' });
        computePass.setPipeline(this.reduceTexturePipeline);
        computePass.setBindGroup(0, this.reduceTextureBindGroup);
        computePass.dispatchWorkgroups(BOUNDS_PASS_1_COUNT);
        computePass.setPipeline(this.reduceBufferPipeline);
        computePass.setBindGroup(1, this.reducePass2BindGroup);
        computePass.dispatchWorkgroups(BOUNDS_PASS_2_COUNT);
        computePass.setBindGroup(1, this.reducePass3BindGroup);
        computePass.dispatchWorkgroups(BOUNDS_PASS_3_COUNT);
        computePass.end();

        if (!this.boundsReadbackPending && !this.boundsReadbackInFlight) {
            encoder.copyBufferToBuffer(
                this.reduceFinal,
                0,
                this.reduceReadback,
                0,
                4 * Float32Array.BYTES_PER_ELEMENT,
            );
            this.boundsReadbackPending = true;
        }
    }

    /**
     * Starts or completes asynchronous readback of reduced visible bounds.
     *
     * @param requestRender Optional callback run when the landed readback means the next frame draws
     * differently: the bounds changed, or a frame drew while the readback was in flight, so the
     * bounds of that frame's view were never read back.
     * @returns Nothing. `visibleBounds` is updated asynchronously when mapping completes.
     * @throws Never throws synchronously. Mapping failures are caught and logged.
     * @example
     * terrain.resolveVisibleBoundsReadback(() => map.requestRender());
     */
    resolveVisibleBoundsReadback(requestRender?: () => void): void {
        if (this.boundsReadbackInFlight) {
            // This frame could not queue its own copy, so the readback in flight describes an older view.
            this.boundsReadbackSkipped = true;
            return;
        }
        if (!this.boundsReadbackPending) {
            return;
        }

        this.boundsReadbackPending = false;
        this.boundsReadbackInFlight = true;
        this.reduceReadback.mapAsync(GPUMapMode.READ).then(() => {
            const values = new Float32Array(this.reduceReadback.getMappedRange().slice(0));
            this.reduceReadback.unmap();
            this.boundsReadbackInFlight = false;
            const skipped = this.boundsReadbackSkipped;
            this.boundsReadbackSkipped = false;

            let changed = false;
            const [minX, minY, maxX, maxY] = values;
            if (
                Number.isFinite(minX) &&
                Number.isFinite(minY) &&
                Number.isFinite(maxX) &&
                Number.isFinite(maxY) &&
                minX <= maxX &&
                minY <= maxY
            ) {
                const previous = this.latestReducedBounds;
                const bounds: [number, number, number, number] = [minX, minY, maxX, maxY];
                this.latestReducedBounds = bounds;
                changed = !previous || bounds.some((value, index) => value !== previous[index]);
            }

            // Every frame queues a readback, so requesting a frame after each one would redraw forever.
            if (changed || skipped) {
                requestRender?.();
            }
        }).catch((error: unknown) => {
            this.boundsReadbackInFlight = false;
            console.warn('Terrain visible bounds readback failed:', error);
        });
    }


    /**
     * Draws a debug rectangle for overlay bounds in the current terrain pass.
     *
     * @param pass Active render pass encoder targeting the main terrain pass.
     * @param bounds Bounds to draw as a rectangle.
     * @param cameraPosition Optional camera XY position marker to draw with the bounds.
     * @returns Nothing. Debug line draw commands are encoded into `pass`.
     * @throws Never throws.
     * @example
     * terrain.renderOverlayBounds(pass, bounds, [cameraX, cameraY]);
     */
    renderOverlayBounds(
        pass: GPURenderPassEncoder,
        bounds: readonly [number, number, number, number],
        cameraPosition?: readonly [number, number],
    ): void {
        const z = this._heightfield.maxHeight + 20;
        const [minX, minY, maxX, maxY] = bounds;
        const values = [
            minX, minY, z, maxX, minY, z,
            maxX, minY, z, maxX, maxY, z,
            maxX, maxY, z, minX, maxY, z,
            minX, maxY, z, minX, minY, z,
        ];
        if (cameraPosition) {
            const markerSize = Math.max(maxX - minX, maxY - minY) * 0.025;
            const [x, y] = cameraPosition;
            values.push(
                x - markerSize, y, z, x + markerSize, y, z,
                x, y - markerSize, z, x, y + markerSize, z,
            );
        }
        const vertices = new Float32Array(values);

        this.device.queue.writeBuffer(this.boundsVertexBuffer, 0, vertices);
        pass.setBindGroup(0, this.bindGroup);
        pass.setPipeline(this.boundsPipeline);
        pass.setVertexBuffer(0, this.boundsVertexBuffer);
        pass.draw(vertices.length / 3);
    }

    /**
     * Destroys all terrain-owned GPU buffers and textures.
     *
     * @returns Nothing. The renderer must not be used after destruction.
     * @throws Never throws.
     * @example
     * terrain.destroy();
     */
    destroy(): void {
        this.heightTexture.destroy();
        this.visibleBoundsTexture.destroy();
        this.visibleBoundsDepthTexture.destroy();
        this.mesh.vertexBuffer.destroy();
        this.mesh.indexBuffer.destroy();
        this.mesh.lineIndexBuffer.destroy();
        this.cameraBuffer.destroy();
        this.instanceBuffer.destroy();
        this.boundsVertexBuffer.destroy();
        this.reduceParamsTextureBuffer.destroy();
        this.reduceParamsPass2Buffer.destroy();
        this.reduceParamsPass3Buffer.destroy();
        this.reducePartialA.destroy();
        this.reducePartialB.destroy();
        this.reduceFinal.destroy();
        this.reduceReadback.destroy();
    }

    /**
     * Selects terrain quadtree blocks for the current camera.
     *
     * @param camera Camera used for LOD distance and frustum tests.
     * @param enableCulling Whether frustum culling should reject blocks.
     * @returns Nothing. `instanceData`, `instanceCount`, and stats are updated.
     * @throws Never throws.
     * @example
     * terrain['selectBlocks'](camera, true);
     */
    private selectBlocks(camera: Camera, enableCulling: boolean): void {
        const viewProjection = camera.getViewProjectionMatrix();
        const planes = extractFrustumPlanes(viewProjection);
        const viewportHeight = Math.max(camera.getViewportHeight(), 1);
        const projectionScale = viewportHeight / (2 * Math.tan(camera.getFovyRadians() / 2));
        const [minX, minY, maxX, maxY] = this.bounds;
        const terrainSize = Math.max(maxX - minX, maxY - minY);
        const rootSize = nextPowerOfTwo(terrainSize);
        const rootLevel = Math.min(MAX_LOD_LEVEL, Math.max(0, Math.ceil(Math.log2(rootSize / (PATCH_CELLS * Math.min(this._heightfield.cellSizeX, this._heightfield.cellSizeY))))));
        const stack: BlockCandidate[] = [createBlock(minX, minY, rootSize, rootLevel)];
        const blocks: BlockCandidate[] = [];

        this.stats.culledBlocks = 0;
        while (stack.length > 0 && blocks.length < MAX_INSTANCES) {
            const block = stack.pop()!;
            if (!rangesOverlap(block.x, block.x + block.size, minX, maxX) || !rangesOverlap(block.y, block.y + block.size, minY, maxY)) {
                continue;
            }
            if (enableCulling && !blockIntersectsFrustum(block, planes, this._heightfield.minHeight, this._heightfield.maxHeight)) {
                this.stats.culledBlocks += 1;
                continue;
            }
            if (shouldSplitBlock(block, camera, projectionScale, Math.min(this._heightfield.cellSizeX, this._heightfield.cellSizeY))) {
                const childSize = block.size * 0.5;
                const childLevel = block.level - 1;
                stack.push(
                    createBlock(block.x, block.y, childSize, childLevel),
                    createBlock(block.x + childSize, block.y, childSize, childLevel),
                    createBlock(block.x, block.y + childSize, childSize, childLevel),
                    createBlock(block.x + childSize, block.y + childSize, childSize, childLevel),
                );
            } else {
                blocks.push(block);
            }
        }
        this.lastBlocks.length = 0;
        this.lastBlocks.push(...blocks.sort((a, b) => a.level - b.level));
    }
}

/**
 * Creates the reusable unit patch mesh used by terrain instances.
 *
 * @param device WebGPU device used to allocate mesh buffers.
 * @returns Terrain mesh buffers and index counts.
 * @throws If GPU buffer creation fails.
 * @example
 * const mesh = createPatchMesh(device);
 */
function createPatchMesh(device: GPUDevice): TerrainMesh {
    const vertices: number[] = [];
    for (let y = 0; y <= PATCH_CELLS; y += 1) {
        for (let x = 0; x <= PATCH_CELLS; x += 1) {
            vertices.push(x / PATCH_CELLS, y / PATCH_CELLS, 0);
        }
    }

    const indices: number[] = [];
    for (let y = 0; y < PATCH_CELLS; y += 1) {
        for (let x = 0; x < PATCH_CELLS; x += 1) {
            const i0 = gridIndex(x, y);
            const i1 = gridIndex(x + 1, y);
            const i2 = gridIndex(x, y + 1);
            const i3 = gridIndex(x + 1, y + 1);
            indices.push(i0, i2, i1, i1, i2, i3);
        }
    }

    const lineIndices = createLineIndices();
    const vertexData = new Float32Array(vertices);
    const indexData = new Uint32Array(indices);
    const lineIndexData = new Uint32Array(lineIndices);
    const vertexBuffer = device.createBuffer({ label: 'Terrain patch vertices', size: vertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const indexBuffer = device.createBuffer({ label: 'Terrain patch indices', size: indexData.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    const lineIndexBuffer = device.createBuffer({ label: 'Terrain patch line indices', size: lineIndexData.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    device.queue.writeBuffer(indexBuffer, 0, indexData);
    device.queue.writeBuffer(lineIndexBuffer, 0, lineIndexData);

    return { vertexBuffer, indexBuffer, lineIndexBuffer, indexCount: indexData.length, lineIndexCount: lineIndexData.length };
}

/**
 * Builds line indices for terrain patch wireframe rendering.
 *
 * @returns Index list connecting adjacent patch grid vertices.
 * @throws Never throws.
 * @example
 * const indices = createLineIndices();
 */
function createLineIndices(): number[] {
    const indices: number[] = [];
    for (let y = 0; y <= PATCH_CELLS; y += 1) {
        for (let x = 0; x < PATCH_CELLS; x += 1) {
            indices.push(gridIndex(x, y), gridIndex(x + 1, y));
        }
    }
    for (let x = 0; x <= PATCH_CELLS; x += 1) {
        for (let y = 0; y < PATCH_CELLS; y += 1) {
            indices.push(gridIndex(x, y), gridIndex(x, y + 1));
        }
    }
    return indices;
}

/**
 * Converts patch grid coordinates into a linear vertex index.
 *
 * @param x Patch-local X grid coordinate.
 * @param y Patch-local Y grid coordinate.
 * @returns Linear vertex index for the patch mesh.
 * @throws Never throws.
 * @example
 * const index = gridIndex(1, 2);
 */
function gridIndex(x: number, y: number): number {
    return y * PATCH_VERTICES + x;
}

/**
 * Creates a terrain quadtree block candidate.
 *
 * @param x Local-space minimum X coordinate.
 * @param y Local-space minimum Y coordinate.
 * @param size Local-space block size.
 * @param level Quadtree LOD level.
 * @returns Block candidate with seam flags initialized to zero.
 * @throws Never throws.
 * @example
 * const block = createBlock(0, 0, 1024, 2);
 */
function createBlock(x: number, y: number, size: number, level: number): BlockCandidate {
    return { x, y, size, level, seamXMin: 0, seamXMax: 0, seamYMin: 0, seamYMax: 0 };
}

/**
 * Decides whether a terrain block should split into children.
 *
 * @param block Candidate block being evaluated.
 * @param camera Camera used to estimate screen-space cell size.
 * @param projectionScale Scale factor from world units to projected pixels.
 * @param baseCellSize Heightfield cell size at the finest level.
 * @returns `true` when the block should use a finer LOD.
 * @throws Never throws.
 * @example
 * const split = shouldSplitBlock(block, camera, projectionScale, cellSize);
 */
function shouldSplitBlock(block: BlockCandidate, camera: Camera, projectionScale: number, baseCellSize: number): boolean {
    if (block.level === 0) {
        return false;
    }
    const eye = camera.getEye();
    const lookAt = camera.getLookAt();
    const distance = Math.max(1, Math.min(distanceToBlock3d(eye[0], eye[1], eye[2], block), distanceToBlock3d(lookAt[0], lookAt[1], lookAt[2], block)));
    const cellSize = baseCellSize * 2 ** block.level;
    return (cellSize * projectionScale) / distance > TARGET_CELL_PIXELS;
}

/**
 * Computes the shortest 3D distance from a point to a block footprint.
 *
 * @param x Point X coordinate.
 * @param y Point Y coordinate.
 * @param z Point Z coordinate.
 * @param block Block footprint tested against the point.
 * @returns Euclidean distance to the block in local terrain space.
 * @throws Never throws.
 * @example
 * const distance = distanceToBlock3d(eyeX, eyeY, eyeZ, block);
 */
function distanceToBlock3d(x: number, y: number, z: number, block: BlockCandidate): number {
    const dx = Math.max(block.x - x, 0, x - (block.x + block.size));
    const dy = Math.max(block.y - y, 0, y - (block.y + block.size));
    return Math.hypot(dx, dy, Math.abs(z - TERRAIN_LOD_REFERENCE_HEIGHT));
}

/**
 * Tests whether a terrain block volume intersects the camera frustum.
 *
 * @param block Block footprint to test.
 * @param planes Normalized frustum planes.
 * @param minHeight Minimum terrain height used for the block volume.
 * @param maxHeight Maximum terrain height used for the block volume.
 * @returns `true` when any part of the block may be visible.
 * @throws Never throws.
 * @example
 * const visible = blockIntersectsFrustum(block, planes, minHeight, maxHeight);
 */
function blockIntersectsFrustum(block: BlockCandidate, planes: Plane[], minHeight: number, maxHeight: number): boolean {
    for (const plane of planes) {
        const px = plane[0] >= 0 ? block.x + block.size : block.x;
        const py = plane[1] >= 0 ? block.y + block.size : block.y;
        const pz = plane[2] >= 0 ? maxHeight : minHeight;
        if (plane[0] * px + plane[1] * py + plane[2] * pz + plane[3] < 0) {
            return false;
        }
    }
    return true;
}

/**
 * Extracts normalized frustum planes from a view-projection matrix.
 *
 * @param matrix Column-major view-projection matrix.
 * @returns Six normalized frustum planes.
 * @throws Never throws.
 * @example
 * const planes = extractFrustumPlanes(camera.getViewProjectionMatrix());
 */
function extractFrustumPlanes(matrix: Float32Array): Plane[] {
    return [
        normalizePlane([matrix[3] + matrix[0], matrix[7] + matrix[4], matrix[11] + matrix[8], matrix[15] + matrix[12]]),
        normalizePlane([matrix[3] - matrix[0], matrix[7] - matrix[4], matrix[11] - matrix[8], matrix[15] - matrix[12]]),
        normalizePlane([matrix[3] + matrix[1], matrix[7] + matrix[5], matrix[11] + matrix[9], matrix[15] + matrix[13]]),
        normalizePlane([matrix[3] - matrix[1], matrix[7] - matrix[5], matrix[11] - matrix[9], matrix[15] - matrix[13]]),
        normalizePlane([matrix[2], matrix[6], matrix[10], matrix[14]]),
        normalizePlane([matrix[3] - matrix[2], matrix[7] - matrix[6], matrix[11] - matrix[10], matrix[15] - matrix[14]]),
    ];
}

/**
 * Normalizes a plane equation so its normal has unit length.
 *
 * @param plane Plane coefficients `[a, b, c, d]`.
 * @returns Normalized plane coefficients.
 * @throws Never throws.
 * @example
 * const plane = normalizePlane([1, 0, 0, -10]);
 */
function normalizePlane(plane: Plane): Plane {
    const length = Math.hypot(plane[0], plane[1], plane[2]) || 1;
    return [plane[0] / length, plane[1] / length, plane[2] / length, plane[3] / length];
}

/**
 * Checks whether two inclusive numeric ranges overlap.
 *
 * @param minA Minimum value of the first range.
 * @param maxA Maximum value of the first range.
 * @param minB Minimum value of the second range.
 * @param maxB Maximum value of the second range.
 * @returns `true` when the ranges overlap.
 * @throws Never throws.
 * @example
 * rangesOverlap(0, 10, 5, 15); // true
 */
function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
    return minA < maxB && minB < maxA;
}

/**
 * Computes the next power-of-two value greater than or equal to `value`.
 *
 * @param value Positive input value.
 * @returns Power-of-two integer greater than or equal to `value`.
 * @throws Never throws.
 * @example
 * nextPowerOfTwo(300); // 512
 */
function nextPowerOfTwo(value: number): number {
    return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

/**
 * Creates a storage buffer sized for a number of `vec4<f32>` values.
 *
 * @param device WebGPU device used to allocate the buffer.
 * @param vec4Count Number of four-float values the buffer must hold.
 * @param label Debug label assigned to the GPU buffer.
 * @returns Storage buffer usable by compute reductions.
 * @throws If GPU buffer creation fails.
 * @example
 * const buffer = createStorageBuffer(device, 128, 'partial bounds');
 */
function createStorageBuffer(device: GPUDevice, vec4Count: number, label: string): GPUBuffer {
    return device.createBuffer({
        label,
        size: Math.max(1, vec4Count) * 4 * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
}

/**
 * Creates and initializes a uniform buffer for bounds reduction passes.
 *
 * @param device WebGPU device used to allocate and initialize the buffer.
 * @param total Number of input values consumed by the reduction pass.
 * @param width Width of the source texture for texture reduction, or `0` for buffer reduction.
 * @param height Height of the source texture for texture reduction, or `0` for buffer reduction.
 * @returns Uniform buffer containing reduction pass parameters.
 * @throws If GPU buffer creation fails.
 * @example
 * const params = createReduceParamsBuffer(device, 512 * 512, 512, 512);
 */
function createReduceParamsBuffer(device: GPUDevice, total: number, width: number, height: number): GPUBuffer {
    const data = new Uint32Array([total, width, height, 0]);
    const buffer = device.createBuffer({
        label: 'Terrain bounds reduce params',
        size: data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
}
