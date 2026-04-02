/// <reference types="@webgpu/types" />

import { MapStyle } from './map-style';

/**
 * WebGPU renderer responsible for canvas configuration, render target allocation,
 * render-pass bootstrap, and GPU resource lifecycle.
 */
export class Renderer {
    /** HTML canvas used as render surface. */
    protected _canvas: HTMLCanvasElement;

    /** Logical GPU device. */
    protected _device!: GPUDevice;

    /** WebGPU canvas context. */
    protected _context!: GPUCanvasContext | null;

    /** Multisample color texture used before resolve. */
    protected _multisampleTexture!: GPUTexture;
    /** Main render-pass color attachment. */
    protected _frameBuffer!: GPURenderPassColorAttachment;

    /** Depth texture for the main render pass. */
    protected _depthTexture!: GPUTexture;
    /** Main render-pass depth attachment. */
    protected _depthBuffer!: GPURenderPassDepthStencilAttachment;

    /** Picking render-pass color attachment. */
    protected _pickingBuffer!: GPURenderPassColorAttachment;
    /** Picking color texture. */
    protected _pickingTexture!: GPUTexture;
    /** Picking render-pass depth attachment. */
    protected _pickingDepthBuffer!: GPURenderPassDepthStencilAttachment;
    /** Picking depth texture. */
    protected _pickingDepthTexture!: GPUTexture;

    /** Active command encoder for the current pass bootstrap. */
    protected _commandEncoder!: GPUCommandEncoder;

    /** MSAA sample count for the main render pass. */
    protected _sampleCount: number = 4;
    /** Sample count for picking pass (usually 1). */
    protected _pickingSampleCount: number = 1;
    /** Preferred surface format returned by WebGPU. */
    protected _canvasFormat!: GPUTextureFormat;
    /** Renderer initialization state. */
    protected _isInitialized: boolean = false;

