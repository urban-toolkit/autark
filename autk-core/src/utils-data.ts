/**
 * @module DataUtils
 * Generic data-access and scalar-validation helpers shared across the toolkit.
 *
 * These utilities operate on unknown records and loosely typed values, making
 * them useful when reading attribute paths from row-like objects or inferring
 * whether values can participate in numeric processing.
 */

/**
 * Resolves a dot-path from an unknown object.
 *
 * Each path segment is treated as a property lookup on the current object.
 * If any intermediate value is `null`, `undefined`, or not object-like, the
 * resolution stops and `undefined` is returned.
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
 * Numeric strings are accepted after trimming surrounding whitespace. Empty
 * strings, non-finite numbers, and non-scalar values return `false`.
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
