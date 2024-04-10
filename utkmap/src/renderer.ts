/// <reference types="@webgpu/types" />

export default class Renderer {
    // HTML Canvas reference
    canvas: HTMLCanvasElement;

    // API Data Structures
    adapter: GPUAdapter | null = null;
    device!: GPUDevice;
    queue!: GPUQueue;

    // WebGPU context
    context!: any;

    // Frame buffer and depth buffer
    colorTexture!: GPUTexture;
    colorTextureView!: GPUTextureView;
    colorAttachment!: GPURenderPassColorAttachment;

    depthTexture!: GPUTexture;
    depthTextureView!: GPUTextureView;
    depthAttachment!: GPURenderPassDepthStencilAttachment;

    // Render pass encoder
    passEncoder!: GPURenderPassEncoder;

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

            // Execution Queue
            this.queue = this.device.queue;
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

        // Swapchain
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
        // Depth buffer definition
        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this.canvas.width, this.canvas.height, 1],
            dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        };
        this.depthTexture = this.device.createTexture(depthTextureDesc);
        this.depthTextureView = this.depthTexture.createView();

        this.depthAttachment = {
            view: this.depthTextureView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            stencilClearValue: 0,
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store'
        };

        // Frame buffer definition
        this.colorTexture = this.context.getCurrentTexture();
        this.colorTextureView = this.colorTexture.createView();

        this.colorAttachment = {
            view: this.colorTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
        };
    }

    // Write commands to send to the GPU
    beginRender() {
        if (!this.context) {
            console.error("WebGPU cannot be initialized - Canvas does not support WebGPU");
            return;
        }
        // Frame and depth buffers
        this.configureOutBuffers();

        // Create a new command encoder
        this.commandEncoder = this.device.createCommandEncoder();

        // Render pass description
        const renderPassDesc = {
            colorAttachments: [this.colorAttachment],
            depthStencilAttachment: this.depthAttachment
        };
        // Create a new pass commands encoder
        this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    }

    endRender() {
        // Submit commands
        this.queue.submit([this.commandEncoder.finish()]);
    }

    public static createBuffer = (device: GPUDevice, arr: Float32Array | Uint16Array, usage: number) => {
        // Align to 4 bytes
        let desc = {
            size: (arr.byteLength + 3) & ~3,
            usage,
            mappedAtCreation: true
        };
        let buffer = device.createBuffer(desc);
        const writeArray =
            arr instanceof Uint16Array
                ? new Uint16Array(buffer.getMappedRange())
                : new Float32Array(buffer.getMappedRange());
        writeArray.set(arr);
        buffer.unmap();
        return buffer;
    };
}