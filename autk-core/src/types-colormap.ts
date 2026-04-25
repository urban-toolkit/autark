/**
 * @module ColorMapTypes
 * Shared enums and types for color mapping, legend generation, and color-buffer
 * exchange across the toolkit.
 *
 * This module defines the contracts used by the shared color-mapping API in
 * `autk-core` and `autk-map`. It describes how a domain is requested and
 * resolved, which d3-backed interpolators can be selected, and how colors are
 * represented when exchanged as hex strings, RGBA objects, or flat texture
 * buffers.
 */

/**
 * Strategies for deriving a colormap domain.
 *
 * The selected strategy determines whether the domain is supplied directly,
 * computed from numeric min/max values, or computed from numeric percentiles.
 */
export enum ColorMapDomainStrategy {
  /** Use the caller-provided domain verbatim. */
  USER = 'user',
  /** Derive the domain from the observed minimum and maximum values. */
  MIN_MAX = 'minMax',
  /** Derive the domain from lower and upper percentiles. */
  PERCENTILE = 'percentile',
}

/**
 * Domain resolved from input data and a colormap configuration.
 *
 * Numeric domains are returned for continuous interpolators, while string
 * domains are returned for categorical schemes and legend labeling.
 */
export type ResolvedDomain = number[] | string[];

/**
 * Specification for how a colormap domain should be derived.
 *
 * `USER` supplies an explicit domain, `MIN_MAX` derives a numeric range from
 * the input values, and `PERCENTILE` derives a numeric range from percentile
 * bounds.
 */
export type ColorMapDomainSpec =
  /** Explicit domain supplied by the caller. */
  | { type: ColorMapDomainStrategy.USER; params: number[] | string[] }
  /** Domain inferred from the minimum and maximum numeric values. */
  | { type: ColorMapDomainStrategy.MIN_MAX }
  /** Domain inferred from lower and upper numeric percentiles in the 0-100 range. */
  | { type: ColorMapDomainStrategy.PERCENTILE; params?: [number, number] };

/**
 * Identifiers for the supported color schemes and interpolators.
 *
 * Values map to d3-scale-chromatic categorical, sequential, and diverging
 * schemes used by the shared color-mapping engine.
 */
