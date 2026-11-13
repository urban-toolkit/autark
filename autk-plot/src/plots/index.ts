/**
 * Plot registration and built-in plot re-exports.
 *
 * Every plot, built-in or user, is a definition drawn by `RegisteredPlot`;
 * this module gathers the registration API, registers the built-in
 * definitions, and exports the design space of the segregated view.
 */

/** Plots drawn by a registered definition, built-in or user: D3 drawing code plus SVG annotations. */
export { RegisteredPlot, registerPlot, unregisterPlot, registeredPlot, hasRegisteredPlot, checkPlot } from './registered';
/** Registers the built-in plots written as definitions. */
import './built-in';
export type { PlotArrangeContext, PlotDefinition, PlotDrawContext, PlotPartContext, PlotSeries } from './registered';
/** Design space of the segregated view, inferred from the marks of a drawing. */
export { htmlFill, inferPartialDesign, markKindOf, memberOffset, ownMatrix, parseFlow, parseRibbon, parseSector, ratioOf } from './partial-design';
export type { DeclaredDesign, MarkKind, PartialDesign, PartialRule } from './partial-design';
/** Tree of the rows of the `hierarchy` transform, as the treemap and sunburst draw it. */
export { treeOf } from './hierarchy-tree';
export type { TreeDatum } from './hierarchy-tree';