    /**
     * Creates a renderer bound to a canvas.
     * @param canvas Target HTML canvas.
     */
    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
    }

    /** Underlying render canvas. */
    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /** Active WebGPU canvas context (if configured). */
    get context(): GPUCanvasContext | null {
        return this._context;
    }

    /** Logical GPU device. */
    get device(): GPUDevice {
        return this._device;
    }

    /** Main color attachment used by the primary render pass. */
    get frameBuffer(): GPURenderPassColorAttachment {
        return this._frameBuffer;
    }

    /** Depth attachment used by the primary render pass. */
    get depthBuffer(): GPURenderPassDepthStencilAttachment {
        return this._depthBuffer;
    }

    /** Active command encoder for the current frame pass setup. */
    get commandEncoder(): GPUCommandEncoder {
        return this._commandEncoder;
    }

    /** MSAA sample count used for the main pass. */
    get sampleCount(): number {
        return this._sampleCount;
    }

    /** Picking color texture used for object-id readback. */
    get pickingTexture(): GPUTexture {
        return this._pickingTexture;
    }

    /** Picking color attachment descriptor. */
    get pickingBuffer(): GPURenderPassColorAttachment {
        return this._pickingBuffer;
    }

    /** Picking depth attachment descriptor. */
    get pickingDepthBuffer(): GPURenderPassDepthStencilAttachment {
        return this._pickingDepthBuffer;
    }

    /**
     * Initializes WebGPU and creates all core render targets.
     */
    async init(): Promise<void> {
        const api = await this.initWebGPU();

        if (api) {
            this.configureContext();
            this.configureFrameBuffer();
            this.configureDepthBuffer();
            this.configurePickingBuffer();
            this._isInitialized = true;
        } else {
            this._isInitialized = false;
            console.error('Renderer initialization failed: WebGPU is not available.');
        }
    }

    /**
     * Initializes the WebGPU device and preferred canvas format.
     * @returns True when initialization succeeds; otherwise false.
     */
    async initWebGPU(): Promise<boolean> {
        try {
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            this._canvasFormat = entry.getPreferredCanvasFormat();

            const adapter = await entry.requestAdapter();
            if (adapter === null) {
                return false;
            }

            this._device = await adapter.requestDevice();
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    /**
     * Resizes the canvas and recreates size-dependent render targets.
     * @param width New canvas width in pixels.
     * @param height New canvas height in pixels.
     */
    resize(width: number, height: number): void {
        if (!this._isInitialized) {
            return;
        }

        // Avoid invalid zero-sized GPU textures when the host container is collapsed.
        this._canvas.width = Math.max(1, Math.floor(width));
        this._canvas.height = Math.max(1, Math.floor(height));

        this.configureContext();
        this.configureFrameBuffer();
        this.configureDepthBuffer();
        this.configurePickingBuffer();
    }

    /**
     * Configures the WebGPU canvas context.
     */
    configureContext(): void {
        if (!this._device) {
            return;
        }

        if (!this._context) {
            this._context = this._canvas.getContext('webgpu');
        }

        if (this._context) {
            const canvasConfig: GPUCanvasConfiguration = {
                device: this._device,
                format: this._canvasFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
                alphaMode: 'premultiplied',
            };
            this._context.configure(canvasConfig);
        }
    }

    /**
     * Creates or recreates color/depth attachments for picking.
     */
    configurePickingBuffer(): void {
        if (!this._device) {
            return;
        }

        this._pickingTexture?.destroy();
        this._pickingDepthTexture?.destroy();

        const desc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            sampleCount: this._pickingSampleCount,
        };

        this._pickingTexture = this._device.createTexture(desc);
        const pickingTextureView = this._pickingTexture.createView();

        this._pickingBuffer = {
            view: pickingTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        };

        const depthDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this._pickingSampleCount,
        };
        this._pickingDepthTexture = this._device.createTexture(depthDesc);
        const pickingDepthTextureView = this._pickingDepthTexture.createView();

        this._pickingDepthBuffer = {
            view: pickingDepthTextureView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    /**
     * Creates or recreates the main color attachment and multisample texture.
     */
    configureFrameBuffer(): void {
        if (!this._device) {
            return;
        }

        if (!this._context) {
            console.error('GPU canvas context is null.');
            return;
        }

        this._multisampleTexture?.destroy();

        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        const multiSampleDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height],
            sampleCount: this._sampleCount,
            format: this._canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        };

        this._multisampleTexture = this._device.createTexture(multiSampleDesc);
        const multiSampleTextureView = this._multisampleTexture.createView();

        const sky = MapStyle.getColor('background');
        this._frameBuffer = {
            view: multiSampleTextureView,
            resolveTarget: colorTextureView,
            clearValue: { r: sky.r / 255, g: sky.g / 255, b: sky.b / 255, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        };
    }

    /**
     * Creates or recreates the main depth attachment.
     */
    configureDepthBuffer(): void {
        if (!this._device) {
            return;
        }

        this._depthTexture?.destroy();

        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height, 1],
            sampleCount: this._sampleCount,
            dimension: '2d',
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        };

        this._depthTexture = this._device.createTexture(depthTextureDesc);
        const depthTextureView = this._depthTexture.createView();

        this._depthBuffer = {
            view: depthTextureView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    /**
     * Starts the main render pass by clearing configured attachments.
     */
    start(): void {
        if (!this._isInitialized) {
            return;
        }

        if (!this._context) {
            console.error('GPU canvas context is null.');
            return;
        }

        // Configure the frame buffer
        this._frameBuffer.loadOp = 'clear';
        this._frameBuffer.resolveTarget = this._context.getCurrentTexture().createView();

        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._frameBuffer],
            depthStencilAttachment: this._depthBuffer,
        };

        this._beginEmptyRenderPass(renderPassDesc);
    }

    /**
     * Submits the current command buffer.
     */
    finish(): void {
        if (!this._isInitialized || !this._commandEncoder) {
            return;
        }
        this._device.queue.submit([this._commandEncoder.finish()]);
    }

    /**
     * Starts the picking render pass by clearing picking attachments.
     */
    startPickingRenderPass(): void {
        if (!this._isInitialized) {
            return;
        }

        this._pickingBuffer.loadOp = 'clear';

        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._pickingBuffer],
            depthStencilAttachment: this._pickingDepthBuffer,
        };

        this._beginEmptyRenderPass(renderPassDesc);
    }

    /**
     * Explicitly release GPU resources and reset renderer state.
     * Should be called when disposing the map to prevent leaks.
     */
    destroy(): void {
        this._multisampleTexture?.destroy();
        this._depthTexture?.destroy();
        this._pickingTexture?.destroy();
        this._pickingDepthTexture?.destroy();
        this._context?.unconfigure();

        this._isInitialized = false;
    }

    /**
     * Creates a command encoder and opens/closes an empty pass to clear attachments.
     * @param renderPassDesc Render pass descriptor to execute.
     */
    private _beginEmptyRenderPass(renderPassDesc: GPURenderPassDescriptor): void {
        this._commandEncoder = this._device.createCommandEncoder();
        const passEncoder = this._commandEncoder.beginRenderPass(renderPassDesc);
        passEncoder.end();
    }
}
