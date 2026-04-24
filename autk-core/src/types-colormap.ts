/**
 * @module ColorMapTypes
 * Shared enums and types for color mapping, legend generation, and color-buffer
 * exchange across the toolkit.
 *
 * These types define how colormap domains are derived, which interpolators are
 * available, and how colors are represented in hex, RGBA, and texture-array
 * forms.
 */

/**
 * Strategy modes for colormap domain construction.
 */
export enum ColorMapDomainStrategy {
  USER = 'user',
  MIN_MAX = 'minMax',
  PERCENTILE = 'percentile',
}

/**
 * The resolved / computed domain returned by the colormap engine.
 */
export type ResolvedDomain = number[] | string[];

/**
 * Specification for how the colormap domain should be derived from data.
 */
export type ColorMapDomainSpec =
  /** Explicit user-supplied numeric or categorical domain. */
  | { type: ColorMapDomainStrategy.USER; params: number[] | string[] }
  /** Domain inferred from the minimum and maximum numeric values. */
  | { type: ColorMapDomainStrategy.MIN_MAX }
  /** Domain inferred from lower and upper numeric percentiles in the 0-100 range. */
  | { type: ColorMapDomainStrategy.PERCENTILE; params?: [number, number] };

/**
 * Color map interpolators for thematic data visualization.
 */
export enum ColorMapInterpolator {
  CAT_ACCENT = 'schemeAccent',
  CAT_DARK2 = 'schemeDark2',
  CAT_CATEGORY10 = 'schemeCategory10',
  CAT_OBSERVABLE10 = 'schemeObservable10',
  CAT_PAIRED = 'schemePaired',
  CAT_PASTEL1 = 'schemePastel1',
  CAT_PASTEL2 = 'schemePastel2',
  CAT_SET1 = 'schemeSet1',
  CAT_SET2 = 'schemeSet2',
  CAT_SET3 = 'schemeSet3',
  CAT_TABLEAU10 = 'schemeTableau10',
  SEQ_REDS = 'interpolateReds',
  SEQ_BLUES = 'interpolateBlues',
  SEQ_GREENS = 'interpolateGreens',
  SEQ_GREYS = 'interpolateGreys',
  SEQ_ORANGES = 'interpolateOranges',
  SEQ_PURPLES = 'interpolatePurples',
  SEQ_TURBO = 'interpolateTurbo',
  SEQ_VIRIDIS = 'interpolateViridis',
  SEQ_INFERNO = 'interpolateInferno',
  SEQ_MAGMA = 'interpolateMagma',
  SEQ_PLASMA = 'interpolatePlasma',
  SEQ_CIVIDIS = 'interpolateCividis',
  SEQ_WARM = 'interpolateWarm',
  SEQ_COOL = 'interpolateCool',
  SEQ_CUBEHELIX_DEFAULT = 'interpolateCubehelixDefault',
  SEQ_BU_GN = 'interpolateBuGn',
  SEQ_BU_PU = 'interpolateBuPu',
  SEQ_GN_BU = 'interpolateGnBu',
  SEQ_OR_RD = 'interpolateOrRd',
  SEQ_PU_BU_GN = 'interpolatePuBuGn',
  SEQ_PU_BU = 'interpolatePuBu',
  SEQ_PU_RD = 'interpolatePuRd',
  SEQ_RD_PU = 'interpolateRdPu',
  SEQ_YL_GN_BU = 'interpolateYlGnBu',
  SEQ_YL_GN = 'interpolateYlGn',
  SEQ_YL_OR_BR = 'interpolateYlOrBr',
  SEQ_YL_OR_RD = 'interpolateYlOrRd',
  DIV_BR_BG = 'interpolateBrBG',
  DIV_PR_GN = 'interpolatePRGn',
  DIV_PI_YG = 'interpolatePiYG',
  DIV_PU_OR = 'interpolatePuOr',
  DIV_RED_BLUE = 'interpolateRdBu',
  DIV_RED_GREY = 'interpolateRdGy',
  DIV_RED_YELLOW_BLUE = 'interpolateRdYlBu',
  DIV_RED_YELLOW_GREEN = 'interpolateRdYlGn',
  DIV_SPECTRAL = 'interpolateSpectral',
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
export type ColorRGB = {
  /** Red channel value. */
  r: number;
  /** Green channel value. */
  g: number;
  /** Blue channel value. */
  b: number;
  /** Alpha channel value, typically normalized to the 0-1 range. */
  alpha: number;
};

/**
 * Represents a texture of colors as a flat array of numbers.
 */
export type ColorTEX = number[];
