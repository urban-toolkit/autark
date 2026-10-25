/**
 * Provenance entry point and re-exports.
 *
 * Exposes the relation algebra and the per-draw provenance graph used by plots
 * to answer direct and inverse queries and to draw segregated marks.
 */

export { compose, transpose, image, cardinality } from './relations';
export { ProvenanceModel, featureId, markId, reduceUnits } from './model';
