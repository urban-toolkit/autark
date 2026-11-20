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
	PlotConfig,
	PlotType,
	UnifiedPlotConfig,
} from './api';

// ─── Events ─────────────────────────────────────────────────────────────────

/** Supported plot interaction events emitted by plot instances. */
export { PlotEvent } from './types-events';
export type { BrushExtent, PlotEventData, PlotEventRecord } from './types-events';

/** Shared plot base classes for data/transform and interactive behavior. */
export { PlotBaseData } from './plot-base-data';
export { PlotBaseInteractive } from './plot-base-interactive';
/** Normalized transform payload consumed by plot implementations. */
export type { ResolvedPlotTransform } from './plot-base-data';

// ─── Shared style helpers ───────────────────────────────────────────────────

/** Global default/highlight style helpers shared by plot implementations. */
export { PlotStyle } from './plot-style';

// ─── Transform helpers ─────────────────────────────────────────────────────

/** Shared data transformation engine and ready-to-use transform presets. */
export * from './transforms';
