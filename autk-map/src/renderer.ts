/**
 * @module Renderer
 * WebGPU renderer and render-target manager for `@urban-toolkit/autk-map`.
 *
 * This module provides the `Renderer` class, which configures the canvas
 * context, allocates the main and picking render targets, manages command
 * encoder lifetime, and handles size-dependent GPU resources. It also
 * supports picking readback buffers and CSS-to-pixel coordinate conversion for
 * input-driven readback operations.
 */

/// <reference types="@webgpu/types" />

import { MapStyle } from './map-style';

/**
 * WebGPU renderer responsible for canvas setup, render-target management, and
 * frame-level GPU resource lifecycle.
 *
 * `Renderer` owns the WebGPU canvas context, allocates the multisampled main
 * pass targets and the offscreen picking targets, and exposes helpers for
 * starting render passes, submitting command buffers, and rebuilding
 * size-dependent resources after resize events.
 */
export class Renderer {
    private static readonly PICK_READBACK_BYTES_PER_ROW = 256;
    private static readonly PICK_READBACK_BUFFER_COUNT = 2;
    private static _sharedDevicePromise: Promise<GPUDevice | null> | null = null;
    /** HTML canvas used as the backing render surface. */
    protected _canvas: HTMLCanvasElement;

    /** Logical WebGPU device used for all allocations. */
    protected _device!: GPUDevice;

    /** Lazily configured WebGPU canvas context. */
    protected _context!: GPUCanvasContext | null;

    /** Multisampled color texture used by the main pass before resolve. */
    protected _multisampleTexture!: GPUTexture;
    /** Main render-pass color attachment descriptor. */
    protected _frameBuffer!: GPURenderPassColorAttachment;

    /** Depth texture used by the main render pass. */
    protected _depthTexture!: GPUTexture;
    /** Main render-pass depth attachment descriptor. */
    protected _depthBuffer!: GPURenderPassDepthStencilAttachment;

    /** Offscreen color attachment used by the picking pass. */
    protected _pickingBuffer!: GPURenderPassColorAttachment;
    /** Offscreen color texture used for picking readback. */
    protected _pickingTexture!: GPUTexture;
    /** Depth attachment used by the picking pass. */
    protected _pickingDepthBuffer!: GPURenderPassDepthStencilAttachment;
    /** Depth texture used by the picking pass. */
    protected _pickingDepthTexture!: GPUTexture;

    /** Active command encoder for the current frame. */
    protected _commandEncoder: GPUCommandEncoder | null = null;

    /** Double-buffered readback pool for picking copies. */
    private _pickReadbackBuffers: Array<{ buffer: GPUBuffer | null; size: number; busy: boolean }> = Array.from(
        { length: Renderer.PICK_READBACK_BUFFER_COUNT },
        () => ({ buffer: null, size: 0, busy: false })
    );

    /** MSAA sample count for the main render pass. */
    protected _sampleCount: number = 4;
    /** Sample count for the picking pass. */
    protected _pickingSampleCount: number = 1;
    /** Preferred canvas format returned by WebGPU. */
    protected _canvasFormat!: GPUTextureFormat;
    /** Indicates whether WebGPU resources have been initialized. */
    protected _isInitialized: boolean = false;
    /** Canvas layout width in CSS pixels. */
    protected _cssWidth: number = 1;
    /** Canvas layout height in CSS pixels. */
    protected _cssHeight: number = 1;
    /** Canvas backing-store width in device pixels. */
    protected _pixelWidth: number = 1;
    /** Canvas backing-store height in device pixels. */
    protected _pixelHeight: number = 1;
    /** Device pixel ratio used to derive backing-store size. */
    protected _devicePixelRatio: number = 1;
    /** Color texture containing 2D layer output projected onto terrain. */
    private _overlayTexture?: GPUTexture;
    /** Multisampled color texture resolved into `_overlayTexture`. */
    private _overlayMultisampleTexture?: GPUTexture;
    /** Depth texture used while rendering terrain overlay layers. */
    private _overlayDepthTexture?: GPUTexture;
    /** Picking id texture containing overlay-layer picking output. */
    private _overlayPickingTexture?: GPUTexture;
    /** Depth texture used while rendering overlay picking ids. */
    private _overlayPickingDepthTexture?: GPUTexture;
    /** View for the resolved terrain overlay color texture. */
    private _overlayTextureView?: GPUTextureView;
    /** View for the multisampled terrain overlay color texture. */
    private _overlayMultisampleTextureView?: GPUTextureView;
    /** View for the terrain overlay depth texture. */
    private _overlayDepthTextureView?: GPUTextureView;
    /** View for the terrain overlay picking texture. */
    private _overlayPickingTextureView?: GPUTextureView;
    /** View for the terrain overlay picking depth texture. */
    private _overlayPickingDepthTextureView?: GPUTextureView;
    /** Current terrain overlay texture width in pixels. */
    private _overlayWidth = 0;
    /** Current terrain overlay texture height in pixels. */
    private _overlayHeight = 0;
    /** Depth texture used to composite 3D layers against terrain. */
    private _terrainDepthTexture?: GPUTexture;
    /** View for the terrain composite depth texture. */
    private _terrainDepthTextureView?: GPUTextureView;
    /** Current terrain depth texture width in pixels. */
    private _terrainDepthWidth = 0;
    /** Current terrain depth texture height in pixels. */
    private _terrainDepthHeight = 0;

