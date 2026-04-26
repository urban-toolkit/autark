/**
 * @module AutkCompute
 * Public entry point for the `autk-compute` package.
 *
 * This module re-exports the compute engine, pipeline helpers, viewpoint
 * utilities, and shared types used by package consumers.
 */

/** Unified compute engine. */
export { AutkComputeEngine } from './compute';

/** GPGPU compute pipeline. */
export { ComputeGpgpu } from './compute-gpgpu';

/** Render compute pipeline. */
export { ComputeRender } from './compute-render';

/** Viewpoint utilities. */
export {
    generateViewOrigins,
    expandCameraSamples,
    buildCameraMatrices,
} from './viewpoint';

/** Building-window triangulation helper from `autk-core`. */
export { TriangulatorBuildingWithWindows } from 'autk-core';

/** Building-window layout types from `autk-core`. */
export type { BuildingWindowLayoutEntry, BuildingWindowLayoutResult } from 'autk-core';

/** Public pipeline parameter types. */
export type {
    RenderLayer,
    RenderCameraOptions,
    RenderPipelineParams,
    RenderViewpoints,
    RenderViewpointStrategy,
    GpgpuPipelineParams,
} from './api';

/** Shared core types from `autk-core`. */
export type {
    ViewProjectionParams,
    TypedArray,
    TypedArrayConstructor,
} from 'autk-core';
