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
 * Each segment is read as a property key on the current value. Traversal stops
 * as soon as an intermediate value is `null`, `undefined`, or not object-like,
 * and `undefined` is returned.
 *
 * @param item - Source value to traverse.
 * @param path - Dot-delimited property path, for example `properties.area`.
 * @returns The resolved nested value, or `undefined` when the path cannot be
 * fully resolved.
 */
export function valueAtPath(item: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
    }, item);
}

/**
 * Returns true when the value can be treated as a finite numeric scalar.
 *
 * Numbers are accepted only when finite. String inputs are trimmed before
 * conversion; empty strings and non-finite results are rejected.
 *
 * @param value - Value to test for numeric scalar compatibility.
 * @returns `true` when the value is a finite number or a string that can be
 * converted to one, otherwise `false`.
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
