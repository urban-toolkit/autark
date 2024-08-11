/// <reference types="@webgpu/types" />

import trianglesVertexSource from './shaders/triangles.vert.wgsl';
import trianglesFragmentSource from './shaders/triangles.frag.wgsl';

import { Pipeline } from './pipeline';
import { Renderer } from './renderer';

import { Camera } from './camera';

import { TrianglesLayer } from './layer-triangles';

export class PipelineTriangleFlat extends Pipeline {
  // Vertex buffers
  protected _positionBuffer!: GPUBuffer;
  protected _thematicBuffer!: GPUBuffer;
  protected _indicesBuffer!: GPUBuffer;

  // shaders
  protected _vertModule!: GPUShaderModule;
  protected _fragModule!: GPUShaderModule;

  // render pipeline
  protected _pipeline!: GPURenderPipeline;

  constructor(renderer: Renderer) {
    super(renderer);
  }

  build(mesh: TrianglesLayer) {
    this.createShaders();

    this.createVertexBuffers(mesh);
    this.createColorUniformBindGroup();
    this.createCameraUniformBindGroup();

    this.createPipeline();
  }

  createShaders() {
    // Vertex shader
    const vsmDesc = {
      code: trianglesVertexSource,
    };
    this._vertModule = this._renderer.device.createShaderModule(vsmDesc);

    // Fragment shader
    const fsmDesc = {
      code: trianglesFragmentSource,
    };
    this._fragModule = this._renderer.device.createShaderModule(fsmDesc);
  }

  createVertexBuffers(mesh: TrianglesLayer) {
    // vertex data
    this._positionBuffer = this._renderer.device.createBuffer({
      label: 'Position buffer',
      size: mesh.position.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // vertex data
    this._thematicBuffer = this._renderer.device.createBuffer({
      label: 'Thematic data buffer',
      size: mesh.thematic.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // vertex data
    this._indicesBuffer = this._renderer.device.createBuffer({
      label: 'Primitive indices buffer',
      size: mesh.indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
  }

  updateVertexBuffers(mesh: TrianglesLayer) {
    this._renderer.device.queue.writeBuffer(this._positionBuffer, 0, new Float32Array(mesh.position));
    this._renderer.device.queue.writeBuffer(this._thematicBuffer, 0, new Float32Array(mesh.thematic));
    this._renderer.device.queue.writeBuffer(this._indicesBuffer, 0, new Uint32Array(mesh.indices));
  }

  createPipeline() {
    // Vertex data
    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[location(0)]]
      offset: 0,
      format: 'float32x3',
    };
    const thematicAttribDesc: GPUVertexAttribute = {
      shaderLocation: 1, // [[location(1)]]
      offset: 0,
      format: 'float32',
    };

    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: 'vertex',
    };
    const thematicBufferDesc: GPUVertexBufferLayout = {
      attributes: [thematicAttribDesc],
      arrayStride: 4 * 1, // sizeof(float) * 3
      stepMode: 'vertex',
    };

    // Vertex Shader
    const vertex: GPUVertexState = {
      module: this._vertModule,
      entryPoint: 'main',
      buffers: [positionBufferDesc, thematicBufferDesc],
    };

    // Fragment Shader
    const fragment: GPUFragmentState = {
      module: this._fragModule,
      entryPoint: 'main',
      targets: [
        {
          format: 'bgra8unorm',
        },
      ],
    };

    // Rasterization
    const primitive: GPUPrimitiveState = {
      frontFace: 'cw',
      cullMode: 'none',
      topology: 'triangle-list',
    };

    // Antialising
    const multisample: GPUMultisampleState = {
      count: this._renderer.sampleCount,
    };

    // Depth test
    const depthStencil: GPUDepthStencilState = {
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
      format: 'depth32float',
    };

    // Uniform Data
    const pipelineLayoutDesc = {
      bindGroupLayouts: [this._colorsBindGroupLayout, this._cameraBindGroupLayout],
    };

    // Pipeline
    const layout = this._renderer.device.createPipelineLayout(pipelineLayoutDesc);
    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout,
      vertex,
      fragment,
      primitive,
      depthStencil,
      multisample,
    };
    this._pipeline = this._renderer.device.createRenderPipeline(pipelineDesc);
  }

  renderPass(mesh: TrianglesLayer, camera: Camera) {
    // Create a new command encoder
    const commandEncoder = this._renderer.device.createCommandEncoder();

    // changes buffer behaviour
    this._renderer.frameBuffer.loadOp = 'load';

    // Render pass description
    const renderPassDesc = {
      colorAttachments: [this._renderer.frameBuffer],
      depthStencilAttachment: this._renderer.depthBuffer,
    };

    // Create a new pass commands encoder
    const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);

    // sets the current pipeline
    passEncoder.setPipeline(this._pipeline);

    // updates all data
    this.updateVertexBuffers(mesh);
    this.updateColorUniforms(mesh);
    this.updateCameraUniforms(camera);

    // sets the vertex buffers
    passEncoder.setVertexBuffer(0, this._positionBuffer);
    passEncoder.setVertexBuffer(1, this._thematicBuffer);

    // sets primitive indices buffer
    passEncoder.setIndexBuffer(this._indicesBuffer, 'uint32');

    // sets the uniform buffers
    passEncoder.setBindGroup(0, this._colorsBindGroup);
    passEncoder.setBindGroup(1, this._cameraBindGroup);

    // draw command
    passEncoder.drawIndexed(this._indicesBuffer.size / Uint32Array.BYTES_PER_ELEMENT);
    passEncoder.end();

    this._renderer.device.queue.submit([commandEncoder.finish()]);
  }
}
