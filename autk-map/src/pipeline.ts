/// <reference types="@webgpu/types" />

import { Layer } from './layer';

import { Camera, ColorMap, DEFAULT_COLORMAP_RESOLUTION } from './core-types';
import { Renderer } from './renderer';
import { MapStyle } from './map-style';

const COLORMAP_HEIGHT = 1;

/**
 * Abstract class representing a rendering pipeline.
 * It provides methods for creating camera and color uniform bind groups,
 * updating camera and color uniforms, and defining the structure for building
 * and rendering the pipeline.
 */
export abstract class Pipeline {
    /**
     * Renderer reference
     */
    protected _renderer: Renderer;

    /**
     * ModelView matrix uniform buffer
     */
    protected _mviewBuffer!: GPUBuffer;

    /**
     * Projection matrix uniform buffer
     */
    protected _projectionBuffer!: GPUBuffer;
    protected _zIndexBuffer!: GPUBuffer;

    /**
     * Camera bind group
     */
    protected _cameraBindGroup!: GPUBindGroup;

    /**
     * Camera bind group layout
     */
    protected _cameraBindGroupLayout!: GPUBindGroupLayout;

    /**
     * Color uniform buffer
     */
    protected _colorBuffer!: GPUBuffer;

    /**
     * Highlight color uniform buffer
     */
    protected _highlightColorBuffer!: GPUBuffer;

    /**
     * Color map texture
     */
    protected _cMapTexture!: GPUTexture;

    /**
     * Use color map uniform buffer
     */
    protected _useColorMap!: GPUBuffer;

    /**
     * Use highlight uniform buffer
     */
    protected _useHighlight!: GPUBuffer;

    /**
     * Opacity uniform buffer
     */
    protected _opacity!: GPUBuffer;

    /** Colormap domain parameters: [min, max, useNormalization, _pad]. */
    protected _domainBuffer!: GPUBuffer;

    /**
     * Render information bind group
     */
    protected _renderInfoBindGroup!: GPUBindGroup;

    /**
     * Render information bind group layout
     */
    protected _renderInfoBindGroupLayout!: GPUBindGroupLayout;

