/**
 * Baseline equivalence: transform presets.
 *
 * Every preset used by the gallery gives the outputs recorded from the
 * original autk-plot 4.1.1 (baselines/transforms.json), including the
 * `autkIds` linking each row to source features. The only addition is the
 * `provenance` field.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';

import { TRANSFORM_CASES, reduceBucketsCase, sourceRows } from './baseline-cases';
import baseline from './baselines/transforms.json';

const recorded = baseline as unknown as Record<string, { rows: unknown[] }>;

/** The value as recorded: plain JSON, without undefined fields. */
const asRecorded = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('autk-plot transforms match the original autk-plot 4.1.1', () => {
    test.each(TRANSFORM_CASES)('$name', ({ name, collection, config, columns }) => {
        const expected = recorded[name];
        const { provenance, ...actual } = next.run(sourceRows(collection()), config, columns);

        expect(expected.rows.length).toBeGreaterThan(0);
        expect(asRecorded(actual)).toStrictEqual(expected);
        expect(provenance.rowIds).toHaveLength(expected.rows.length);
    });

    test('reduceBuckets matches on the shared kernel contract', () => {
        expect(asRecorded(next.reduceBuckets(reduceBucketsCase()))).toStrictEqual(recorded.reduceBuckets);
    });
});