    /**
     * Creates a renderer bound to a canvas.
     *
     * @param canvas Target HTML canvas.
     * @throws Never throws.
     */
    constructor(canvas: HTMLCanvasElement, private readonly _style: MapStyle) {
        this._canvas = canvas;
        this._syncCanvasMetrics(canvas.offsetWidth || canvas.width, canvas.offsetHeight || canvas.height, window.devicePixelRatio || 1);
    }

    /** Map style used by renderer-owned passes and pipelines. */
    get style(): MapStyle {
        return this._style;
    }

    /** Underlying render canvas. */
    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /** Canvas layout width in CSS pixels. */
    get cssWidth(): number {
        return this._cssWidth;
    }

    /** Canvas layout height in CSS pixels. */
    get cssHeight(): number {
        return this._cssHeight;
    }

    /** Canvas backing-store width in device pixels. */
    get pixelWidth(): number {
        return this._pixelWidth;
    }

    /** Canvas backing-store height in device pixels. */
    get pixelHeight(): number {
        return this._pixelHeight;
    }

    /** Terrain overlay texture width in pixels. */
    get overlayWidth(): number {
        return this._overlayWidth;
    }

    /** Terrain overlay texture height in pixels. */
    get overlayHeight(): number {
        return this._overlayHeight;
    }

    /** Terrain depth texture view used by terrain-aware building compositing. */
    get terrainDepthTextureView(): GPUTextureView {
        if (!this._terrainDepthTextureView) {
            throw new Error('Terrain depth texture has not been configured.');
        }
        return this._terrainDepthTextureView;
    }

    /** Device pixel ratio currently applied to the render surface. */
    get devicePixelRatio(): number {
        return this._devicePixelRatio;
    }

    /** Preferred canvas format negotiated with WebGPU. */
    get canvasFormat(): GPUTextureFormat {
        return this._canvasFormat;
    }

    /** Active WebGPU canvas context, if configured. */
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

