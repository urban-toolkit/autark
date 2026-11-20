import { describe, expect, it } from 'vitest';

import { run } from '../src/transforms';
import type { Binning1dBinRow, Binning2dCellRow } from '../src/transforms';

/** One row per value, each its own feature. */
function rowsOf(values: number[]) {
    return values.map((v, i) => ({ v, kind: 'a', autkIds: [i] }));
}

/** The label and count of each bar a 1D binning of `values` gives, in order. */
function bars(values: number[], bins?: number): [string, number][] {
    const result = run(rowsOf(values), { preset: 'binning-1d', options: { bins } }, ['v']);
    return (result.rows as Binning1dBinRow[]).map((row) => [row.label, row.count]);
}

// Values at the centers of ten bins from 0 to 1, with 0 and 1 to set the range.
const zeroToOne = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1];

describe('1D binning labels', () => {
    it('labels three bins of 1, 2 and 3 by their edges', () => {
        expect(bars([1, 2, 3], 3)).toEqual([
            ['1.0-1.7', 1],
            ['1.7-2.3', 1],
            ['2.3-3.0', 1],
        ]);
    });

    it('keeps each of ten bins from 0 to 1 apart, labeled by its edges', () => {
        expect(bars(zeroToOne)).toEqual([
            ['0.0-0.10', 2],
            ['0.10-0.20', 1],
            ['0.20-0.30', 1],
            ['0.30-0.40', 1],
            ['0.40-0.50', 1],
            ['0.50-0.60', 1],
            ['0.60-0.70', 1],
            ['0.70-0.80', 1],
            ['0.80-0.90', 1],
            ['0.90-1.0', 2],
        ]);
    });

    it('labels a range from 0.4 to 10.4 by its edges, from 0.4 to 10.4', () => {
        const values = [0.4, 0.9, 1.9, 2.9, 3.9, 4.9, 5.9, 6.9, 7.9, 8.9, 9.9, 10.4];
        // Two digits would print the last edge, 10.4, as 10: more than a tenth of a bin away.
        expect(bars(values).map(([label]) => label)).toEqual([
            '0.400-1.40', '1.40-2.40', '2.40-3.40', '3.40-4.40', '4.40-5.40',
            '5.40-6.40', '6.40-7.40', '7.40-8.40', '8.40-9.40', '9.40-10.4',
        ]);
    });

    it('labels a column of one value by that value', () => {
        expect(bars([0.4, 0.4])).toEqual([['0.40', 2]]);
        expect(bars([5, 5, 5])).toEqual([['5.0', 3]]);
    });

    it('keeps the labels of ranges whose edges are whole', () => {
        // 0 to 780 in 13 bins of 60, and 0 to 5000 in 5 bins of 1000: the labels main gave.
        expect(bars([0, 30, 90, 150, 210, 270, 330, 390, 450, 510, 570, 630, 690, 750, 780], 13).map(([label]) => label)).toEqual([
            '0.0-60', '60-120', '120-180', '180-240', '240-300', '300-360', '360-420',
            '420-480', '480-540', '540-600', '600-660', '660-720', '720-780',
        ]);
        expect(bars([0, 500, 1500, 2500, 3500, 4500, 5000], 5).map(([label]) => label)).toEqual([
            '0.0-1.0k', '1.0k-2.0k', '2.0k-3.0k', '3.0k-4.0k', '4.0k-5.0k',
        ]);
    });
});

describe('Binning rows whose value holds no number', () => {
    // Values from 0 to 1 in four bins, as Curio's histogram of heights reads its building parts.
    const numbers = [0, 0.25, 0.5, 0.75, 1].map((v, i) => ({ v, kind: 'a', autkIds: [i] }));
    const ranges: [string, number][] = [['0.0-0.25', 1], ['0.25-0.50', 1], ['0.50-0.75', 1], ['0.75-1.0', 2]];

    /** `numbers` with a row that holds no number before them and one after, each made by `none`. */
    function withNone(none: (id: number) => Record<string, unknown>) {
        return [none(5), ...numbers, none(6)];
    }

    it.each<[string, (id: number) => Record<string, unknown>]>([
        ['no value', (id) => ({ kind: 'a', autkIds: [id] })],
        ['a null value', (id) => ({ v: null, kind: 'a', autkIds: [id] })],
        ['a NaN value', (id) => ({ v: NaN, kind: 'a', autkIds: [id] })],
    ])('puts the rows with %s in an unknown bin after every numeric bin, the bins in order', (_label, none) => {
        const rows = run(withNone(none), { preset: 'binning-1d', options: { bins: 4 } }, ['v']).rows as Binning1dBinRow[];

        expect(rows.map((row) => [row.label, row.count])).toEqual([...ranges, ['unknown', 2]]);
        expect(rows.slice(0, 4).map((row) => row.order)).toEqual([0, 1, 2, 3]);
        expect(rows[4].order).toBeGreaterThan(3);
    });

    it('makes no unknown bin where every value holds a number', () => {
        const rows = run(numbers, { preset: 'binning-1d', options: { bins: 4 } }, ['v']).rows as Binning1dBinRow[];

        expect(rows.map((row) => [row.label, row.count])).toEqual(ranges);
    });

    it('puts a heat matrix\'s unknown column after every numeric column', () => {
        const rows = withNone((id) => ({ kind: 'a', autkIds: [id] }));
        const cells = (run(rows, { preset: 'binning-2d', options: { binsX: 4 } }, ['v', 'kind']).rows as Binning2dCellRow[])
            .sort((a, b) => a.xOrder - b.xOrder)
            .map((cell) => [cell.x, cell.count]);

        expect(cells).toEqual([...ranges, ['unknown', 2]]);
    });
});

describe('2D binning labels', () => {
    it('keeps each of ten x bins from 0 to 1 in its own cell, labeled by its edges', () => {
        const result = run(rowsOf(zeroToOne), { preset: 'binning-2d' }, ['v', 'kind']);
        const cells = (result.rows as Binning2dCellRow[])
            .sort((a, b) => a.xOrder - b.xOrder)
            .map((cell) => [cell.x, cell.y, cell.count]);
        expect(cells).toEqual([
            ['0.0-0.10', 'a', 2],
            ['0.10-0.20', 'a', 1],
            ['0.20-0.30', 'a', 1],
            ['0.30-0.40', 'a', 1],
            ['0.40-0.50', 'a', 1],
            ['0.50-0.60', 'a', 1],
            ['0.60-0.70', 'a', 1],
            ['0.70-0.80', 'a', 1],
            ['0.80-0.90', 'a', 1],
            ['0.90-1.0', 'a', 2],
        ]);
    });
});
