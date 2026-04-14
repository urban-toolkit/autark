/**
 * Strategy modes for colormap domain construction.
 */
export enum ColorMapDomainStrategy {
  USER = 'user',
  MIN_MAX = 'minMax',
  PERCENTILE = 'percentile',
}

/** The resolved / computed domain returned by the colormap engine. */
export type ResolvedDomain = number[] | string[];

/**
 * Specification for how the colormap domain should be derived from data.
 */
export type ColorMapDomainSpec =
  | { type: ColorMapDomainStrategy.USER; params: number[] | string[] }
  | { type: ColorMapDomainStrategy.MIN_MAX }
  | { type: ColorMapDomainStrategy.PERCENTILE; params?: [number, number] }; // params: [lowerPercentile, upperPercentile] in 0–100 range, default [2, 98]

/**
 * Color map interpolators for thematic data visualization.
 */
export enum ColorMapInterpolator {
  SEQ_REDS = 'interpolateReds',
  SEQ_BLUES = 'interpolateBlues',
  DIV_RED_BLUE = 'interpolateRdBu',
  DIV_SPECTRAL = 'interpolateSpectral',
  CAT_OBSERVABLE10 = 'schemeObservable10',
  CAT_PAIRED = 'schemePaired',
}

/**
 * Unified color-map configuration used by map rendering and legend generation.
 */
export type ColorMapConfig = {
  /** Interpolator used to convert normalized values into colors. */
  interpolator: ColorMapInterpolator;
  /** Specification of how the colormap domain should be derived from data. */
  domainSpec: ColorMapDomainSpec;
};

/**
 * Represents a color in hexadecimal format.
 */
export type ColorHEX = `#${string}`;

/**
 * Represents a color in RGB format with an alpha channel.
 */
export type ColorRGB = { r: number; g: number; b: number; alpha: number };

/**
 * Represents a texture of colors as a flat array of numbers.
 */
export type ColorTEX = number[];
