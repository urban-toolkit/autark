/// <reference types="@webgpu/types" />

export class Renderer {
    // HTML Canvas reference
    canvas: HTMLCanvasElement;

    // API Data Structures
    adapter: GPUAdapter | null = null;
    device!: GPUDevice;

    // WebGPU context
    context!: any;

    // Frame buffer
    colorAttachment!: GPURenderPassColorAttachment;

    // Depth buffer
    depthAttachment!: GPURenderPassDepthStencilAttachment;

    // Render pass encoder
    renderPassDesc!: GPURenderPassDescriptor;

    // command encoder
    commandEncoder!: GPUCommandEncoder;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
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
            this.adapter = await entry.requestAdapter();
            console.log(this.adapter);
            if (this.adapter === null) {
                return false;
            }

            // Logical Device
            this.device = await this.adapter.requestDevice();
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    // Configure the webgpu canvas context
    configureContext() {
        if (!this.context) {
            this.context = this.canvas.getContext('webgpu') as any;
        }

        if (this.context) {
            const canvasConfig: GPUCanvasConfiguration = {
                device: this.device,
                format: 'bgra8unorm',
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
                alphaMode: 'opaque'
            };
            this.context.configure(canvasConfig);
        }
    }

    configureOutBuffers() {
        // Frame buffer definition
        const colorTexture = this.context.getCurrentTexture();
        const colorTextureView = colorTexture.createView();

        this.colorAttachment = {
            view: colorTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        };

        // Depth buffer definition
        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this.canvas.width, this.canvas.height, 1],
            dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        };
        const depthTexture = this.device.createTexture(depthTextureDesc);
        const depthTextureView = depthTexture.createView();

        this.depthAttachment = {
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
        if (!this.context) {
            console.error("WebGPU cannot be initialized - Canvas does not support WebGPU");
            return;
        }
        // Frame and depth buffers
        this.configureOutBuffers();

        // Render pass description
        this.renderPassDesc = {
            colorAttachments: [this.colorAttachment],
            depthStencilAttachment: this.depthAttachment
        };

        // Create a new command encoder
        this.commandEncoder = this.device.createCommandEncoder();
    }

    endEncoder() {
        // Submit commands
        this.device.queue.submit([this.commandEncoder.finish()]);
    }
}