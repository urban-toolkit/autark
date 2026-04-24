/**
 * Sort transform preset.
 *
 * Reorders input rows by a single column (ascending or descending) without
 * aggregating them. Source feature provenance (`autkIds`) is preserved on
 * every output row.
 */

import { valueAtPath } from '../../types-core';

import type { AutkDatum } from '../../types-chart';
import type { SortTransformConfig } from '../../api';

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runSort`.
 *
 * Contains the `sort` preset tag plus rows carrying their original `autkIds`
 * for downstream selection linking.
 */
export type ExecutedSortTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'sort';
    /** Sorted rows preserving their original `autkIds` provenance. */
    rows: AutkDatum[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a sort transform and returns chart-ready rows.
 *
 * Sorts the input rows by the specified column and direction (asc/desc).
 *
 * @param rows Input data rows.
 * @param config Sort transform configuration.
 * @param columns Ordered source columns used when no explicit sort column is configured.
 * @returns Executed sort transform result.
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
        rows: sorted,
    };
}
