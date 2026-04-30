/**
 * @module DataUtils
 * Data-access and scalar-validation helpers for loosely typed values.
 *
 * This module provides small utilities for reading nested properties from
 * unknown record-like values and for checking whether inputs can participate
 * in finite numeric processing.
 */

/**
 * Resolves a dot-delimited property path from an unknown value.
 *
 * @param item - Source value to traverse.
 * @param path - Dot-delimited property path, for example `properties.area`.
 * @returns The resolved nested value, or `undefined` when the path cannot be
 * fully resolved.
 * @throws Never throws.
 * @example
 * valueAtPath({ a: { b: 42 } }, 'a.b');  // 42
 * valueAtPath({ a: null }, 'a.b');       // undefined
 */
export function valueAtPath(item: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
    }, item);
}

/**
 * Returns `true` when the value can be treated as a finite numeric scalar.
 *
 * @param value - Value to test for numeric scalar compatibility.
 * @returns `true` when the value is a finite number or numeric string.
 * @throws Never throws.
 * @example
 * isNumericLike(42);       // true
 * isNumericLike('3.14');   // true
 * isNumericLike('');       // false
 * isNumericLike(NaN);      // false
 */
export function isNumericLike(value: unknown): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed !== '' && Number.isFinite(Number(trimmed));
    }
    return false;
}
