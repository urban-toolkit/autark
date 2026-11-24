/**
 * Plot registration and built-in plot re-exports.
 *
 * Every plot, built-in or user, is a definition drawn by `RegisteredPlot`;
 * this module gathers the registration API, registers the built-in
 * definitions, and exports the highlight of the segregated view.
 */

/** Plots drawn by a registered definition, built-in or user: D3 drawing code plus SVG annotations. */
export { RegisteredPlot, registerPlot, unregisterPlot, registeredPlot, hasRegisteredPlot, checkPlot } from './registered';
/** Registers the built-in plots written as definitions. */
import './built-in';
export type { PlotArrangeContext, PlotDefinition, PlotDrawContext, PlotHighlight, PlotHighlightContext, PlotSeries } from './registered';
/** Highlight of a selection from another view (boolean, subset, custom), and its inference from the marks of a drawing. */
export type { CustomPreset, HighlightDesign, HighlightMode, HighlightRule, MarkKind, SubsetChannel } from './partial-design';
/** Tree of the rows of the `hierarchy` transform, as the treemap and sunburst draw it. */
export { treeOf } from './hierarchy-tree';
export type { TreeDatum } from './hierarchy-tree';
