// ─── Plot entry point ───────────────────────────────────────────────────────

/** Unified chart wrapper used to instantiate and interact with plot types. */
export { AutkChart } from './main';

// ─── Core re-exports (from autk-core via core-types) ───────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy } from './core-types';
/** Interpolator identifiers for d3-scale-chromatic color schemes. */
export { ColorMapInterpolator } from './core-types';
/** Colormap utility: conversions and data-to-color sampling helpers. */
export { ColorMap } from './core-types';

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
} from './core-types';

// ─── API and config types ───────────────────────────────────────────────────

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
	AutkDatum,
	ChartConfig,
	ChartType,
	UnifiedChartConfig,
} from './api';

// ─── Events ─────────────────────────────────────────────────────────────────

/** Typed event emitter used by plot event APIs. */
export { EventEmitter } from './core-types';

export type { 
	/** Listener function type used by the event emitter. */
	EventListener,
	/** Data structure for representing selected elements in the plot. */
    SelectionData
} from './core-types';

/** Supported chart interaction events emitted by plot instances. */
export { ChartEvent } from './events-types';
export type { ChartEventData, ChartEventRecord } from './events-types';

/** Base class for all concrete chart implementations. */
export { ChartBase } from './chart-base';

// ─── Shared style helpers ───────────────────────────────────────────────────

/** Global default/highlight style helpers shared by chart implementations. */
export { ChartStyle } from './chart-style';

// ─── Transform helpers ─────────────────────────────────────────────────────

/** Shared data transformation engine and ready-to-use transform presets. */
export * from './transforms';