/**
 * @module AutkMapMath
 * Small numeric helpers shared by renderers and pipelines.
 */

/**
 * Computes the next power-of-two value greater than or equal to `value`.
 *
 * @param value Positive input value.
 * @returns Power-of-two integer greater than or equal to `value`.
 * @throws Never throws.
 * @example
 * nextPowerOfTwo(300); // 512
 */
export function nextPowerOfTwo(value: number): number {
    return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

/**
 * Limits a value to a range.
 *
 * @param value Value to limit.
 * @param min Lower bound.
 * @param max Upper bound, not below `min`.
 * @returns `value`, or the nearest bound when it lies outside.
 * @throws Never throws.
 * @example
 * clamp(1.4, 0, 1); // 1
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Bilinear interpolation between four corner values.
 *
 * `a` and `b` are the corners at `v = 0` (`u = 0` and `u = 1`), `c` and `d` those at `v = 1`.
 *
 * @param a Value at `(0, 0)`.
 * @param b Value at `(1, 0)`.
 * @param c Value at `(0, 1)`.
 * @param d Value at `(1, 1)`.
 * @param u Weight along the first axis, `0` to `1`.
 * @param v Weight along the second axis, `0` to `1`.
 * @returns The interpolated value.
 * @throws Never throws.
 * @example
 * bilerp(0, 10, 20, 30, 0.5, 0.5); // 15
 */
export function bilerp(a: number, b: number, c: number, d: number, u: number, v: number): number {
    const bottom = a * (1 - u) + b * u;
    const top = c * (1 - u) + d * u;
    return bottom * (1 - v) + top * v;
}
