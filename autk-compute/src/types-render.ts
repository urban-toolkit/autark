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

    /** Stable object key used when formatting object visibility results. */
    objectKey: string;

    /** Class bucket index written into the offscreen render target. */
    classIndex: number;

    /** Global object index written into the offscreen render target. */
    objectIndex: number;
}
