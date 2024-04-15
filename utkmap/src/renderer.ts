/// <reference types="@webgpu/types" />

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

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
    }

    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    get device(): GPUDevice {
        return this._device;
    }

    get context(): GPUCanvasContext {
        return this._context;
    }

    get frameBuffer(): GPURenderPassColorAttachment {
        return this._frameBuffer;
    }

    get depthBuffer(): GPURenderPassDepthStencilAttachment {
        return this._depthBuffer;
    }

    // Start the rendering engine
    async init() {
        const api = await this.initWebGPU()

        if (api) {
            this.configureContext();
            this.configureFrameAndDepth();
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
                alphaMode: 'opaque'
            };
            this._context.configure(canvasConfig);
        }
    }

    configureFrameAndDepth() {
        // Frame buffer definition
        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        this._frameBuffer = {
            view: colorTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        };

        // Depth buffer definition
        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this._canvas.width, this._canvas.height, 1],
            dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        };
        const depthTexture = this._device.createTexture(depthTextureDesc);
        const depthTextureView = depthTexture.createView();

        this._depthBuffer = {
            view: depthTextureView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            stencilClearValue: 0,
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store'
        };
    }
}