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
 * Normalization modes for mapping data values to the [0, 1] color range.
 * @property MIN_MAX - Normalize using the minimum and maximum values of the dataset.
 * @property PERCENTILE - Normalize using percentile bounds, clamping outliers to the color range edges.
 */
export enum NormalizationMode {
  MIN_MAX = 'minMax',
  PERCENTILE = 'percentile',
}

/**
 * Normalization configuration shared across map, plot, and compute modules.
 */
export type NormalizationConfig = {
  mode: NormalizationMode;
  lowerPercentile?: number;
  upperPercentile?: number;
};

/** Domain for sequential color scales: `[min, max]`. */
export type SequentialDomain = [number, number];

/** Domain for diverging color scales: `[min, center, max]`. */
export type DivergingDomain = [number, number, number];

/** Domain for categorical color scales: ordered list of category keys. */
export type CategoricalDomain = string[];

/**
 * Color map interpolators for thematic data visualization.
 * @property SEQUENTIAL_REDS - Red color interpolation.
 * @property SEQUENTIAL_BLUES - Blue color interpolation.
 * @property DIVERGING_RED_BLUE - Diverging red-blue color interpolation.
 * @property OBSERVABLE10 - Observable10 categorical color scheme.
 */
export enum ColorMapInterpolator {
  SEQUENTIAL_REDS = 'interpolateReds',
  SEQUENTIAL_BLUES = 'interpolateBlues',
  DIVERGING_RED_BLUE = 'interpolateRdBu',
  OBSERVABLE10 = 'schemeObservable10',
}

/**
 * Unified color-map configuration used by map rendering and legend generation.
 */
export type ColorMapConfig = {
  /** Interpolator used to convert normalized values into colors. */
  interpolator: ColorMapInterpolator;
  /** Labels displayed in the legend for the current map state. */
  labels?: string[];
  /** Explicit domain used when provided (takes precedence over normalization). */
  domain?: SequentialDomain | DivergingDomain | CategoricalDomain;
  /** Normalization strategy used to auto-compute domain when `domain` is omitted. */
  normalization?: NormalizationConfig;
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
