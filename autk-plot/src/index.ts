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

/** Typed event emitter used by plot event APIs. */
export { EventEmitter } from './core-types';

export type {
	/** Hex color string (for example `#5dade2`). */
	ColorHEX,
	/** RGB color triplet object. */
	ColorRGB,
	/** Texture/typed color payload used by rendering utilities. */
	ColorTEX,
	/** Colormap configuration payload. */
	ColorMapConfig,
	/** Listener function type used by the event emitter. */
	EventListener,
} from './core-types';

// ─── API and config types ───────────────────────────────────────────────────

export type {
	ChartMargins,
	HistogramConfig,
	AutkDatum,
	ChartConfig,
	ChartSelectionPayload,
	ChartEventRecord,
	ChartEvents,
	ChartType,
	ScatterplotChartConfig,
	BarchartChartConfig,
	ParallelCoordinatesChartConfig,
	TableChartConfig,
	LinechartUnifiedConfig,
	UnifiedChartConfig,
} from './api';

// ─── Events ─────────────────────────────────────────────────────────────────

/** Supported chart interaction events emitted by plot instances. */
export { ChartEvent } from './events-types';

// ─── Shared style helpers ───────────────────────────────────────────────────

/** Global default/highlight style helpers shared by chart implementations. */
export { ChartStyle } from './chart-style';