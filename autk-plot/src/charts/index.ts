/**
 * Chart implementation re-exports.
 *
 * Aggregates all concrete chart classes so internal modules and the public API
 * can import from a single location instead of from individual implementation files.
 */

/** Bar chart supporting categorical values and histogram bins. */
export { Barchart } from './barchart';
/** Line chart for temporal and timeseries aggregated data. */
export { Linechart } from './linechart';
/** Parallel coordinates chart for multivariate feature exploration. */
export { ParallelCoordinates } from './pcoordinates';
/** Two-dimensional scatter plot with click and brush interactions. */
export { Scatterplot } from './scatterplot';
/** Table visualization with sortable columns and row selection. */
export { TableVis } from './tablevis';
/** Heat matrix mapping two categorical dimensions to a grid of color-encoded rectangles. */
export { Heatmatrix } from './heatmatrix';
