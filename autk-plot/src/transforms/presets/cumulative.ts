/**
 * Cumulative transform preset.
 *
 * Partitions rows by one column into ordered bars and accumulates them: point
 * `k` reduces the rows of bars `0…k`. Numeric columns give an empirical
 * cumulative distribution (bars ordered by value); categorical columns ordered
 * by reduced value, largest first, give a Pareto chart.
 *
 * Only additive reducers apply: a point is the sum of the bars before it.
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { AutkDatum } from '../../types-plot';
import type { CumulativeTransformConfig } from '../../api';
import type { TransformProvenance } from '../../types-provenance';

import { collectBuckets } from '../kernel';
import { cumulativeProvenance } from '../provenance';

/** Distinct numeric values kept as exact steps before falling back to bins. */
const MAX_EXACT_STEPS = 100;
/** Bins used for numeric columns with more distinct values than `MAX_EXACT_STEPS`. */
const DEFAULT_BINS = 50;

// ---- Executed transform -------------------------------------------------

/**
 * Result produced by `runCumulative`.
 */
export type ExecutedCumulativeTransform = {
    /** Preset discriminator identifying the executed transform. */
    preset: 'cumulative';
    /** Bars, then cumulative points, both in bar order. */
    rows: CumulativeRow[];
    /** Whether the column is numeric, so bars have numeric upper edges. */
    numeric: boolean;
    /** Sum of all bar values, the value of the last point. */
    total: number;
    /** Provenance `D0 features → D1 bars → D2 cumulative points`, aligned with `rows`. */
    provenance: TransformProvenance;
};

/** A bar (one value, bin, or category) or a cumulative point after it. */
export type CumulativeRow = {
    /** Row kind discriminator. */
    kind: 'bar' | 'point';
    /** Position in bar order. */
    index: number;
    /** Readable label: the category, value, or bin range of the bar. */
    label: string;
    /** Upper edge of the bar for numeric columns, `null` otherwise. */
    upper: number | null;
    /** Bar value, or accumulated value up to this bar for points. */
    value: number;
    /** `value` over the total of all bars, in `[0, 1]`. */
    share: number;
    /** Rows counted by the bar, or up to this bar for points. */
    count: number;
    /** Merged source feature ids, used for selection linking. */
    autkIds: number[];
};

// ---- Runner -------------------------------------------------------------

/**
 * Runs a cumulative transform and returns bars and cumulative points.
 *
 * @param rows Input feature rows.
 * @param config Transform configuration: additive reducer, value column, bins, and order.
 * @param columns `columns[0]` is the column to partition.
 * @returns Bars and points in bar order, with the grand total.
 * @throws If the reducer is not additive.
 */
export function runCumulative(rows: AutkDatum[], config: CumulativeTransformConfig, columns: string[]): ExecutedCumulativeTransform {
    const attr = columns[0] ?? '';
    const reducer = config.options?.reducer ?? 'count';
    if (reducer !== 'count' && reducer !== 'sum') {
        throw new Error('cumulative: only additive reducers (count or sum) can be accumulated.');
    }
    const valueAttr = config.options?.value;

    const raw = rows.map(row => valueAtPath(row, attr));
    const present = raw.filter(v => v !== null && v !== undefined && v !== '');
    const numeric = present.length > 0 && present.every(v => Number.isFinite(Number(v)));
    const order = config.options?.order ?? (numeric ? 'key' : 'value');

    // Bar key, label, and upper edge of each row.
    const format = d3.format('~s');
    let barOf: (value: unknown) => { key: string; label: string; upper: number | null } | null;
    if (numeric) {
        const values = present.map(Number);
        const distinct = new Set(values).size;
        const bins = config.options?.bins ?? (distinct <= MAX_EXACT_STEPS ? 0 : DEFAULT_BINS);
        const [lo, hi] = d3.extent(values) as [number, number];
        const width = (hi - lo) / Math.max(1, bins) || 1;
        barOf = (value) => {
            const v = Number(value);
            if (value === null || value === undefined || value === '' || !Number.isFinite(v)) return null;
            if (bins === 0) return { key: String(v), label: format(v), upper: v };
            const index = Math.min(bins - 1, Math.floor((v - lo) / width));
            const upper = lo + (index + 1) * width;
            return { key: String(index), label: `${format(lo + index * width)}-${format(upper)}`, upper };
        };
    } else {
        barOf = (value) => value === null || value === undefined ? null : { key: String(value), label: String(value), upper: null };
    }

    const info = new Map<string, { label: string; upper: number | null }>();
    const buckets = collectBuckets({
        rows,
        bucketOf: (row) => {
            const bar = barOf(valueAtPath(row, attr));
            if (!bar) return null;
            info.set(bar.key, bar);
            return bar.key;
        },
        valueOf: reducer === 'count' || !valueAttr ? undefined : (row) => {
            const v = Number(valueAtPath(row, valueAttr));
            return Number.isFinite(v) ? v : null;
        },
        reducer,
    });

    buckets.sort((a, b) => {
        if (order === 'value') return b.value - a.value || info.get(a.key)!.label.localeCompare(info.get(b.key)!.label);
        const ua = info.get(a.key)!.upper;
        const ub = info.get(b.key)!.upper;
        return ua !== null && ub !== null ? ua - ub : info.get(a.key)!.label.localeCompare(info.get(b.key)!.label);
    });

    const total = d3.sum(buckets, b => b.value);
    const shareOf = (value: number) => total > 0 ? value / total : 0;
    const bars: CumulativeRow[] = buckets.map((bucket, index) => ({
        kind: 'bar',
        index,
        label: info.get(bucket.key)!.label,
        upper: info.get(bucket.key)!.upper,
        value: bucket.value,
        share: shareOf(bucket.value),
        count: bucket.count,
        autkIds: bucket.autkIds,
    }));

    let running = 0;
    let runningCount = 0;
    const seen = new Set<number>();
    const points: CumulativeRow[] = bars.map(bar => {
        running += bar.value;
        runningCount += bar.count;
        bar.autkIds.forEach(id => seen.add(id));
        return { ...bar, kind: 'point', value: running, share: shareOf(running), count: runningCount, autkIds: Array.from(seen) };
    });

    const outputRows = [...bars, ...points];
    return {
        preset: 'cumulative',
        rows: outputRows,
        numeric,
        total,
        provenance: cumulativeProvenance({
            units: rows,
            bars: buckets,
            rowIds: outputRows.map(row => `${row.kind}:${row.index}`),
            reducer,
        }),
    };
}
