/// <reference types="@webgpu/types" />

import { Layer } from './layer';

import { Camera } from './camera';
import { Renderer } from './renderer';
import { MapStyle } from './map-style';
import { ColorMap } from './colormap';
import { IMapStyle } from './interfaces';

export abstract class Pipeline {
  // renderer reference
  protected _renderer: Renderer;

  // Transformation matrices uniform buffer
  protected _mviewBuffer!: GPUBuffer;
  protected _projcBuffer!: GPUBuffer;
  protected _cameraBindGroup!: GPUBindGroup;
  protected _cameraBindGroupLayout!: GPUBindGroupLayout;

  // Uniforms buffer
  protected _colorBuffer!: GPUBuffer;
  protected _useColorMap!: GPUBuffer;
  protected _cMapTexture!: GPUTexture;

  protected _colorsBindGroup!: GPUBindGroup;
  protected _colorsBindGroupLayout!: GPUBindGroupLayout;

  constructor(renderer: Renderer) {
    this._renderer = renderer;
  }

  createCameraUniformBindGroup() {
    this._mviewBuffer = this._renderer.device.createBuffer({
      label: 'ModelView matrix buffer',
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._projcBuffer = this._renderer.device.createBuffer({
      label: 'Projection matrix buffer',
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._cameraBindGroupLayout = this._renderer.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // modelview
          visibility: GPUShaderStage.VERTEX,
          buffer: {},
        },
        {
          binding: 1, // projection
          visibility: GPUShaderStage.VERTEX,
          buffer: {},
        },
      ],
    });

    this._cameraBindGroup = this._renderer.device.createBindGroup({
      layout: this._cameraBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this._mviewBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this._projcBuffer },
        },
      ],
    });
  }

  updateCameraUniforms(camera: Camera) {
    const mview = new Float32Array(camera.getModelViewMatrix());
    const projc = new Float32Array(camera.getProjectionMatrix());

    this._renderer.device.queue.writeBuffer(this._mviewBuffer, 0, mview);
    this._renderer.device.queue.writeBuffer(this._projcBuffer, 0, projc);
  }

  createColorUniformBindGroup() {
    this._colorBuffer = this._renderer.device.createBuffer({
      label: 'Fixed color buffer',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._useColorMap = this._renderer.device.createBuffer({
      label: 'Enable colormap on reder',
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._cMapTexture = this._renderer.device.createTexture({
      label: 'Colormap texture',
      size: { width: 256, height: 1 },
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      format: 'rgba8unorm',
    });

    const cMapSampler = this._renderer.device.createSampler({
      label: 'Fixed color buffer',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this._colorsBindGroupLayout = this._renderer.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // fixed color
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {},
        },
        {
          binding: 1, // show thematic data
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {},
        },
        {
          binding: 2, // cMap texture
          visibility: GPUShaderStage.FRAGMENT,
          texture: {},
        },
        {
          binding: 3, // cMap sampler
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {},
        },
      ],
    });

    this._colorsBindGroup = this._renderer.device.createBindGroup({
      layout: this._colorsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this._colorBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this._useColorMap },
        },
        {
          binding: 2,
          resource: this._cMapTexture.createView(),
        },
        {
          binding: 3,
          resource: cMapSampler,
        },
      ],
    });
  }

  updateColorUniforms(layer: Layer) {
    const colors = {
      color: MapStyle.getColor(layer.layerInfo.typeLayer as keyof IMapStyle),
      colorMap: ColorMap.getColorMap(layer.layerRenderInfo.colorMapInterpolator),
      useColorMap: <boolean>layer.layerRenderInfo.isColorMap,
    };

    const color = new Float32Array(Object.values(colors.color));
    const useColorMap = new Float32Array([colors.useColorMap ? 1.0 : 0.0]);
    const colorMapTexture = new Uint8Array(colors.colorMap);

    this._renderer.device.queue.writeBuffer(this._colorBuffer, 0, color);
    this._renderer.device.queue.writeBuffer(this._useColorMap, 0, useColorMap);
    this._renderer.device.queue.writeTexture(
      { texture: this._cMapTexture },
      colorMapTexture,
      {},
      { width: 256, height: 1 },
    );
  }

  abstract build(data: Layer): void;

  abstract createVertexBuffers(data: Layer): void;

  abstract updateVertexBuffers(data: Layer): void;

  abstract renderPass(camera: Camera): void;
}
