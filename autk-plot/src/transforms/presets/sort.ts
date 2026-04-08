/**
 * Sort transform preset.
 *
 * Reorders input rows by a single column (ascending or descending) without
 * aggregating them. Source feature provenance (`autkIds`) is preserved on
 * every output row.
 */

import { valueAtPath } from '../../core-types';
import type { AutkDatum, SortTransformConfig } from '../../api';

// ---- Executed transform -------------------------------------------------

/**
 * A single sorted row preserving source feature provenance.
 */
export type SortedRow = {
    [key: string]: unknown;
    autkIds: number[];
};

/**
 * Result produced by `runSort`.
 *
 * `attributes` contains the single sort column name. Rows carry their original
 * `autkIds` for downstream selection linking.
 */
export type ExecutedSortTransform = {
    preset: 'sort';
    rows: SortedRow[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a sort transform and returns chart-ready rows.
 *
 * Sorts the input rows by the specified column and direction (asc/desc).
 *
 * @param rows Input data rows (AutkDatum[])
 * @param config Sort transform configuration
 * @returns Executed sort transform result
 */
export function runSort(rows: AutkDatum[], config: SortTransformConfig, columns: string[]): ExecutedSortTransform {
    const column = config.options?.column ?? columns[0] ?? '';
    const direction = config.options?.direction ?? 'asc';

    const sorted = [...rows].sort((a, b) => {
        const av = a ? valueAtPath(a, column) : null;
        const bv = b ? valueAtPath(b, column) : null;
        if (av == null) return 1;
        if (bv == null) return -1;
        const an = Number(av);
        const bn = Number(bv);
        if (!isNaN(an) && !isNaN(bn)) {
            return direction === 'asc' ? an - bn : bn - an;
        }
        return direction === 'asc'
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
    });

    return {
        preset: 'sort',
        rows: sorted as SortedRow[],
    };
}
