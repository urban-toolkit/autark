/// <reference types="@webgpu/types" />

export interface GpuFeatureDraw {
    /** Vertex buffer containing interleaved position data (float32x3 per vertex). */
    vBuf: GPUBuffer;

    /** Index buffer containing triangle indices (uint32). */
    iBuf: GPUBuffer;

    /** Total number of indices to draw for this feature. */
    indexCount: number;

    /** Uniform buffer carrying encoded render ids for this feature draw. */
    idBuf: GPUBuffer;
}
