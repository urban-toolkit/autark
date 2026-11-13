/**
 * Hierarchy transform preset.
 *
 * Groups rows by an ordered list of categorical columns, from the top level down (e.g. group →
 * category). Each level partitions the level below, so a row falls in exactly one node per level
 * and every node reduces the rows under it. Read by the stacked bar chart, treemap, and sunburst.
 */

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { HierarchyTransformConfig } from '../../api';
import type { TransformDefinition } from '../registry';
import type { TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import type { Row } from '../kernel';
import { hierarchyProvenance } from '../provenance';

// ---- Executed transform -------------------------------------------------

/** Result produced by `runHierarchy`. */
export type ExecutedHierarchyTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'hierarchy';
    /** Nodes of every level, top level first. */
    rows: HierarchyNodeRow[];
    /** Number of levels. */
    depth: number;
    /** Provenance `D0 features → D1 leaves → … → Dn top level`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A node of the hierarchy: one category at one level, under its parent. */
export type HierarchyNodeRow = {
    /** Node key, `JSON.stringify(path)`. */
    key: string;
    /** Level, `0` for the top level. */
    level: number;
    /** Categories from the top level down to this node. */
    path: string[];
    /** Category of this node, the last element of `path`. */
    label: string;
    /** Key of the parent node, or `null` at the top level. */
    parent: string | null;
    /** Reduced numeric result over the rows under the node. */
    value: number;
    /** How many rows are under the node. */
    count: number;
    /** Merged source feature ids under the node, used for selection linking. */
    autkIds: number[];
};

/** Unit row reduced into the nodes of one level. */
type HierarchyUnit = Row & { autkIds: number[]; __key: string; __value: number | null };

// ---- Runner -------------------------------------------------------------

/**
 * Runs a hierarchy transform and returns the nodes of every level.
 *
 * @param rows Input feature rows.
 * @param options Transform options (`transform.options`) with reducer and optional value column.
 * @param columns Categorical columns, top level first.
 * @returns Rows of the `hierarchy` shape and their provenance, with the depth.
 * @throws If no column is given.
 */
export function runHierarchy(rows: AutkDatum[], options: NonNullable<HierarchyTransformConfig['options']>, columns: string[]): Omit<ExecutedHierarchyTransform, 'preset'> {
    if (columns.length === 0) {
        throw new Error('hierarchy: at least one column is required.');
    }
    const reducer = options.reducer ?? 'count';
    const valueAttr = options.value ?? '';
    const depth = columns.length;

    const levelUnits: HierarchyUnit[][] = columns.map(() => []);
    rows.forEach((row, rowIndex) => {
        const ids = Array.isArray(row?.autkIds) && row.autkIds.length > 0 ? row.autkIds : [rowIndex];
        const raw = reducer === 'count' ? 1 : Number(valueAtPath(row, valueAttr));
        const value = Number.isFinite(raw) ? raw : null;
        const path = columns.map(column => String(valueAtPath(row, column) ?? ''));
        path.forEach((_label, level) => {
            levelUnits[level].push({ autkIds: ids, __key: JSON.stringify(path.slice(0, level + 1)), __value: value });
        });
    });

    const levelBuckets = levelUnits.map(units => collectBuckets({
        rows: units,
        bucketOf: (unit) => String(unit.__key),
        valueOf: reducer === 'count' ? undefined : (unit) => (unit as HierarchyUnit).__value,
        reducer,
    }));

    const parentOf = (key: string) => {
        const path = JSON.parse(key) as string[];
        return path.length > 1 ? JSON.stringify(path.slice(0, -1)) : null;
    };
    const nodeRows: HierarchyNodeRow[] = levelBuckets
        .flatMap((buckets, level) => buckets.map(bucket => {
            const path = JSON.parse(bucket.key) as string[];
            return {
                key: bucket.key,
                level,
                path,
                label: path[path.length - 1],
                parent: parentOf(bucket.key),
                value: bucket.value,
                count: bucket.count,
                autkIds: bucket.autkIds,
            };
        }))
        .sort((a, b) => a.level - b.level || comparePaths(a.path, b.path));

    const nodeId = (key: string) => `node:${key}`;

    return {
        rows: nodeRows,
        depth,
        provenance: hierarchyProvenance({
            levelUnits,
            levelBuckets,
            levelLabels: columns,
            nodeId,
            parentOf,
            rowIds: nodeRows.map(row => nodeId(row.key)),
            reducer,
        }),
    };
}

/** Orders paths category by category. */
function comparePaths(a: string[], b: string[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const order = a[i].localeCompare(b[i]);
        if (order !== 0) return order;
    }
    return a.length - b.length;
}

// ---- Definition ---------------------------------------------------------

/** Rows grouped by categorical columns, from the top level down: one row per node. */
export const hierarchy: TransformDefinition = {
    name: 'hierarchy',
    label: 'Hierarchy of columns',
    shape: 'hierarchy',
    run: runHierarchy,
};