export enum ColorMapInterpolator {
  /** Accent categorical scheme. */
  CAT_ACCENT = 'schemeAccent',
  /** Dark2 categorical scheme. */
  CAT_DARK2 = 'schemeDark2',
  /** Category10 categorical scheme. */
  CAT_CATEGORY10 = 'schemeCategory10',
  /** Observable10 categorical scheme. */
  CAT_OBSERVABLE10 = 'schemeObservable10',
  /** Paired categorical scheme. */
  CAT_PAIRED = 'schemePaired',
  /** Pastel1 categorical scheme. */
  CAT_PASTEL1 = 'schemePastel1',
  /** Pastel2 categorical scheme. */
  CAT_PASTEL2 = 'schemePastel2',
  /** Set1 categorical scheme. */
  CAT_SET1 = 'schemeSet1',
  /** Set2 categorical scheme. */
  CAT_SET2 = 'schemeSet2',
  /** Set3 categorical scheme. */
  CAT_SET3 = 'schemeSet3',
  /** Tableau10 categorical scheme. */
  CAT_TABLEAU10 = 'schemeTableau10',
  /** Reds sequential scheme. */
  SEQ_REDS = 'interpolateReds',
  /** Blues sequential scheme. */
  SEQ_BLUES = 'interpolateBlues',
  /** Greens sequential scheme. */
  SEQ_GREENS = 'interpolateGreens',
  /** Greys sequential scheme. */
  SEQ_GREYS = 'interpolateGreys',
  /** Oranges sequential scheme. */
  SEQ_ORANGES = 'interpolateOranges',
  /** Purples sequential scheme. */
  SEQ_PURPLES = 'interpolatePurples',
  /** Turbo sequential scheme. */
  SEQ_TURBO = 'interpolateTurbo',
  /** Viridis sequential scheme. */
  SEQ_VIRIDIS = 'interpolateViridis',
  /** Inferno sequential scheme. */
  SEQ_INFERNO = 'interpolateInferno',
  /** Magma sequential scheme. */
  SEQ_MAGMA = 'interpolateMagma',
  /** Plasma sequential scheme. */
  SEQ_PLASMA = 'interpolatePlasma',
  /** Cividis sequential scheme. */
  SEQ_CIVIDIS = 'interpolateCividis',
  /** Warm sequential scheme. */
  SEQ_WARM = 'interpolateWarm',
  /** Cool sequential scheme. */
  SEQ_COOL = 'interpolateCool',
  /** Default cubehelix sequential scheme. */
  SEQ_CUBEHELIX_DEFAULT = 'interpolateCubehelixDefault',
  /** Blue-Green sequential scheme. */
  SEQ_BU_GN = 'interpolateBuGn',
  /** Blue-Purple sequential scheme. */
  SEQ_BU_PU = 'interpolateBuPu',
  /** Green-Blue sequential scheme. */
  SEQ_GN_BU = 'interpolateGnBu',
  /** Orange-Red sequential scheme. */
  SEQ_OR_RD = 'interpolateOrRd',
  /** Purple-Blue-Green sequential scheme. */
  SEQ_PU_BU_GN = 'interpolatePuBuGn',
  /** Purple-Blue sequential scheme. */
  SEQ_PU_BU = 'interpolatePuBu',
  /** Purple-Red sequential scheme. */
  SEQ_PU_RD = 'interpolatePuRd',
  /** Red-Purple sequential scheme. */
  SEQ_RD_PU = 'interpolateRdPu',
  /** Yellow-Green-Blue sequential scheme. */
  SEQ_YL_GN_BU = 'interpolateYlGnBu',
  /** Yellow-Green sequential scheme. */
  SEQ_YL_GN = 'interpolateYlGn',
  /** Yellow-Orange-Brown sequential scheme. */
  SEQ_YL_OR_BR = 'interpolateYlOrBr',
  /** Yellow-Orange-Red sequential scheme. */
  SEQ_YL_OR_RD = 'interpolateYlOrRd',
  /** Brown-Blue-Green diverging scheme. */
  DIV_BR_BG = 'interpolateBrBG',
  /** Purple-Green diverging scheme. */
  DIV_PR_GN = 'interpolatePRGn',
  /** Pink-Yellow-Green diverging scheme. */
  DIV_PI_YG = 'interpolatePiYG',
  /** Purple-Orange diverging scheme. */
  DIV_PU_OR = 'interpolatePuOr',
  /** Red-Blue diverging scheme. */
  DIV_RED_BLUE = 'interpolateRdBu',
  /** Red-Grey diverging scheme. */
  DIV_RED_GREY = 'interpolateRdGy',
  /** Red-Yellow-Blue diverging scheme. */
  DIV_RED_YELLOW_BLUE = 'interpolateRdYlBu',
  /** Red-Yellow-Green diverging scheme. */
  DIV_RED_YELLOW_GREEN = 'interpolateRdYlGn',
  /** Spectral diverging scheme. */
  DIV_SPECTRAL = 'interpolateSpectral',
}

/**
 * Unified color-map configuration used by map rendering and legend generation.
 *
 * This config couples the selected interpolator with the domain strategy so
 * both `autk-core` and `autk-map` resolve and display the same scale.
 */
export type ColorMapConfig = {
  /** Selected interpolator or color scheme. */
  interpolator: ColorMapInterpolator;
  /** Strategy used to derive the domain passed to the interpolator. */
  domainSpec: ColorMapDomainSpec;
};

/**
 * Hexadecimal color string used by styling APIs.
 */
export type ColorHEX = `#${string}`;

/**
 * RGBA color representation used by sampling and map styling APIs.
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
 * Flat RGBA texture buffer laid out as `[r, g, b, a, ...]`.
 */
export type ColorTEX = number[];
