// ─── Plot entry point ───────────────────────────────────────────────────────

/** Unified plot wrapper used to instantiate and interact with plot types. */
export { AutkPlot } from './plot';

// ─── API and config types ───────────────────────────────────────────────────

export type { AutkDatum } from './types-plot';

export type {
	PlotMargins,
	TransformReducer,
	TransformResolution,
	Binning1dTransformConfig,
	Binning2dTransformConfig,
	BinningEventsTransformConfig,
	ReduceSeriesTransformConfig,
	PlotTransformConfig,
	SortTransformConfig,
	BoxStatsTransformConfig,
	FlowsTransformConfig,
	BinningHexTransformConfig,
	HierarchyTransformConfig,
	CumulativeTransformConfig,
	FoldTransformConfig,
	DensityTransformConfig,
	RegisteredTransformConfig,
	PlotConfig,
	PlotType,
	UnifiedPlotConfig,
} from './api';

// ─── Events ─────────────────────────────────────────────────────────────────

/** Supported plot interaction events emitted by plot instances. */
export { PlotEvent } from './types-events';
export type { PlotEventData, PlotEventRecord } from './types-events';

/** Shared plot base classes for data/transform and interactive behavior. */
export { PlotBaseData } from './plot-base-data';
export { PlotBaseInteractive } from './plot-base-interactive';
/** Normalized transform payload consumed by plot implementations. */
export type { ResolvedPlotTransform } from './plot-base-data';

// ─── Shared style helpers ───────────────────────────────────────────────────

/** Global default/highlight style helpers shared by plot implementations. */
export { PlotStyle } from './plot-style';

// ─── Provenance ─────────────────────────────────────────────────────────────

/** Provenance graph, relation algebra, and entity id helpers. */
export { ProvenanceModel, compose, transpose, image, cardinality, featureId, markId } from './provenance';
/** Contract checks for transform provenance, for registered transforms and tests. */
export { checkProvenance, checkProvenanceReport, checkTransform, checkTransformReport } from './provenance/validate';
/** Plots registered by the user, and the check of their drawing contract. */
export { registerPlot, unregisterPlot, registeredPlot, checkPlot } from './plots';
export type { PlotDefinition, PlotDrawContext, PlotPartContext } from './plots';
/** Design space of the segregated view, inferred from the marks of a drawing. */
export { htmlFill, inferPartialDesign, markKindOf, memberOffset, ownMatrix, parseFlow, parseRibbon, parseSector, ratioOf } from './plots';
export type { MarkKind, PartialDesign, PartialRule } from './plots';
export type { SegregatedPart } from './plot-base-interactive';
export type { ContractReport, ContractViolation } from './provenance/validate';
export type { PlotProvenanceConfig, FilterCondition, TopKConfig } from './api';
export type {
	ProvenanceId,
	ProvenancePair,
	ProvenanceCardinality,
	ProvenanceStage,
	ProvenanceRelation,
	ProvenanceContribution,
	TransformProvenance,
	ProvenancePath,
	MarkContribution,
	FeatureShare,
} from './types-provenance';

// ─── Transform helpers ─────────────────────────────────────────────────────

/** Shared data transformation engine and ready-to-use transform presets. */
export * from './transforms';