    /** Cached matrix uniform data to avoid per-frame allocations. */
    private _mviewData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(16 * Float32Array.BYTES_PER_ELEMENT));
    /** Cached projection matrix data to avoid per-frame allocations. */
    private _projectionData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(16 * Float32Array.BYTES_PER_ELEMENT));
    /** Cached z-index uniform payload. */
    private _zIndexData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    /** Cached fixed-color uniform payload (rgba). */
    private _colorData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4 * Float32Array.BYTES_PER_ELEMENT));
    /** Cached highlight-color uniform payload (rgba). */
    private _highlightColorData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4 * Float32Array.BYTES_PER_ELEMENT));
    /** Cached use-colormap flag uniform payload. */
    private _useColorMapData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    /** Cached use-highlight flag uniform payload. */
    private _useHighlightData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    /** Cached opacity uniform payload. */
    private _opacityData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    /** Cached domain uniform payload. */
    private _domainData: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(4 * Float32Array.BYTES_PER_ELEMENT));

    /**
     * Pipeline constructor
     * @param {Renderer} renderer The renderer instance
     */
    constructor(renderer: Renderer) {
        this._renderer = renderer;
    }

    /**
     * Creates the camera uniform bind group.
     */
    createCameraUniformBindGroup(): void {
        this._mviewBuffer = this._renderer.device.createBuffer({
            label: 'ModelView matrix buffer',
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._projectionBuffer = this._renderer.device.createBuffer({
            label: 'Projection matrix buffer',
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._zIndexBuffer = this._renderer.device.createBuffer({
            label: 'Z index buffer',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._cameraBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0, // modelview
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {},
                },
                {
                    binding: 1, // projection
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {},
                },
                {
                    binding: 2, // zIndex
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {},
                },
            ],
        });

        this._cameraBindGroup = this._renderer.device.createBindGroup({
            layout: this._cameraBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this._mviewBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this._projectionBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this._zIndexBuffer },
                },
            ],
        });
    }

    /**
     * Updates the camera uniform buffers with the current camera state.
     * @param {Camera} camera The camera instance
     */
    updateCameraUniforms(camera: Camera): void {
        this._mviewData.set(camera.getModelViewMatrix());
        this._projectionData.set(camera.getProjectionMatrix());

        this._renderer.device.queue.writeBuffer(this._mviewBuffer, 0, this._mviewData);
        this._renderer.device.queue.writeBuffer(this._projectionBuffer, 0, this._projectionData);
    }

    /** Writes the layer z-index to the uniform buffer used by vertex shaders. */
    updateZIndex(value: number): void {
        this._zIndexData[0] = value;
        this._renderer.device.queue.writeBuffer(this._zIndexBuffer, 0, this._zIndexData);
    }

    /**
     * Creates the color uniform bind group.
     */
    createColorUniformBindGroup(): void {
        this._colorBuffer = this._renderer.device.createBuffer({
            label: 'Fixed color buffer',
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._highlightColorBuffer = this._renderer.device.createBuffer({
            label: 'Highlight color buffer',
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._useColorMap = this._renderer.device.createBuffer({
            label: 'Enable colormap on render',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._useHighlight = this._renderer.device.createBuffer({
            label: 'Enable highlight on render',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._cMapTexture = this._renderer.device.createTexture({
            label: 'Colormap texture',
            size: { width: DEFAULT_COLORMAP_RESOLUTION, height: COLORMAP_HEIGHT },
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba8unorm',
        });

        const cMapSampler = this._renderer.device.createSampler({
            label: 'Fixed color buffer',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });

        this._opacity = this._renderer.device.createBuffer({
            label: 'Enable opacity on render',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._domainBuffer = this._renderer.device.createBuffer({
            label: 'Colormap domain buffer',
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._renderInfoBindGroupLayout = this._renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0, // fixed color
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 1, // highlight color
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 2, // show thematic data
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 3, // show highlight
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 4, // cMap texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 5, // cMap sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 6, // opacity
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 7, // colormap domain params
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
            ],
        });

        this._renderInfoBindGroup = this._renderer.device.createBindGroup({
            layout: this._renderInfoBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this._colorBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this._highlightColorBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this._useColorMap },
                },
                {
                    binding: 3,
                    resource: { buffer: this._useHighlight },
                },
                {
                    binding: 4,
                    resource: this._cMapTexture.createView(),
                },
                {
                    binding: 5,
                    resource: cMapSampler,
                },
                {
                    binding: 6,
                    resource: { buffer: this._opacity },
                },
                {
                    binding: 7,
                    resource: { buffer: this._domainBuffer },
                },
            ],
        });
    }

    /**
     * Updates the color uniform buffers with the current layer state.
     * @param {Layer} layer The layer instance
     */
    updateColorUniforms(layer: Layer): void {
        const computedDomain = layer.layerRenderInfo.colormap.computedDomain;

        const isNumericDomain = Array.isArray(computedDomain)
            && computedDomain.length > 0
            && computedDomain.every(v => typeof v === 'number');
        const isCategoricalDomain = Array.isArray(computedDomain)
            && computedDomain.length > 0
            && computedDomain.every(v => typeof v === 'string');

        const colors = {
            color: MapStyle.getColor(layer.layerInfo.typeLayer),
            highlightColor: MapStyle.getHighlightColor(),
            colorMap: ColorMap.getColorMap(
                layer.layerRenderInfo.colormap.config.interpolator,
                undefined,
                isCategoricalDomain ? computedDomain : undefined,
            ),
            useColorMap: Boolean(layer.layerRenderInfo.isColorMap),
            useHighlight: Boolean(layer.layerRenderInfo.isPick),
            opacity: layer.layerRenderInfo.opacity,
        };

        const min = isNumericDomain ? Number(computedDomain[0]) : 0;
        const max = isNumericDomain ? Number(computedDomain[computedDomain.length - 1]) : 1;
        const categoryCount = isCategoricalDomain ? computedDomain.length : 0;

        this._colorData[0] = colors.color.r;
        this._colorData[1] = colors.color.g;
        this._colorData[2] = colors.color.b;
        this._colorData[3] = 1.0;

        this._highlightColorData[0] = colors.highlightColor.r;
        this._highlightColorData[1] = colors.highlightColor.g;
        this._highlightColorData[2] = colors.highlightColor.b;
        this._highlightColorData[3] = 1.0;

        this._useColorMapData[0] = colors.useColorMap ? 1.0 : 0.0;
        this._useHighlightData[0] = colors.useHighlight ? 1.0 : 0.0;
        this._opacityData[0] = colors.opacity;
        this._domainData[0] = min;
        this._domainData[1] = max;
        this._domainData[2] = isNumericDomain ? 1.0 : (isCategoricalDomain ? 2.0 : 0.0);
        this._domainData[3] = categoryCount;

        const colorMapTexture = new Uint8Array(colors.colorMap);

        this._renderer.device.queue.writeBuffer(this._colorBuffer, 0, this._colorData);
        this._renderer.device.queue.writeBuffer(this._highlightColorBuffer, 0, this._highlightColorData);
        this._renderer.device.queue.writeBuffer(this._useHighlight, 0, this._useHighlightData);
        this._renderer.device.queue.writeBuffer(this._useColorMap, 0, this._useColorMapData);
        this._renderer.device.queue.writeTexture(
            { texture: this._cMapTexture },
            colorMapTexture,
            {},
            { width: DEFAULT_COLORMAP_RESOLUTION, height: COLORMAP_HEIGHT },
        );
        this._renderer.device.queue.writeBuffer(this._opacity, 0, this._opacityData);
        this._renderer.device.queue.writeBuffer(this._domainBuffer, 0, this._domainData);
    }

    /**
     * Releases GPU resources owned by this base pipeline.
     * Subclasses should `override` and call `super.destroy()`.
     */
    destroy(): void {
        this._mviewBuffer?.destroy();
        this._projectionBuffer?.destroy();
        this._zIndexBuffer?.destroy();

        this._colorBuffer?.destroy();
        this._highlightColorBuffer?.destroy();
        this._useColorMap?.destroy();
        this._useHighlight?.destroy();
        this._opacity?.destroy();
        this._domainBuffer?.destroy();
        this._cMapTexture?.destroy();
    }

    /**
     * Begins a standard main-scene render pass using renderer frame/depth buffers.
     * Sets the color attachment load operation to `load` so pipelines can layer draws.
     */
    protected _beginMainRenderPass(commandEncoder: GPUCommandEncoder): GPURenderPassEncoder {
        this._renderer.frameBuffer.loadOp = 'load';
        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._renderer.frameBuffer],
            depthStencilAttachment: this._renderer.depthBuffer,
        };
        return commandEncoder.beginRenderPass(renderPassDesc);
    }

    /** Reuses or reallocates a float32 cache and copies source values into it. */
    protected _syncFloatData(
        cache: Float32Array<ArrayBuffer> | null,
        source: ArrayLike<number>,
    ): Float32Array<ArrayBuffer> {
        if (!cache || cache.length !== source.length) {
            cache = new Float32Array(new ArrayBuffer(source.length * Float32Array.BYTES_PER_ELEMENT));
        }
        cache.set(source);
        return cache;
    }

    /** Reuses or reallocates a uint32 cache and copies source values into it. */
    protected _syncUintData(
        cache: Uint32Array<ArrayBuffer> | null,
        source: ArrayLike<number>,
    ): Uint32Array<ArrayBuffer> {
        if (!cache || cache.length !== source.length) {
            cache = new Uint32Array(new ArrayBuffer(source.length * Uint32Array.BYTES_PER_ELEMENT));
        }
        cache.set(source);
        return cache;
    }

    /** Reuses or reallocates a uint8 cache and copies source values into it. */
    protected _syncU8Data(
        cache: Uint8Array<ArrayBuffer> | null,
        source: ArrayLike<number>,
    ): Uint8Array<ArrayBuffer> {
        if (!cache || cache.length !== source.length) {
            cache = new Uint8Array(new ArrayBuffer(source.length * Uint8Array.BYTES_PER_ELEMENT));
        }
        cache.set(source);
        return cache;
    }

    /** Reuses or reallocates a float32 cache with the requested length. */
    protected _syncFloatLength(
        cache: Float32Array<ArrayBuffer> | null,
        length: number,
    ): Float32Array<ArrayBuffer> {
        if (!cache || cache.length !== length) {
            cache = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
        }
        return cache;
    }

    /**
     * Builds the pipeline.
     * @param {Layer} data The layer instance
     */
    abstract build(data: Layer): void;

    /**
     * Creates the vertex buffers.
     * @param {Layer} data The layer instance
     */
    abstract createVertexBuffers(data: Layer): void;

    /**
     * Updates the vertex buffers with the provided data.
     * @param {Layer} data The layer instance
     */
    abstract updateVertexBuffers(data: Layer): void;

    /** Executes one render pass for this pipeline. */
    abstract renderPass(camera: Camera): void;
}
