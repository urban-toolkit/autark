/**
 * Single aggregation point for all `autk-core` re-exports used within `autk-plot`.
 *
 * Internal modules import from here instead of directly from `autk-core`,
 * keeping the dependency edge explicit and centralized.
 */

// ─── Color mapping ───────────────────────────────────────────────────────────

/** Strategy enum controlling how a colormap domain is derived from data. */
export { ColorMapDomainStrategy, ColorMapInterpolator } from 'autk-core';
/** Colormap utility with conversions and data-to-color sampling helpers. */
export { ColorMap } from 'autk-core';

/** Core color and colormap type re-exports consumed by `autk-plot`. */
export type { ColorHEX, ColorRGB, ColorTEX } from 'autk-core';
/** Core color-domain type re-exports consumed by `autk-plot`. */
export type { ColorMapConfig, ColorMapDomainSpec, ResolvedDomain } from 'autk-core';

// ─── Events ──────────────────────────────────────────────────────────────────

/** Typed event emitter re-export used by chart event APIs. */
export { EventEmitter } from 'autk-core';
/** Event helper type re-exports used throughout the package. */
export type { EventListener, SelectionData } from 'autk-core';

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Dot-path accessor re-export used for chart and transform data lookup. */
export { valueAtPath } from 'autk-core';
