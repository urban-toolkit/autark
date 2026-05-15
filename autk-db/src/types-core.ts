/**
 * @module AutkDbCoreTypes
 * Shared `autk-core` definitions used by `@urban-toolkit/autk-db`.
 *
 * Centralizes package-local re-exports of shared core types and helpers so database internals can depend on one local entry point.
 */

/** Shared geometry and layer metadata types used throughout the database package. */
export type { BoundingBox, LayerType } from 'autk-core';

/** Shared `autk-core` helpers used while loading and classifying spatial data. */
export { computeIntersectingClusterIds, mapGeometryTypeToLayerType } from 'autk-core';
