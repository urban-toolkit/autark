/// <reference types="@webgpu/types" />

import pickingVertexSource from './shaders/picking.vert.wgsl';
import pickingFragmentSource from './shaders/picking.frag.wgsl';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { Pipeline } from './pipeline';
import { Features2DLayer } from './layer-features2D';

export class PipelineTrianglePicking extends Pipeline {
  private _positionBuffer!: GPUBuffer;
  private _objectIdsBuffer!: GPUBuffer;
  private _indicesBuffer!: GPUBuffer;

  private _pipeline!: GPURenderPipeline;

  protected _vertModule!: GPUShaderModule;
  protected _fragModule!: GPUShaderModule;

  constructor(renderer: Renderer) {
    super(renderer);
  }

  build(mesh: Features2DLayer): void {

    this.createShaders();

    this.createVertexBuffers(mesh);
    this.createCameraUniformBindGroup();
    this.updateVertexBuffers(mesh);

    this.createPipeline();
  }

  createShaders() {
    // Vertex shader
    const vsmDesc = {
      code: pickingVertexSource,
    };
    this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

    // Fragment shader
    const fsmDesc = {
      code: pickingFragmentSource,
    };
    this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
  }

  createVertexBuffers(mesh: Features2DLayer): void {
    this._positionBuffer = this._renderer.device.createBuffer({
      label: 'Position buffer',
      size: mesh.position.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._objectIdsBuffer = this._renderer.device.createBuffer({
      label: 'Object id buffer',
      size: mesh.position.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._indicesBuffer = this._renderer.device.createBuffer({
      label: 'Primitive indices buffer',
      size: mesh.indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
  }

  updateVertexBuffers(layer: Features2DLayer): void {
    this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(layer.position));
    this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(layer.indices));

    // Prepare per-vertex object IDs
    const numVertices = layer.position.length / 3;
    const encodedColors: number[] = new Array(numVertices * 3).fill(0);

    for (let compId = 0; compId < layer.components.length; compId++) {
      const color = this._encodeIdToRGB(compId);
      const comp = layer.components[compId];

      const sTri = compId > 0 ? layer.components[compId - 1].nTriangles : 0;
      const eTri = comp.nTriangles;

      for (let t = sTri * 3; t < eTri * 3; t++) {
        const vertexIndex = layer.indices[t];
        const base = vertexIndex * 3;
        encodedColors[base + 0] = color[0];
        encodedColors[base + 1] = color[1];
        encodedColors[base + 2] = color[2];
      }
    }

    this._renderer.device.queue.writeBuffer(this._objectIdsBuffer, 0, new Float32Array(encodedColors));
  }

  async readPickedId(x: number, y: number): Promise<number> {

    const alignedBytesPerRow = 256; // Must be multiple of 256
    const bufferSize = alignedBytesPerRow * 1; // height = 1

    const readBuffer = this._renderer.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this._renderer.device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      {
        texture: this._renderer.pickingTexture,
        origin: { x, y: y },
      },
      {
        buffer: readBuffer,
        bytesPerRow: alignedBytesPerRow,
      },
      { width: 1, height: 1, depthOrArrayLayers: 1 }
    );
    this._renderer.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();
    const data = new Uint8Array(arrayBuffer);
    const id = this._decodeColorToId(data[0], data[1], data[2]);
    readBuffer.unmap();
    return id;
  }

  private _encodeIdToRGB(id: number): [number, number, number] {
    const shifted = id + 1; // reserve 0 for "no hit"
    const r = (shifted & 0xff) / 255;
    const g = ((shifted >> 8) & 0xff) / 255;
    const b = ((shifted >> 16) & 0xff) / 255;
    return [r, g, b];
  }

  private _decodeColorToId(r: number, g: number, b: number): number {
    const id = (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16);
    return id - 1;
  }

  private createPipeline(): void {
    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3',
    };
    const idAttribDesc: GPUVertexAttribute = {
      shaderLocation: 1, // [[location(1)]]
      offset: 0,
      format: 'float32x3',
    };

    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: 'vertex',
    };

    const idBufferDesc: GPUVertexBufferLayout = {
      attributes: [idAttribDesc],
      arrayStride: 4 * 3,
      stepMode: 'vertex',
    };

    // Vertex Shader
    const vertex: GPUVertexState = {
      module: this._vertModule,
      entryPoint: 'main',
      buffers: [positionBufferDesc, idBufferDesc],
    };

    // Fragment Shader
    const fragment: GPUFragmentState = {
      module: this._fragModule,
      entryPoint: 'main',
      targets: [
        {
          format: 'rgba8unorm',
        },
      ],
    };

    // Rasterization
    const primitive: GPUPrimitiveState = {
      frontFace: 'cw',
      cullMode: 'none',
      topology: 'triangle-list',
    };

    // Depth test
    const depthStencil: GPUDepthStencilState = {
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
      format: 'depth32float',
    };

    // Uniform Data
    const pipelineLayoutDesc = {
      bindGroupLayouts: [this._cameraBindGroupLayout],
    };

    // Pipeline
    const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout,
      vertex,
      fragment,
      primitive,
      depthStencil,
      label: "Pipeline triangle picking"
    };
    this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);

  }

  renderPass(camera: Camera): void {

    if (!this._renderer) {
      return;
    }

    // Create a new command encoder
    const commandEncoder = this._renderer.commandEncoder;

    // Render pass description
    const pickingPassDesc: GPURenderPassDescriptor = {
      colorAttachments: [this._renderer.pickingBuffer],
      depthStencilAttachment: this._renderer.pickingDepthBuffer,
    };

    // Create a new pass commands encoder
    const passEncoder = commandEncoder.beginRenderPass(pickingPassDesc);

    // sets the current pipeline
    passEncoder.setPipeline(this._pipeline);

    // updates camera
    this.updateCameraUniforms(camera);

    // sets the vertex buffers
    passEncoder.setVertexBuffer(0, this._positionBuffer);
    passEncoder.setVertexBuffer(1, this._objectIdsBuffer); 

    // sets primitive indices buffer
    passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

    // sets the uniform buffers
    passEncoder.setBindGroup(0, this._cameraBindGroup);

    // draw command
    passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
    passEncoder.end();
  }
}
