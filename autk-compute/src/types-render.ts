/// <reference types="@webgpu/types" />

/**
 * GPU buffer handles for a single rendered layer.
 *
 * This structure holds the WebGPU resources needed to render one layer
 * from a viewpoint: vertex and index buffers for geometry, plus a
 * uniform buffer containing the layer's color.
 *
 * @example
 * const layerData: GpuLayerData = {
 *   vBuf: device.createBuffer({ size: 1024, usage: GPUBufferUsage.VERTEX }),
 *   iBuf: device.createBuffer({ size: 512, usage: GPUBufferUsage.INDEX }),
 *   indexCount: 100,
 *   colorBuf: device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM })
 * };
 */
export interface GpuLayerData {
    /** Vertex buffer containing interleaved position data (float32x3 per vertex). */
    vBuf: GPUBuffer;

    /** Index buffer containing triangle indices (uint32). */
    iBuf: GPUBuffer;

    /** Total number of indices to draw for this layer. */
    indexCount: number;

    /** Uniform buffer containing the layer color as vec4f (RGBA in [0–1]). */
    colorBuf: GPUBuffer;
}
