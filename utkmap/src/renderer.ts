/// <reference types="@webgpu/types" />

import { MapStyle } from "./map-style";

export class Renderer {
    // HTML Canvas reference
    protected _canvas: HTMLCanvasElement;

    // Logical GPU
    protected _device!: GPUDevice;

    // WebGPU context
    protected _context!: GPUCanvasContext;

    // Frame buffer
    protected _frameBuffer!: GPURenderPassColorAttachment;

    // Depth buffer
    protected _depthBuffer!: GPURenderPassDepthStencilAttachment;

    // command encoder
    protected _commandEncoder!: GPUCommandEncoder;

    // command encoder
    protected _passEncoder!: GPURenderPassEncoder;

    // antalising
    protected _sampleCount: number = 4;

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
    }

    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    get device(): GPUDevice {
        return this._device;
    }

    get passEncoder(): GPURenderPassEncoder {
        return this._passEncoder;
    }

    get sampleCount(): number {
        return this._sampleCount;
    }

    // Start the rendering engine
    async init() {
        const api = await this.initWebGPU()

        if (api) {
            this.configureContext();
            this.configureFrameBuffer();
            this.configureDepthBuffer();
        }
    }

    // Initialize WebGPU
    async initWebGPU(): Promise<boolean> {
        try {
            // Access to the WebGPU object
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            // Physical Device Adapter
            const adapter = await entry.requestAdapter();
            console.log(adapter);
            if (adapter === null) {
                return false;
            }

            // Logical Device
            this._device = await adapter.requestDevice();
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    // Configure the webgpu canvas context
    configureContext() {
        if (!this._context) {
            this._context = this._canvas.getContext('webgpu') as any;
        }

        if (this._context) {
            const canvasConfig: GPUCanvasConfiguration = {
                device: this._device,
                format: 'bgra8unorm',
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
                alphaMode: 'opaque',
            };
            this._context.configure(canvasConfig);
        }
    }

    configureFrameBuffer() {
        // Frame buffer definition
        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        // Aliasing texture
        const multiSampleDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height, 1],
            sampleCount: this._sampleCount,
            format: 'bgra8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }
        const multiSampleTexture = this._device.createTexture(multiSampleDesc);
        const multiSampleTextureView = multiSampleTexture.createView();

        // Framebuffer definition
        const sky = MapStyle.getColor('sky');
        this._frameBuffer = {  
            view: multiSampleTextureView,
            resolveTarget: colorTextureView,
            clearValue: { r: sky.r / 255, g: sky.g / 255, b: sky.b / 255, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        };
    }

    configureDepthBuffer() {
        // Depth textire
        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height, 1],
            sampleCount: this._sampleCount,
            dimension: '2d',
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        };
        const depthTexture = this._device.createTexture(depthTextureDesc);
        const depthTextureView = depthTexture.createView();

        // depth buffer definition
        this._depthBuffer = {
            view: depthTextureView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
        };
    }

    start() {
        if (!this._context) {
            console.error("WebGPU cannot be initialized - Canvas does not support WebGPU");
            return;
        }

        // Configure the frame buffer
        this.configureFrameBuffer();

        // Render pass description
        const renderPassDesc = {
            colorAttachments: [this._frameBuffer],
            depthStencilAttachment: this._depthBuffer
        };

        // Create a new command encoder
        this._commandEncoder = this._device.createCommandEncoder();

        // Create a new pass commands encoder
        this._passEncoder = this._commandEncoder.beginRenderPass(renderPassDesc);

    }

    finish() {
        // Submit commands
        this._passEncoder.end();
        this._device.queue.submit([this._commandEncoder.finish()]);
    }
}