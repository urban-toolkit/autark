/**
 * Feature filter applied before the configured transform.
 *
 * Features that fail any condition are excluded from the rendered rows and
 * have no image in the provenance graph (`1:0`).
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { FilterCondition } from '../api';
import type { AutkDatum } from '../types-plot';

/**
 * Tests whether a row satisfies every condition.
 *
 * Ordering operators compare finite numbers and fail otherwise; equality and
 * membership operators compare string forms.
 *
 * @param row Source row to test.
 * @param conditions Conditions combined with AND.
 * @returns `true` when the row passes all conditions.
 */
export function matchesFilter(row: AutkDatum, conditions: FilterCondition[]): boolean {
    return conditions.every(({ attribute, op, value }) => {
        const raw = valueAtPath(row, attribute);
        if (op === 'in' || op === 'not-in') {
            const list = (Array.isArray(value) ? value : [value]).map(String);
            const found = raw !== null && raw !== undefined && list.includes(String(raw));
            return op === 'in' ? found : !found;
        }
        if (op === '==') return String(raw) === String(value);
        if (op === '!=') return String(raw) !== String(value);

        const left = Number(raw);
        const right = Number(value);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
        if (op === '>') return left > right;
        if (op === '>=') return left >= right;
        if (op === '<') return left < right;
        return left <= right;
    });
}

/**
 * Describes conditions for provenance notes, e.g. `shape_area > 10000000`.
 *
 * @param conditions Conditions combined with AND.
 * @returns Human-readable description.
 */
export function describeFilter(conditions: FilterCondition[]): string {
    return conditions
        .map(({ attribute, op, value }) => `${attribute} ${op} ${Array.isArray(value) ? `[${value.join(', ')}]` : value}`)
        .join(' and ');
}