    /** Active command encoder for the current frame. */
    get commandEncoder(): GPUCommandEncoder {
        if (!this._commandEncoder) {
            throw new Error('Renderer command encoder requested outside an active frame.');
        }
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

    /** Main depth texture view used by render paths that need direct sampling. */
    get depthTextureView(): GPUTextureView {
        return this._depthBuffer.view as GPUTextureView;
    }

    /** Terrain overlay color texture view sampled by the terrain renderer. */
    get overlayTextureView(): GPUTextureView {
        if (!this._overlayTextureView) {
            throw new Error('Overlay texture has not been configured.');
        }
        return this._overlayTextureView;
    }

    /** Terrain overlay picking texture view sampled by terrain picking. */
    get overlayPickingTextureView(): GPUTextureView {
        if (!this._overlayPickingTextureView) {
            throw new Error('Overlay picking texture has not been configured.');
        }
        return this._overlayPickingTextureView;
    }

    /**
     * Initializes WebGPU and creates all core render targets.
     *
     * @throws Never throws. Failures log to console and leave the renderer uninitialized.
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
     *
     * @returns `true` when adapter and device acquisition succeed; otherwise `false`.
     * @throws Never throws. Errors are caught and return `false`.
     */
    async initWebGPU(): Promise<boolean> {
        try {
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            this._canvasFormat = entry.getPreferredCanvasFormat();

            if (!Renderer._sharedDevicePromise) {
                Renderer._sharedDevicePromise = (async () => {
                    const adapter = await entry.requestAdapter();
                    if (adapter === null) return null;
                    return adapter.requestDevice();
                })();
            }

            const device = await Renderer._sharedDevicePromise;
            if (device === null) {
                Renderer._sharedDevicePromise = null;
                return false;
            }

            this._device = device;
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    /**
     * Resizes the canvas and recreates size-dependent render targets.
     *
     * @param cssWidth New layout width in CSS pixels.
     * @param cssHeight New layout height in CSS pixels.
     * @param devicePixelRatio Backing-store scale factor.
     * @throws Never throws.
     */
    resize(cssWidth: number, cssHeight: number, devicePixelRatio: number = window.devicePixelRatio || 1): void {
        this._syncCanvasMetrics(cssWidth, cssHeight, devicePixelRatio);

        if (!this._isInitialized) {
            return;
        }

        this.configureContext();
        this.configureFrameBuffer();
        this.configureDepthBuffer();
        this.configurePickingBuffer();
    }

    /**
     * Configures the WebGPU canvas context.
     *
     * The context is created lazily and then configured with the negotiated
     * canvas format and render-attachment usage.
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
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
                alphaMode: 'premultiplied',
            };
            this._context.configure(canvasConfig);
        }
    }

    /**
     * Creates or recreates color and depth attachments for picking.
     *
     * The picking pass renders into an offscreen texture sized to the current
     * backing store so object ids can be read back at pixel precision.
     */
    configurePickingBuffer(): void {
        if (!this._device) {
            return;
        }

        this._pickingTexture?.destroy();
        this._pickingDepthTexture?.destroy();

        const desc: GPUTextureDescriptor = {
            size: [this._pixelWidth, this._pixelHeight],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
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
            size: [this._pixelWidth, this._pixelHeight],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
            sampleCount: this._pickingSampleCount,
        };
        this._pickingDepthTexture = this._device.createTexture(depthDesc);
        const pickingDepthTextureView = this._pickingDepthTexture.createView();

        this._pickingDepthBuffer = {
            view: pickingDepthTextureView,
            depthClearValue: 0.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    /**
     * Creates or recreates the main color attachment and multisample texture.
     *
     * The attachment resolves into the current swap-chain texture and uses the
     * configured background color as its clear value.
     */
    configureFrameBuffer(): void {
        if (!this._device) {
            return;
        }

        if (!this._context) {
            console.error('GPU canvas context is null.');
            return;
        }

        let colorTextureView: GPUTextureView;
        try {
            colorTextureView = this._context.getCurrentTexture().createView();
        } catch {
            return;
        }

        this._multisampleTexture?.destroy();

        const multiSampleDesc: GPUTextureDescriptor = {
            size: [this._pixelWidth, this._pixelHeight],
            sampleCount: this._sampleCount,
            format: this._canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        };

        this._multisampleTexture = this._device.createTexture(multiSampleDesc);
        const multiSampleTextureView = this._multisampleTexture.createView();

        const sky = this._style.getColor('background');
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
     *
     * The depth texture matches the current backing-store size and is used by
     * the primary render pass.
     */
    configureDepthBuffer(): void {
        if (!this._device) {
            return;
        }

        this._depthTexture?.destroy();

        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this._pixelWidth, this._pixelHeight, 1],
            sampleCount: this._sampleCount,
            dimension: '2d',
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
        };

        this._depthTexture = this._device.createTexture(depthTextureDesc);
        const depthTextureView = this._depthTexture.createView();

        this._depthBuffer = {
            view: depthTextureView,
            depthClearValue: 0.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    /**
     * Starts the main render pass by clearing configured attachments.
     *
     * @throws Never throws. Silently returns when not initialized or when the
     * canvas context has been transiently unconfigured (e.g. by a sibling
     * renderer's destroy/recreate cycle in a multi-instance setup).
     */
    start(): void {
        if (!this._isInitialized) {
            return;
        }

        if (!this._context) {
            console.error('GPU canvas context is null.');
            return;
        }

        let currentTextureView: GPUTextureView;
        try {
            currentTextureView = this._context.getCurrentTexture().createView();
        } catch {
            return;
        }

        // Configure the frame buffer
        this._frameBuffer.loadOp = 'clear';
        this._frameBuffer.resolveTarget = currentTextureView;
        const sky = this._style.getColor('background');
        this._frameBuffer.clearValue = { r: sky.r / 255, g: sky.g / 255, b: sky.b / 255, a: 1 };

        this._beginFrame();
    }

    /**
     * Opens the shared main render pass for the current frame.
     *
     * @returns An encoder for the primary pass.
     * @throws If the renderer has not been initialized or GPU context is null.
     */
    beginMainRenderPass(): GPURenderPassEncoder {
        if (!this._isInitialized) {
            throw new Error('Renderer main pass requested before initialization.');
        }

        if (!this._context) {
            throw new Error('GPU canvas context is null.');
        }

        this._frameBuffer.loadOp = 'clear';
        this._frameBuffer.resolveTarget = this._context.getCurrentTexture().createView();
        this._depthBuffer.depthLoadOp = 'clear';

        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._frameBuffer],
            depthStencilAttachment: this._depthBuffer,
        };

        return this.commandEncoder.beginRenderPass(renderPassDesc);
    }

    /**
     * Begins a main color-only render pass.
     *
     * @param loadOp Load operation for the main color attachment.
     * @returns Render pass encoder targeting the current canvas color attachment.
     * @throws If the renderer has not been initialized.
     * @example
     * const pass = renderer.beginMainColorRenderPass('load');
     */
    beginMainColorRenderPass(loadOp: GPULoadOp = 'load'): GPURenderPassEncoder {
        if (!this._isInitialized || !this._context) {
            throw new Error('Renderer color pass requested before initialization.');
        }

        this._frameBuffer.loadOp = loadOp;
        this._frameBuffer.resolveTarget = this._context.getCurrentTexture().createView();

        return this.commandEncoder.beginRenderPass({
            colorAttachments: [this._frameBuffer],
        });
    }

    /**
     * Creates or resizes the terrain composite depth texture.
     *
     * @param width Requested texture width in pixels.
     * @param height Requested texture height in pixels.
     * @returns `true` when the texture was recreated, otherwise `false`.
     * @throws If GPU texture creation fails.
     * @example
     * renderer.configureTerrainDepthTexture(width, height);
     */
    configureTerrainDepthTexture(width: number, height: number): boolean {
        if (!this._device || (this._terrainDepthTexture && width === this._terrainDepthWidth && height === this._terrainDepthHeight)) {
            return false;
        }

        this._terrainDepthTexture?.destroy();
        this._terrainDepthWidth = width;
        this._terrainDepthHeight = height;
        this._terrainDepthTexture = this._device.createTexture({
            label: 'Terrain composite depth texture',
            size: [width, height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._terrainDepthTextureView = this._terrainDepthTexture.createView();
        return true;
    }

    /**
     * Begins a depth-only pass for terrain compositing.
     *
     * @returns Render pass encoder writing to the terrain depth texture.
     * @throws If the terrain depth texture has not been configured.
     * @example
     * const pass = renderer.beginTerrainDepthRenderPass();
     */
    beginTerrainDepthRenderPass(): GPURenderPassEncoder {
        if (!this._terrainDepthTextureView) {
            throw new Error('Renderer terrain depth pass requested before terrain depth texture configuration.');
        }

        return this.commandEncoder.beginRenderPass({
            label: 'Terrain composite depth pass',
            colorAttachments: [],
            depthStencilAttachment: {
                view: this._terrainDepthTextureView,
                depthClearValue: 0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
    }

    /**
     * Creates or resizes terrain overlay color, depth, and picking textures.
     *
     * @param width Requested overlay texture width in pixels.
     * @param height Requested overlay texture height in pixels.
     * @returns `true` when overlay textures were recreated, otherwise `false`.
     * @throws If GPU texture creation fails.
     * @example
     * renderer.configureOverlayTexture(4096, 4096);
     */
    configureOverlayTexture(width: number, height: number): boolean {
        if (!this._device || (this._overlayTexture && width === this._overlayWidth && height === this._overlayHeight)) {
            return false;
        }

        this._overlayTexture?.destroy();
        this._overlayMultisampleTexture?.destroy();
        this._overlayDepthTexture?.destroy();
        this._overlayPickingTexture?.destroy();
        this._overlayPickingDepthTexture?.destroy();
        this._overlayWidth = width;
        this._overlayHeight = height;

        this._overlayTexture = this._device.createTexture({
            label: 'Terrain overlay texture',
            size: [width, height],
            format: this._canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._overlayMultisampleTexture = this._device.createTexture({
            label: 'Terrain overlay MSAA texture',
            size: [width, height],
            sampleCount: this._sampleCount,
            format: this._canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this._overlayDepthTexture = this._device.createTexture({
            label: 'Terrain overlay depth texture',
            size: [width, height],
            sampleCount: this._sampleCount,
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this._overlayPickingTexture = this._device.createTexture({
            label: 'Terrain overlay picking texture',
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._overlayPickingDepthTexture = this._device.createTexture({
            label: 'Terrain overlay picking depth texture',
            size: [width, height],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this._overlayTextureView = this._overlayTexture.createView();
        this._overlayMultisampleTextureView = this._overlayMultisampleTexture.createView();
        this._overlayDepthTextureView = this._overlayDepthTexture.createView();
        this._overlayPickingTextureView = this._overlayPickingTexture.createView();
        this._overlayPickingDepthTextureView = this._overlayPickingDepthTexture.createView();
        return true;
    }

    /**
     * Begins the terrain overlay color render pass.
     *
     * @param clearColor Background beneath draped layers; transparent by default.
     * @returns Render pass encoder targeting the overlay color and depth textures.
     * @throws If overlay textures have not been configured.
     * @example
     * const pass = renderer.beginOverlayRenderPass();
     */
    beginOverlayRenderPass(clearColor: GPUColor = { r: 0, g: 0, b: 0, a: 0 }): GPURenderPassEncoder {
        if (!this._overlayTextureView || !this._overlayMultisampleTextureView || !this._overlayDepthTextureView) {
            throw new Error('Renderer overlay pass requested before overlay texture configuration.');
        }

        return this.commandEncoder.beginRenderPass({
            label: 'Terrain overlay render pass',
            colorAttachments: [
                {
                    view: this._overlayMultisampleTextureView,
                    resolveTarget: this._overlayTextureView,
                    clearValue: clearColor,
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this._overlayDepthTextureView,
                depthClearValue: 0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
    }

    /**
     * Begins the terrain overlay picking render pass.
     *
     * @returns Render pass encoder targeting overlay picking and depth textures.
     * @throws If overlay picking textures have not been configured.
     * @example
     * const pass = renderer.beginOverlayPickingRenderPass();
     */
    beginOverlayPickingRenderPass(): GPURenderPassEncoder {
        if (!this._overlayPickingTextureView || !this._overlayPickingDepthTextureView) {
            throw new Error('Renderer overlay picking pass requested before overlay texture configuration.');
        }

        return this.commandEncoder.beginRenderPass({
            label: 'Terrain overlay picking render pass',
            colorAttachments: [
                {
                    view: this._overlayPickingTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this._overlayPickingDepthTextureView,
                depthClearValue: 0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
    }

    /**
     * Submits the current command buffer and clears the active encoder.
     *
     * @throws Never throws. Silently returns when not initialized or no encoder exists.
     */
    finish(): void {
        if (!this._isInitialized || !this._commandEncoder) {
            return;
        }
        this._device.queue.submit([this._commandEncoder.finish()]);
        this._commandEncoder = null;
    }

    /**
     * Starts the picking render pass by clearing picking attachments.
     *
     * @throws Never throws. Silently returns when not initialized.
     */
    startPickingRenderPass(): void {
        if (!this._isInitialized) {
            return;
        }

        this._pickingBuffer.loadOp = 'clear';
        this._pickingDepthBuffer.depthLoadOp = 'clear';

        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._pickingBuffer],
            depthStencilAttachment: this._pickingDepthBuffer,
        };

        this._beginFrame();
        this._beginEmptyRenderPass(renderPassDesc);
    }

    /**
     * Begins a picking render pass and returns its encoder.
     *
     * @param depthLoadOp Load operation for the picking depth attachment.
     * @returns Render pass encoder targeting the main picking attachments.
     * @throws If the renderer has not been initialized.
     * @example
     * const pass = renderer.beginPickingRenderPass('clear');
     */
    beginPickingRenderPass(depthLoadOp: GPULoadOp = 'clear'): GPURenderPassEncoder {
        if (!this._isInitialized) {
            throw new Error('Renderer picking pass requested before initialization.');
        }

        this._pickingBuffer.loadOp = 'clear';
        this._pickingDepthBuffer.depthLoadOp = depthLoadOp;

        return this.commandEncoder.beginRenderPass({
            colorAttachments: [this._pickingBuffer],
            depthStencilAttachment: this._pickingDepthBuffer,
        });
    }

    /**
     * Begins a depth-only pass using the picking depth attachment.
     *
     * @returns Render pass encoder writing only picking depth.
     * @throws If the renderer has not been initialized.
     * @example
     * const pass = renderer.beginPickingDepthRenderPass();
     */
    beginPickingDepthRenderPass(): GPURenderPassEncoder {
        if (!this._isInitialized) {
            throw new Error('Renderer picking depth pass requested before initialization.');
        }

        return this.commandEncoder.beginRenderPass({
            label: 'Picking depth render pass',
            colorAttachments: [],
            depthStencilAttachment: {
                view: this._pickingDepthBuffer.view,
                depthClearValue: 0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });
    }

    /**
     * Reserves a double-buffered picking readback slot for the current frame.
     *
     * @param pickCount Number of single-pixel readbacks to accommodate.
     * @returns The reserved slot index, or `null` when no slot is available.
     * @throws Never throws.
     */
    reservePickingReadbackSlot(pickCount: number): number | null {
        if (!this._isInitialized || pickCount <= 0) {
            return null;
        }

        const bufferSize = Renderer.PICK_READBACK_BYTES_PER_ROW * pickCount;
        for (let index = 0; index < this._pickReadbackBuffers.length; index++) {
            const slot = this._pickReadbackBuffers[index];
            if (slot.busy) {
                continue;
            }

            if (!slot.buffer || slot.size < bufferSize) {
                slot.buffer?.destroy();
                slot.buffer = this._device.createBuffer({
                    label: `Picking readback buffer ${index}`,
                    size: bufferSize,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                slot.size = bufferSize;
            }

            slot.busy = true;
            return index;
        }

        return null;
    }

    /**
     * Queues a single-pixel picking texture readback into a reserved slot.
     *
     * @param slotIndex Reserved readback slot index.
     * @param pickIndex Offset within the slot for this pick.
     * @param x CSS-relative x coordinate.
     * @param y CSS-relative y coordinate.
     * @throws If the requested slot is not reserved.
     */
    enqueuePickingReadback(slotIndex: number, pickIndex: number, x: number, y: number): void {
        const slot = this._pickReadbackBuffers[slotIndex];
        if (!slot?.buffer) {
            throw new Error(`Picking readback slot ${slotIndex} is not reserved.`);
        }

        const [px, py] = this.toPixelCoordinates(x, y);

        this.commandEncoder.copyTextureToBuffer(
            {
                texture: this._pickingTexture,
                origin: { x: px, y: py },
            },
            {
                buffer: slot.buffer,
                offset: pickIndex * Renderer.PICK_READBACK_BYTES_PER_ROW,
                bytesPerRow: Renderer.PICK_READBACK_BYTES_PER_ROW,
            },
            { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
    }

    /**
     * Maps a reserved readback slot and decodes all picked ids.
     *
     * @param slotIndex Reserved readback slot index.
     * @param pickCount Number of copied pick records to decode.
     * @returns Decoded object ids in copy order, or an empty array when unavailable.
     * @throws If the buffer map operation times out or the device is lost.
     */
    async readPickingResults(slotIndex: number, pickCount: number): Promise<number[]> {
        const slot = this._pickReadbackBuffers[slotIndex];
        if (!slot?.buffer) {
            return [];
        }

        try {
            await slot.buffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = slot.buffer.getMappedRange();
            const data = new Uint8Array(arrayBuffer);
            const ids: number[] = [];
            for (let index = 0; index < pickCount; index++) {
                const offset = index * Renderer.PICK_READBACK_BYTES_PER_ROW;
                ids.push(this._decodeColorToId(data[offset], data[offset + 1], data[offset + 2]));
            }
            return ids;
        } finally {
            if (slot.buffer.mapState === 'mapped') {
                slot.buffer.unmap();
            }
            slot.busy = false;
        }
    }

    /**
     * Releases GPU resources, unconfigures the canvas, and resets renderer state.
     *
     * @throws Never throws.
     */
    destroy(): void {
        // Mark uninitialized first so that any tick that races with destroy()
        // (e.g. an in-flight animation frame from a sibling renderer that
        // shares the canvas's GPUCanvasContext) sees `_isInitialized === false`
        // and bails out of `start()` / `beginMainRenderPass()` before touching
        // the resources we are about to release below.
        this._isInitialized = false;

        this._multisampleTexture?.destroy();
        this._depthTexture?.destroy();
        this._pickingTexture?.destroy();
        this._pickingDepthTexture?.destroy();
        this._overlayTexture?.destroy();
        this._overlayMultisampleTexture?.destroy();
        this._overlayDepthTexture?.destroy();
        this._overlayPickingTexture?.destroy();
        this._overlayPickingDepthTexture?.destroy();
        this._terrainDepthTexture?.destroy();
        this._pickReadbackBuffers.forEach((slot) => slot.buffer?.destroy());
        this._context?.unconfigure();

        this._commandEncoder = null;
    }

    /** Ensures a command encoder exists for the current frame. */
    private _beginFrame(): void {
        if (!this._commandEncoder) {
            this._commandEncoder = this._device.createCommandEncoder();
        }
    }

    /**
     * Opens and immediately closes an empty render pass to clear attachments.
     *
     * The pass is started on the shared command encoder so attachment clear
     * operations are encoded without issuing draw calls.
     *
     * @param renderPassDesc Render pass descriptor to execute.
     */
    private _beginEmptyRenderPass(renderPassDesc: GPURenderPassDescriptor): void {
        const passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
        passEncoder.end();
    }

    /** Decodes an RGB picking color into the original object id. */
    private _decodeColorToId(r: number, g: number, b: number): number {
        const id = (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16);
        return id - 1;
    }

    /**
     * Converts CSS-relative coordinates into clamped backing-store pixel coordinates.
     *
     * @param x CSS-relative x coordinate.
     * @param y CSS-relative y coordinate.
     * @returns Clamped pixel coordinates `[px, py]`.
     * @throws Never throws.
     */
    toPixelCoordinates(x: number, y: number): [number, number] {
        const scaleX = this._cssWidth > 0 ? this._pixelWidth / this._cssWidth : 1;
        const scaleY = this._cssHeight > 0 ? this._pixelHeight / this._cssHeight : 1;
        const px = Math.max(0, Math.min(this._pixelWidth - 1, Math.floor(x * scaleX)));
        const py = Math.max(0, Math.min(this._pixelHeight - 1, Math.floor(y * scaleY)));
        return [px, py];
    }

    /**
     * Synchronizes CSS and backing-store metrics before any GPU reallocation
     * work.
     *
     * The canvas element is resized to the computed backing-store dimensions so
     * subsequent render-target allocation uses the updated size.
     */
    private _syncCanvasMetrics(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
        this._cssWidth = Math.max(1, Math.floor(cssWidth));
        this._cssHeight = Math.max(1, Math.floor(cssHeight));
        this._devicePixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
        this._pixelWidth = Math.max(1, Math.floor(this._cssWidth * this._devicePixelRatio));
        this._pixelHeight = Math.max(1, Math.floor(this._cssHeight * this._devicePixelRatio));

        this._canvas.width = this._pixelWidth;
        this._canvas.height = this._pixelHeight;
    }
}
