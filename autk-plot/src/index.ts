// ─── Plot entry point ───────────────────────────────────────────────────────

/** Unified chart wrapper used to instantiate and interact with plot types. */
export { AutkChart } from './chart';

// ─── Core re-exports (from autk-core via types-core) ───────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy } from './types-core';
/** Interpolator identifiers for d3-scale-chromatic color schemes. */
export { ColorMapInterpolator } from './types-core';
/** Colormap utility: conversions and data-to-color sampling helpers. */
export { ColorMap } from './types-core';

export type {
	/** Hex color string (for example `#5dade2`). */
	ColorHEX,
	/** RGB color triplet object. */
	ColorRGB,
	/** Texture/typed color payload used by rendering utilities. */
	ColorTEX,
	/** Colormap configuration payload. */
	ColorMapConfig,
	/** Domain specification for colormap scaling. */
	ColorMapDomainSpec,
} from './types-core';

// ─── API and config types ───────────────────────────────────────────────────

export type { AutkDatum } from './types-chart';

export type {
	ChartMargins,
	TransformReducer,
	TransformResolution,
	Binning1dTransformConfig,
	Binning2dTransformConfig,
	BinningEventsTransformConfig,
	ReduceSeriesTransformConfig,
	ChartTransformConfig,
	SortTransformConfig,
	ChartConfig,
	ChartType,
	UnifiedChartConfig,
} from './api';

// ─── Events ─────────────────────────────────────────────────────────────────

/** Typed event emitter used by plot event APIs. */
export { EventEmitter } from './types-core';

export type { 
	/** Listener function type used by the event emitter. */
	EventListener,
	/** Data structure for representing selected elements in the plot. */
    SelectionData
} from './types-core';

/** Supported chart interaction events emitted by plot instances. */
export { ChartEvent } from './types-events';
export type { ChartEventData, ChartEventRecord } from './types-events';

/** Base class for all concrete chart implementations. */
export { ChartBase } from './chart-base';

// ─── Shared style helpers ───────────────────────────────────────────────────

/** Global default/highlight style helpers shared by chart implementations. */
export { ChartStyle } from './chart-style';

// ─── Transform helpers ─────────────────────────────────────────────────────

/** Shared data transformation engine and ready-to-use transform presets. */
export * from './transforms';