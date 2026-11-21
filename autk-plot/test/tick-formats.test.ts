// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

/** Three features, a to c, with a `share` and a `rate` each, and a one-point series of the rate in a month of 2024. */
function collectionOf(shares: number[], rates: number[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: shares.map((share, i): Feature => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [i, i] },
            properties: { name: 'abc'[i], share, rate: rates[i], series: [{ timestamp: `2024-0${i + 1}`, value: rates[i] }] },
        })),
    };
}

const fractions = collectionOf([0.25, 0.5, 0.75], [0.2, 0.5, 0.8]);
const thousands = collectionOf([1, 2, 3], [1000, 2000, 3000]);
const series = { attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' as const } };

/** A feature for each of `rows`, holding its properties. */
function featuresOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties })),
    };
}

// Numbers that name a category, with a count each: years, each also a bucket of a series, and zip codes.
const years = featuresOf([2020, 2021, 2022].map((year, i) => ({ year, count: i + 1, series: [{ timestamp: String(year), value: i + 1 }] })));
const zips = featuresOf([10001, 10002, 10003].map((zip, i) => ({ zip, count: i + 1 })));

/** The text of each tick label `selector` finds in a plot drawn in a container of its own. */
function ticks(config: UnifiedPlotConfig, selector: string): string[] {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return Array.from(div.querySelectorAll(selector), (text) => text.textContent ?? '');
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Tick labels of a plot given no tickFormats', () => {
    it('writes a bar chart\'s ticks under one as decimals', () => {
        const bars: UnifiedPlotConfig = { type: 'barchart', collection: fractions, attributes: { axis: ['share', 'rate'] } };

        expect(ticks(bars, '.x.axis .tick text')).toEqual(['0.25', '0.5', '0.75']);
        expect(ticks(bars, '.y.axis .tick text')).toEqual(['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']);
    });

    it('writes a line chart\'s y ticks under one as decimals', () => {
        expect(ticks({ type: 'linechart', collection: fractions, ...series }, '.y.axis .tick text'))
            .toEqual(['0.2', '0.4', '0.6', '0.8']);
    });

    it('draws a line chart\'s x ticks at its buckets only', () => {
        expect(ticks({ type: 'linechart', collection: fractions, ...series }, '.x.axis .tick text'))
            .toEqual(['2024-01', '2024-02', '2024-03']);
    });

    it('writes a scatterplot\'s ticks under one as decimals', () => {
        const points: UnifiedPlotConfig = { type: 'scatterplot', collection: fractions, attributes: { axis: ['share', 'rate'] } };

        expect(ticks(points, '.x.axis .tick text'))
            .toEqual(['0.25', '0.3', '0.35', '0.4', '0.45', '0.5', '0.55', '0.6', '0.65', '0.7', '0.75']);
        expect(ticks(points, '.y.axis .tick text'))
            .toEqual(['0.2', '0.25', '0.3', '0.35', '0.4', '0.45', '0.5', '0.55', '0.6', '0.65', '0.7', '0.75', '0.8']);
    });

    it('writes the ticks of parallel coordinates under one as decimals', () => {
        // The share axis, then the rate axis.
        expect(ticks({ type: 'parallel-coordinates', collection: fractions, attributes: { axis: ['share', 'rate'] } }, '.autkBrush .tick text'))
            .toEqual(['0.3', '0.4', '0.5', '0.6', '0.7', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8']);
    });

    it('keeps SI prefixes from one up, on a bar chart and a line chart over thousands', () => {
        expect(ticks({ type: 'barchart', collection: thousands, attributes: { axis: ['name', 'rate'] } }, '.y.axis .tick text')).toEqual([
            '0', '200', '400', '600', '800', '1k', '1.2k', '1.4k', '1.6k', '1.8k', '2k', '2.2k', '2.4k', '2.6k', '2.8k', '3k',
        ]);
        expect(ticks({ type: 'linechart', collection: thousands, ...series }, '.y.axis .tick text'))
            .toEqual(['1k', '1.5k', '2k', '2.5k', '3k']);
    });
});

describe('Category and bucket labels of a plot given no tickFormats', () => {
    it('writes a bar chart\'s categories as they are, years and zip codes too', () => {
        expect(ticks({ type: 'barchart', collection: years, attributes: { axis: ['year', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['2020', '2021', '2022']);
        expect(ticks({ type: 'barchart', collection: zips, attributes: { axis: ['zip', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['10001', '10002', '10003']);
    });

    it('writes a line chart\'s buckets as they are, years too', () => {
        expect(ticks({ type: 'linechart', collection: years, ...series }, '.x.axis .tick text')).toEqual(['2020', '2021', '2022']);
    });

    it('writes a bar chart\'s fractional categories as decimals, and its whole ones and its bins as they are', () => {
        // 0.1 + 0.2 is 0.30000000000000004.
        const levels = featuresOf([0.1 + 0.2, 12.3456789, 1500000].map((level, i) => ({ level, count: i + 1 })));
        expect(ticks({ type: 'barchart', collection: levels, attributes: { axis: ['level', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['0.3', '12.3456789', '1500000']);

        // A bin's label can read as a number, as a column of one value's does, but it is written already.
        const bins: UnifiedPlotConfig = {
            type: 'barchart',
            collection: featuresOf([{ level: 0.4 }, { level: 0.4 }]),
            attributes: { axis: ['level', '@transform'] },
            transform: { preset: 'binning-1d' },
        };
        expect(ticks(bins, '.x.axis .tick text')).toEqual(['0.40']);
    });

    it('writes a bar chart\'s negative categories with one minus sign, whole or fractional', () => {
        // Each reads with the hyphen-minus a whole category is written with, not d3's minus sign, U+2212.
        const levels = featuresOf([-5, -0.5, -(0.1 + 0.2)].map((level, i) => ({ level, count: i + 1 })));
        expect(ticks({ type: 'barchart', collection: levels, attributes: { axis: ['level', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['-5', '-0.5', '-0.3']);
    });

    it('writes two fractional categories that differ past the sixth significant digit with two labels', () => {
        // Two longitudes 7 millionths of a degree apart: at six significant digits, both would read "-73.9352".
        const levels = featuresOf([-73.935242, -73.935249].map((level, i) => ({ level, count: i + 1 })));
        expect(ticks({ type: 'barchart', collection: levels, attributes: { axis: ['level', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['-73.935242', '-73.935249']);
    });

    it('writes a fractional category of more than six significant digits with each of them', () => {
        const levels = featuresOf([{ level: 1234567.5, count: 1 }]);
        expect(ticks({ type: 'barchart', collection: levels, attributes: { axis: ['level', 'count'] } }, '.x.axis .tick text'))
            .toEqual(['1234567.5']);
    });

    it('keeps every digit of a bin label that reads as a number', () => {
        // A column of one value is one bin, labeled by that value at the digits it needs: 583912.25 reads "583912.3".
        const bins: UnifiedPlotConfig = {
            type: 'barchart',
            collection: featuresOf([{ level: 583912.25 }, { level: 583912.25 }]),
            attributes: { axis: ['level', '@transform'] },
            transform: { preset: 'binning-1d' },
        };
        expect(ticks(bins, '.x.axis .tick text')).toEqual(['583912.3']);
    });
});

describe('Tick labels of a plot given tickFormats', () => {
    it('writes numeric categories and buckets with the format a caller gives', () => {
        expect(ticks({ type: 'barchart', collection: zips, attributes: { axis: ['zip', 'count'] }, tickFormats: [',', ','] }, '.x.axis .tick text'))
            .toEqual(['10,001', '10,002', '10,003']);
        expect(ticks({ type: 'linechart', collection: years, ...series, tickFormats: ['.1f', '.1f'] }, '.x.axis .tick text'))
            .toEqual(['2020.0', '2021.0', '2022.0']);
    });

    it('keeps the SI format a caller gives, under one too', () => {
        const bars: UnifiedPlotConfig = {
            type: 'barchart', collection: fractions, attributes: { axis: ['share', 'rate'] }, tickFormats: ['~s', '~s'],
        };

        expect(ticks(bars, '.x.axis .tick text')).toEqual(['250m', '500m', '750m']);
        expect(ticks(bars, '.y.axis .tick text'))
            .toEqual(['0', '100m', '200m', '300m', '400m', '500m', '600m', '700m', '800m', '900m', '1']);
    });

    it('keeps any other format a caller gives', () => {
        const bars: UnifiedPlotConfig = {
            type: 'barchart', collection: fractions, attributes: { axis: ['share', 'rate'] }, tickFormats: ['.2f', '.2f'],
        };

        expect(ticks(bars, '.x.axis .tick text')).toEqual(['0.25', '0.50', '0.75']);
        expect(ticks(bars, '.y.axis .tick text'))
            .toEqual(['0.00', '0.10', '0.20', '0.30', '0.40', '0.50', '0.60', '0.70', '0.80', '0.90', '1.00']);
    });
});

describe('tickFormats with fewer entries than the plot has axes', () => {
    // An axis with a missing or undefined entry gets its default, as with no tickFormats at all.
    it('gives a bar chart\'s y axis its default when the formats name only the x axis', () => {
        const bars: UnifiedPlotConfig = { type: 'barchart', collection: fractions, attributes: { axis: ['share', 'rate'] }, tickFormats: ['.2f'] };

        expect(ticks(bars, '.x.axis .tick text')).toEqual(['0.25', '0.50', '0.75']);
        expect(ticks(bars, '.y.axis .tick text')).toEqual(['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']);
    });

    it('gives a scatterplot\'s x axis its default when its entry is undefined', () => {
        // The type asks for strings, but a JavaScript caller or a spec that was not type checked can leave a hole.
        const points: UnifiedPlotConfig = {
            type: 'scatterplot', collection: fractions, attributes: { axis: ['share', 'rate'] }, tickFormats: [undefined as unknown as string, '.2f'],
        };

        expect(ticks(points, '.x.axis .tick text'))
            .toEqual(['0.25', '0.3', '0.35', '0.4', '0.45', '0.5', '0.55', '0.6', '0.65', '0.7', '0.75']);
        expect(ticks(points, '.y.axis .tick text'))
            .toEqual(['0.20', '0.25', '0.30', '0.35', '0.40', '0.45', '0.50', '0.55', '0.60', '0.65', '0.70', '0.75', '0.80']);
    });

    it('gives every axis its default when the formats are empty', () => {
        const lines: UnifiedPlotConfig = { type: 'linechart', collection: years, ...series, tickFormats: [] };

        expect(ticks(lines, '.x.axis .tick text')).toEqual(['2020', '2021', '2022']);
        expect(ticks(lines, '.y.axis .tick text')).toEqual(['1', '1.5', '2', '2.5', '3']);
        expect(ticks({ type: 'parallel-coordinates', collection: fractions, attributes: { axis: ['share', 'rate'] }, tickFormats: [] }, '.autkBrush .tick text'))
            .toEqual(['0.3', '0.4', '0.5', '0.6', '0.7', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8']);
    });
});
