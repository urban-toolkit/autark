/// <reference types="@webgpu/types" />

export class Renderer {
    // HTML Canvas reference
    protected _canvas: HTMLCanvasElement;

    // Logical GPU
    protected _device!: GPUDevice;

    // WebGPU context
    protected _context!: GPUCanvasContext | null;

    // Multisample & depth textures
    protected _multisampleTexture!: GPUTexture;
    protected _colorTexture!: GPUTexture;
    protected _frameBuffer!: GPURenderPassColorAttachment;

    protected _depthTexture!: GPUTexture;
    protected _depthBuffer!: GPURenderPassDepthStencilAttachment;

    // Picking
    protected _pickingBuffer!: GPURenderPassColorAttachment;
    protected _pickingTexture!: GPUTexture;
    protected _pickingDepthBuffer!: GPURenderPassDepthStencilAttachment;
    protected _pickingDepthTexture!: GPUTexture;

    // command encoder
    protected _commandEncoder!: GPUCommandEncoder;

    // antalising
    protected _sampleCount: number = 4;
    protected _pickingSampleCount: number = 1;

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
    }

    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    get context(): GPUCanvasContext | null {
        return this._context;
    }

    get device(): GPUDevice {
        return this._device;
    }

    get frameBuffer(): GPURenderPassColorAttachment {
        return this._frameBuffer;
    }

    get depthBuffer(): GPURenderPassDepthStencilAttachment {
        return this._depthBuffer;
    }

    get commandEncoder(): GPUCommandEncoder {
        return this._commandEncoder;
    }

    get sampleCount(): number {
        return this._sampleCount;
    }

    get pickingTexture(): GPUTexture {
        return this._pickingTexture;
    }

    get pickingBuffer(): GPURenderPassColorAttachment {
        return this._pickingBuffer;
    }

    get pickingDepthBuffer(): GPURenderPassDepthStencilAttachment {
        return this._pickingDepthBuffer;
    }

    // Start the rendering engine
    async init() {
        const api = await this.initWebGPU();

        if (api) {
            this.configureContext();
            this.configureFrameBuffer();
            this.configureDepthBuffer();
            this.configurePickingBuffer();
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
            console.log({ adapter });
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

    resize(width: number, height: number) {
        this._canvas.width = width;
        this._canvas.height = height;

        this.configureContext();
        this.configureFrameBuffer();
        this.configureDepthBuffer();
        this.configurePickingBuffer();
    }

    // Configure the webgpu canvas context
    configureContext() {
        if (!this._context) {
            this._context = this._canvas.getContext('webgpu');
        }

        if (this._context) {
            const canvasConfig: GPUCanvasConfiguration = {
                device: this._device,
                format: 'bgra8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
                alphaMode: 'premultiplied',
            };
            this._context.configure(canvasConfig);
        }
    }

    configurePickingBuffer() {
        const desc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            sampleCount: this._pickingSampleCount
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

    configureFrameBuffer() {
        if (!this._context) {
            console.error("GPU canvas context is null.");
            return;
        }

        // Frame buffer definition
        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        // Aliasing texture
        const multiSampleDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height],
            sampleCount: this._sampleCount,
            format: 'bgra8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        };

        this._multisampleTexture = this._device.createTexture(multiSampleDesc);
        const multiSampleTextureView = this._multisampleTexture.createView();

        // Framebuffer definition
        const sky = { r: 255, g: 255, b: 255 };
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

        this._depthTexture = this._device.createTexture(depthTextureDesc);
        const depthTextureView = this._depthTexture.createView();

        // depth buffer definition
        this._depthBuffer = {
            view: depthTextureView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        };
    }

    start() {
        if (!this._context) {
            console.error("GPU canvas context is null.");
            return;
        }

        // Configure the frame buffer
        this._frameBuffer.loadOp = 'clear';
        this._frameBuffer.resolveTarget = this._context.getCurrentTexture().createView();

        // Create a new command encoder
        this._commandEncoder = this._device.createCommandEncoder();

        // Render pass description
        const renderPassDesc = {
            colorAttachments: [this._frameBuffer],
            depthStencilAttachment: this._depthBuffer,
        };

        // Create a new command encoder
        const passEncoder = this._commandEncoder.beginRenderPass(renderPassDesc);
        passEncoder.end();
    }

    finish() {
        this._device.queue.submit([this._commandEncoder.finish()]);
    }

    startPickingRenderPass() {

        this._pickingBuffer.loadOp = 'clear';
        
        this._commandEncoder = this._device.createCommandEncoder();

        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [this._pickingBuffer],
            depthStencilAttachment: this._pickingDepthBuffer
        };

        const passEncoder = this._commandEncoder.beginRenderPass(renderPassDesc);
        passEncoder.end();
    }

}
