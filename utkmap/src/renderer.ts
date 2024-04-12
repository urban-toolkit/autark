/// <reference types="@webgpu/types" />

export class Renderer {
    // HTML Canvas reference
    protected _canvas: HTMLCanvasElement;

    // Physical GPU
    protected _adapter: GPUAdapter | null = null;

    // Logical GPU
    protected _device!: GPUDevice;

    // WebGPU context
    protected _context!: any;

    // Frame buffer
    protected _colorAttachment!: GPURenderPassColorAttachment;

    // Depth buffer
    protected _depthAttachment!: GPURenderPassDepthStencilAttachment;

    // Render pass encoder
    protected _renderPassDesc!: GPURenderPassDescriptor;

    // command encoder
    protected _commandEncoder!: GPUCommandEncoder;

    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;
    }

    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    get device(): GPUDevice {
        return this._device;
    }

    get renderPassDesc(): GPURenderPassDescriptor {
        return this._renderPassDesc;
    }

    get commandEncoder(): GPUCommandEncoder {
        return this._commandEncoder;
    }

    // Start the rendering engine
    async init() {
        const api = await this.initAPI()

        if (api) {
            this.configureContext();
            this.configureOutBuffers();
        }
    }

    // Initialize WebGPU
    async initAPI(): Promise<boolean> {
        try {
            // Access to the WebGPU object
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            // Physical Device Adapter
            this._adapter = await entry.requestAdapter();
            console.log(this._adapter);
            if (this._adapter === null) {
                return false;
            }

            // Logical Device
            this._device = await this._adapter.requestDevice();
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

    configureOutBuffers() {
        // Frame buffer definition
        const colorTexture = this._context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        this._colorAttachment = {
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

        this._depthAttachment = {
            view: depthTextureView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            stencilClearValue: 0,
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store'
        };
    }

    // Write commands to send to the GPU
    beginEncoder() {
        if (!this._context) {
            console.error("WebGPU cannot be initialized - Canvas does not support WebGPU");
            return;
        }
        // Frame and depth buffers
        this.configureOutBuffers();

        // Render pass description
        this._renderPassDesc = {
            colorAttachments: [this._colorAttachment],
            depthStencilAttachment: this._depthAttachment
        };

        // Create a new command encoder
        this._commandEncoder = this._device.createCommandEncoder();
    }

    endEncoder() {
        // Submit commands
        this._device.queue.submit([this._commandEncoder.finish()]);
    }
}