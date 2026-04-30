/**
 * @module TransferFunction
 * Utilities for mapping scalar data values to opacity.
 *
 * This module defines the transfer-function configuration, resolved runtime
 * context, and alpha evaluation used by raster rendering. It resolves default
 * options once, precomputes dataset statistics, and converts scalar values into
 * 8-bit opacity values while treating `NaN` as transparent.
 */

/**
 * Configures how scalar values map to opacity.
 *
 * The active mode determines which values receive higher opacity after the
 * input values are normalized against the current transfer context.
 */
export interface TransferFunction {
    /**
     * Opacity mapping mode.
     *
     * - `near-zero`: values closer to `zeroCenter` are more opaque.
     * - `far-zero`: values farther from `zeroCenter` are more opaque.
     * - `linear`: opacity increases monotonically across the dataset range.
     */
    mode?: 'near-zero' | 'far-zero' | 'linear';
    /** Lower bound for output opacity in `[0, 1]`. */
    opacityMin?: number;
    /** Upper bound for output opacity in `[0, 1]`. */
    opacityMax?: number;
    /** Curve shaping factor; values `<= 0` are clamped to a tiny positive exponent at evaluation time. */
    gamma?: number;
    /** Reference center used by zero-distance modes (default `0`). */
    zeroCenter?: number;
}

/**
 * Transfer-function configuration with all optional fields resolved.
 *
 * This is the shape used by `buildTransferContext` and `computeAlphaByte`
 * after user overrides have been merged with the defaults.
 */
export type RequiredTransferFunction = Required<TransferFunction>;

/**
 * Default transfer-function configuration merged into user options before
 * evaluation.
 */
export const DEFAULT_TRANSFER_FUNCTION: RequiredTransferFunction = {
    mode: 'far-zero',
    opacityMin: 0,
    opacityMax: 1,
    gamma: 1,
    zeroCenter: 0,
};

/**
 * Precomputed transfer-function context for efficient per-value alpha mapping.
 */
export interface TransferContext {
    /** Minimum scalar value found among valid source values. */
    min: number;
    /** Maximum scalar value found among valid source values. */
    max: number;
    /** Difference between `max` and `min`. */
    range: number;
    /** Maximum absolute distance from `config.zeroCenter`. */
    maxAbsDistance: number;
    /** Number of valid scalar values used to build the context. */
    validCount: number;
    /** Fully resolved transfer-function configuration used during evaluation. */
    config: RequiredTransferFunction;
}

/**
 * Builds a transfer-function context from valid scalar values.
 *
 * The returned context caches dataset bounds and the resolved configuration so
 * repeated alpha evaluation does not need to recompute them. When `values` is
 * empty, the context is zeroed and `validCount` is `0`; callers can still use it
 * for evaluation, but the output will fall back to the configured opacity range
 * for the selected mode.
 *
 * @param values - Valid scalar values used to derive dataset statistics.
 * @param config - Optional transfer-function overrides applied on top of defaults.
 * @returns Precomputed transfer-function context for repeated alpha evaluation.
 * @throws Never throws. Empty input produces a zeroed context.
 * @example
 * const ctx = buildTransferContext([0.1, 0.5, 0.3, 0.9], { mode: 'linear' });
 * // ctx.min → 0.1, ctx.max → 0.9, ctx.config.mode → 'linear'
 */
export function buildTransferContext(
    values: number[],
    config?: TransferFunction,
): TransferContext {
    const resolvedConfig: RequiredTransferFunction = {
        ...DEFAULT_TRANSFER_FUNCTION,
        ...config,
    };

    if (values.length === 0) {
        return {
            min: 0,
            max: 0,
            range: 0,
            maxAbsDistance: 0,
            validCount: 0,
            config: resolvedConfig,
        };
    }

    const min = values.reduce((a, b) => Math.min(a, b), Infinity);
    const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
    const range = max - min;
    const maxAbsDistance = values.reduce(
        (acc, v) => Math.max(acc, Math.abs(v - resolvedConfig.zeroCenter)),
        0,
    );

    return {
        min,
        max,
        range,
        maxAbsDistance,
        validCount: values.length,
        config: resolvedConfig,
    };
}

/**
 * Computes alpha as an 8-bit channel value for a scalar value.
 *
 * `NaN` values are always mapped to `0` (transparent). The mapping uses the
 * precomputed context bounds and the resolved transfer-function configuration,
 * applies gamma shaping when `config.gamma` differs from `1`, and clamps the
 * result to the byte range `[0, 255]`.
 *
 * @param value - Scalar value to map into an alpha byte.
 * @param context - Precomputed transfer-function context from `buildTransferContext`.
 * @returns Alpha channel value in the integer range `[0, 255]`.
 * @throws Never throws. Returns `0` for `NaN` input.
 * @example
 * const ctx = buildTransferContext([0, 100], { mode: 'linear' });
 * computeAlphaByte(50, ctx);  // → 128 (midpoint)
 * computeAlphaByte(NaN, ctx); // → 0   (transparent)
 */
export function computeAlphaByte(value: number, context: TransferContext): number {
    if (isNaN(value)) {
        return 0;
    }

    const { config, range, min, maxAbsDistance } = context;

    let t: number;
    if (config.mode === 'linear') {
        t = range > 0 ? (value - min) / range : 0;
    }
    else if (config.mode === 'far-zero') {
        t = maxAbsDistance > 0 ? Math.abs(value - config.zeroCenter) / maxAbsDistance : 0;
    }
    else {
        // near-zero: higher opacity for values closer to zeroCenter.
        t = maxAbsDistance > 0 ? 1 - (Math.abs(value - config.zeroCenter) / maxAbsDistance) : 1;
    }

    const clampedT = Math.max(0, Math.min(1, t));
    const shaped = Math.pow(clampedT, Math.max(0.0001, config.gamma));
    const opacity = config.opacityMin + (config.opacityMax - config.opacityMin) * shaped;
    return Math.max(0, Math.min(255, Math.round(opacity * 255)));
}
