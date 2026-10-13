/**
 * @module DataUtils
 * Data-access and scalar-validation helpers for loosely typed values.
 *
 * This module provides small utilities for reading nested properties from
 * unknown record-like values and for checking whether inputs can participate
 * in finite numeric processing.
 */

/**
 * Resolves a dot-delimited property path, including literal dotted leaf keys.
 *
 * Fully traversable nested paths take precedence. If traversal fails, an own key
 * may match the remaining suffix, such as `shadows.jun` in spatial-join output.
 *
 * @param item - Source value to traverse.
 * @param path - Dot-delimited property path, for example `properties.area`.
 * @returns The resolved nested value, or `undefined` when the path cannot be
 * fully resolved.
 * @throws Never throws.
 * @example
 * valueAtPath({ a: { b: 42 } }, 'a.b');  // 42
 * valueAtPath({ a: null }, 'a.b');       // undefined
 * valueAtPath({ sjoin: { avg: { 'shadows.jun': 12 } } }, 'sjoin.avg.shadows.jun'); // 12
 */
export function valueAtPath(item: unknown, path: string): unknown {
    const keys = path.split('.');
    let value = item;
    let resolved = true;
    for (const key of keys) {
        if (value == null || typeof value !== 'object' || !(key in value)) {
            resolved = false;
            break;
        }
        value = (value as Record<string, unknown>)[key];
    }
    if (resolved) return value;

    value = item;
    for (let i = 0; i < keys.length; i++) {
        if (value == null || typeof value !== 'object') return undefined;
        const record = value as Record<string, unknown>;
        const suffix = keys.slice(i).join('.');
        if (Object.prototype.hasOwnProperty.call(record, suffix)) return record[suffix];
        value = record[keys[i]];
    }
    return value;
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
