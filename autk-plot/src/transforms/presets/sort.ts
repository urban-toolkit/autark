/**
 * Sort transform preset.
 *
 * Reorders the rows by a single column (ascending or descending) without aggregating them,
 * keeping the source features (`autkIds`) of every row.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { SortTransformConfig } from '../../api';
import type { TransformDefinition } from '../registry';
import type { TransformProvenance } from '../../types-provenance';

import { rowwiseProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/** Result produced by `runSort`. */
export type ExecutedSortTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'sort';
    /** Sorted rows preserving their original `autkIds` provenance. */
    rows: AutkDatum[];
    /** Provenance `D0 features → D1 rows` (one-to-one), aligned with `rows`. */
    provenance: TransformProvenance;
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a sort transform and returns plot-ready rows.
 *
 * @param rows Input feature rows.
 * @param options Transform options (`transform.options`): column and direction.
 * @param columns `columns[0]` is the sort column when none is configured.
 * @returns Rows of the `sort` shape and their provenance.
 */
export function runSort(rows: AutkDatum[], options: NonNullable<SortTransformConfig['options']>, columns: string[]): Omit<ExecutedSortTransform, 'preset'> {
    const column = options.column ?? columns[0] ?? '';
    const direction = options.direction ?? 'asc';

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
        rows: sorted,
        provenance: rowwiseProvenance(sorted),
    };
}

// ---- Definition ---------------------------------------------------------

/** The rows themselves, sorted by one column: one row per feature. */
export const sort: TransformDefinition = {
    name: 'sort',
    label: 'Sorted rows',
    shape: 'sort',
    run: runSort,
};
