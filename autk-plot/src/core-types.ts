/**
 * Single aggregation point for all `autk-core` re-exports used within `autk-plot`.
 *
 * Internal modules import from here instead of directly from `autk-core`,
 * keeping the dependency edge explicit and centralized.
 */

// ─── Color mapping ───────────────────────────────────────────────────────────

export { ColorMapDomainStrategy, ColorMapInterpolator } from 'autk-core';
export { ColorMap } from 'autk-core';

export type { ColorHEX, ColorRGB, ColorTEX } from 'autk-core';
export type { ColorMapConfig, ColorMapDomainSpec, ResolvedDomain } from 'autk-core';

// ─── Events ──────────────────────────────────────────────────────────────────

export { EventEmitter } from 'autk-core';
export type { EventListener, SelectionData } from 'autk-core';

// ─── Utilities ───────────────────────────────────────────────────────────────

export { valueAtPath } from 'autk-core';
