/// <reference types="@webgpu/types" />

import { Layer } from './layer';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { MapStyle } from './map-style';
import { ColorMap } from './colormap';
import { IMapStyle } from './interfaces';

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
    protected _projcBuffer!: GPUBuffer;



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




    /**
     * Render information bind group
     */
    protected _renderInfoBindGroup!: GPUBindGroup;

    /**
     * Render information bind group layout
     */
    protected _renderInfoBindGroupLayout!: GPUBindGroupLayout;




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
    createCameraUniformBindGroup() {
        this._mviewBuffer = this._renderer.device.createBuffer({
            label: 'ModelView matrix buffer',
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._projcBuffer = this._renderer.device.createBuffer({
            label: 'Projection matrix buffer',
            size: 16 * 4,
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
                    resource: { buffer: this._projcBuffer },
                },
            ],
        });
    }

    /**
     * Updates the camera uniform buffers with the current camera state.
     * @param {Camera} camera The camera instance
     */
    updateCameraUniforms(camera: Camera) {
        const mview = new Float32Array(camera.getModelViewMatrix());
        const projc = new Float32Array(camera.getProjectionMatrix());

        this._renderer.device.queue.writeBuffer(this._mviewBuffer, 0, mview);
        this._renderer.device.queue.writeBuffer(this._projcBuffer, 0, projc);
    }



    /**
     * Creates the color uniform bind group.
     */
    createColorUniformBindGroup() {
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
            size: { width: 256, height: 1 },
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
                    resource: { buffer: this._opacity},
                }
            ],
        });
    }

    /**
     * Updates the color uniform buffers with the current layer state.
     * @param {Layer} layer The layer instance
     */
    updateColorUniforms(layer: Layer) {
        const colors = {
            color: MapStyle.getColor(layer.layerInfo.typeLayer as keyof IMapStyle),
            highlightColor: MapStyle.getHighlightColor(),
            colorMap: ColorMap.getColorMap(layer.layerRenderInfo.colorMapInterpolator),
            useColorMap: <boolean>layer.layerRenderInfo.isColorMap,
            useHighlight: <boolean>layer.layerRenderInfo.isPick,
            opacity: layer.layerRenderInfo.opacity
        };

        const color = new Float32Array(Object.values(colors.color));
        const highlightColor = new Float32Array(Object.values(colors.highlightColor));
        const useColorMap = new Float32Array([colors.useColorMap ? 1.0 : 0.0]);
        const useHighlight = new Float32Array([colors.useHighlight ? 1.0 : 0.0]);
        const colorMapTexture = new Uint8Array(colors.colorMap);
        const opacity = new Float32Array([colors.opacity]);

        this._renderer.device.queue.writeBuffer(this._colorBuffer, 0, color);
        this._renderer.device.queue.writeBuffer(this._highlightColorBuffer, 0, highlightColor);
        this._renderer.device.queue.writeBuffer(this._useHighlight, 0, useHighlight);
        this._renderer.device.queue.writeBuffer(this._useColorMap, 0, useColorMap);
        this._renderer.device.queue.writeTexture(
            { texture: this._cMapTexture },
            colorMapTexture,
            {},
            { width: 256, height: 1 },
        );
        this._renderer.device.queue.writeBuffer(this._opacity, 0, opacity);
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

    /**
     * Creates the shaders for the pipeline.
     */
    abstract renderPass(camera: Camera): void;
}
