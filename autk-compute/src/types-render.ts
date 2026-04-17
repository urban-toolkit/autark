/// <reference types="@webgpu/types" />

/** GPU buffer handles for a single rendered layer. */
export interface GpuLayerData {
    vBuf: GPUBuffer;
    iBuf: GPUBuffer;
    indexCount: number;
    colorBuf: GPUBuffer;
}
