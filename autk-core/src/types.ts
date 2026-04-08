/**
 * Layer types supported across the Autark toolkit.
 */
export type LayerType =
  | 'surface'
  | 'water'
  | 'parks'
  | 'roads'
  | 'buildings'
  | 'points'
  | 'polygons'
  | 'polylines'
  | 'raster';

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
 * @property SEQ_REDS - Sequential red color interpolation.
 * @property SEQ_BLUES - Sequential blue color interpolation.
 * @property DIV_RED_BLUE - Diverging red-blue color interpolation.
 * @property DIV_SPECTRAL - Diverging spectral color interpolation.
 * @property CAT_OBSERVABLE10 - Observable10 categorical color scheme.
 * @property CAT_PAIRED - Paired categorical color scheme.
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
 * @property r - Red component (0–255).
 * @property g - Green component (0–255).
 * @property b - Blue component (0–255).
 * @property alpha - Alpha/opacity (0–1).
 */
export type ColorRGB = { r: number; g: number; b: number; alpha: number };

/**
 * Represents a texture of colors as a flat array of numbers.
 * Each group of four numbers is an RGBA color.
 * @example [255, 87, 51, 1, 236, 12, 34, 0.8, ...]
 */
export type ColorTEX = number[];

/**
 * Geographic bounding box with named coordinate fields.
 */
export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
