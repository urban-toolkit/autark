/**
 * @module AutkCoreMath
 * General-purpose numeric helpers shared across Autark packages.
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
