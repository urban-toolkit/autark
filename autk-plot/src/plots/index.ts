/**
 * Plot implementation re-exports.
 *
 * Aggregates all concrete plot classes so internal modules and the public API
 * can import from a single location instead of from individual implementation files.
 */

/** Bar plot supporting categorical values and one-dimensional bins. */
export { Barchart } from './barchart';
/** Line plot for temporal event and reduced series data. */
export { Linechart } from './linechart';
/** Parallel coordinates plot for multivariate feature exploration. */
export { ParallelCoordinates } from './pcoordinates';
/** Two-dimensional scatter plot with click and brush interactions. */
export { Scatterplot } from './scatterplot';
/** Table visualization with sortable columns and row selection. */
export { TableVis } from './tablevis';
/** Heat matrix mapping two categorical dimensions to a grid of color-encoded rectangles. */
export { Heatmatrix } from './heatmatrix';
/** Box plot comparing numeric distributions across categories. */
export { Boxplot } from './boxplot';
/** Sankey diagram of feature flows through ordered categorical columns. */
export { Sankey } from './sankey';
/** Pie and donut charts of one grouped attribute. */
export { Piechart } from './piechart';
/** Area chart for event-based and series data. */
export { Areachart } from './areachart';
/** Scatter plot with bubble area proportional to a third attribute. */
export { Bubblechart } from './bubblechart';
/** Scatter plot aggregated into hexagons. */
export { Hexbin } from './hexbin';
/** Calendar heatmap of events per day. */
export { Calendar } from './calendar';
/** Waffle chart with one square per feature, grouped by category. */
export { Waffle } from './waffle';
/** Stacked bars of a two-level hierarchy. */
export { Stackedbar } from './stackedbar';
/** Treemap of a hierarchy of categories. */
export { Treemap } from './treemap';
/** Sunburst chart of a hierarchy of categories. */
export { Sunburst } from './sunburst';
/** Radar chart of several measures per category. */
export { Radar } from './radar';
/** ECDF and Pareto charts of accumulated shares. */
export { Cumulativechart } from './cumulativechart';
/** Chord diagram of the co-occurrence of two categorical attributes. */
export { Chord } from './chord';
/** Density chart: a kernel density estimate of a numeric attribute. */
export { Densitychart } from './densitychart';
/** Violin plot: one mirrored density per category. */
export { Violin } from './violin';
/** Plots registered by the user: D3 drawing code plus SVG annotations. */
export { RegisteredPlot, registerPlot, unregisterPlot, registeredPlot, checkPlot } from './registered';
export type { PlotDefinition, PlotDrawContext, PlotPartContext } from './registered';
/** Design space of the segregated view, inferred from the marks of a drawing. */
export { htmlFill, inferPartialDesign, markKindOf, memberOffset, ownMatrix, parseFlow, parseRibbon, parseSector, ratioOf } from './partial-design';
export type { MarkKind, PartialDesign, PartialRule } from './partial-design';
