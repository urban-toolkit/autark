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

describe('Tick labels of a plot given tickFormats', () => {
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
