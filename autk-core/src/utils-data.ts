/**
 * @module DataUtils
 * Provides utility functions for common data access and validation tasks.
 */

/**
 * Resolves a dot-path from an unknown object.
 */
export function valueAtPath(item: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
    }, item);
}

/**
 * Returns true when the value can be treated as a finite numeric scalar.
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
