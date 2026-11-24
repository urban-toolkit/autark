/**
 * Baseline equivalence: transform presets.
 *
 * Every preset used by the gallery gives the outputs recorded from the
 * original autk-plot 4.1.1 (baselines/transforms.json), including the
 * `autkIds` linking each row to source features. The additions are the
 * `provenance` field and, in binning-1d of a numeric column, a row for each
 * empty range (value 0, no `autkIds`), so a histogram axis does not skip it.
 * The labels of numeric bins read their true edges (as fixed upstream in
 * autark #134), where the original rounded them to whole numbers: they are
 * compared apart.
 */

import { describe, expect, test } from 'vitest';

import * as autkPlot from '../src';

import { TRANSFORM_CASES, reduceBucketsCase, sourceRows } from './baseline-cases';
import baseline from './baselines/transforms.json';

const recorded = baseline as unknown as Record<string, { rows: unknown[] }>;

/** The value as recorded: plain JSON, without undefined fields. */
const asRecorded = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** A label of a numeric bin: its two edges, such as `1.13M-4.83M` or `0.25-0.50`. */
const RANGE = /^(-?[\d.]+[kMGT]?)-(-?[\d.]+[kMGT]?)$/;
const numberOf = (text: string): number => Number.parseFloat(text) * ({ k: 1e3, M: 1e6, G: 1e9, T: 1e12 }[text.slice(-1)] ?? 1);

/** Rows without the labels of numeric bins, which are checked on their own. */
const withoutRangeLabels = (rows: { label?: unknown; x?: unknown; y?: unknown }[]) => rows.map(row => {
    const normalized = { ...row };
    for (const field of ['label', 'x', 'y'] as const) {
        const value = row[field];
        if (typeof value === 'string' && RANGE.test(value)) normalized[field] = 'range';
    }
    return normalized;
});

describe('autk-plot transforms match the original autk-plot 4.1.1', () => {
    test.each(TRANSFORM_CASES)('$name', ({ name, collection, config, columns }) => {
        const expected = recorded[name];
        const { provenance, ...actual } = autkPlot.run(sourceRows(collection()), config, columns);
        const rows = actual.rows as { autkIds?: unknown[]; value?: number }[];
        const empty = rows.filter(row => row.autkIds?.length === 0);

        expect(expected.rows.length).toBeGreaterThan(0);
        // The original rows, in the original order; the empty ranges are the only rows added.
        const kept = rows.filter(row => !empty.includes(row)) as { label?: unknown }[];
        expect(asRecorded({ ...actual, rows: withoutRangeLabels(kept) })).toStrictEqual(asRecorded({ ...expected, rows: withoutRangeLabels(expected.rows as { label?: unknown }[]) }));
        // Numeric bins: one label per bin, each its two edges, in ascending order, each bin starting where the last ends.
        const ranges = (rows as { label?: unknown }[]).map(row => (typeof row.label === 'string' ? RANGE.exec(row.label) : null)).filter(m => m !== null);
        expect(new Set(ranges.map(m => m[0])).size).toBe(ranges.length);
        ranges.forEach((m, i) => {
            expect(numberOf(m[1])).toBeLessThan(numberOf(m[2]));
            if (i > 0) expect(m[1]).toBe(ranges[i - 1][2]);
        });
        expect(empty.every(row => row.value === 0)).toBe(true);
        if (empty.length > 0) expect(config.preset).toBe('binning-1d');
        expect(provenance.rowIds).toHaveLength(rows.length);
    });

    test('reduceBuckets matches on the shared kernel contract', () => {
        expect(asRecorded(autkPlot.reduceBuckets(reduceBucketsCase()))).toStrictEqual(recorded.reduceBuckets);
    });
});
