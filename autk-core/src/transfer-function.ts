/**
 * @module TransferFunction
 * Defines how scalar data values are mapped to opacity. This is crucial for visualizing
 * raster data where color is handled by a colormap texture and opacity is controlled
 * separately to highlight specific data ranges.
 */

/**
 * Configures how scalar values map to opacity.
 */
export interface TransferFunction {
    /**
     * Opacity mapping mode:
     * - `near-zero`: higher opacity close to `zeroCenter`
     * - `far-zero`: higher opacity farther from `zeroCenter`
     * - `linear`: higher opacity toward the numeric max value
     */
    mode?: 'near-zero' | 'far-zero' | 'linear';
    /** Lower bound for output opacity in `[0, 1]`. */
    opacityMin?: number;
    /** Upper bound for output opacity in `[0, 1]`. */
    opacityMax?: number;
    /** Curve shaping factor (`1` linear, `>1` emphasizes high values). */
    gamma?: number;
    /** Reference center used by zero-distance modes (default `0`). */
    zeroCenter?: number;
}

/**
 * Transfer-function configuration with all optional fields resolved to defaults.
 */
export type RequiredTransferFunction = Required<TransferFunction>;

/**
 * Default transfer-function configuration used when options are omitted.
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
    /** Minimum scalar value found in the source dataset. */
    min: number;
    /** Maximum scalar value found in the source dataset. */
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
 * Builds a transfer-function context from valid values.
 *
 * @param values - Valid scalar values used to derive dataset statistics.
 * @param config - Optional transfer-function overrides applied on top of defaults.
 * @returns Precomputed transfer-function context for repeated alpha evaluation.
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
 * `NaN` values are always transparent.
 *
 * @param value - Scalar value to map into an alpha byte.
 * @param context - Precomputed transfer-function context.
 * @returns Alpha channel value in the integer range `[0, 255]`.
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
