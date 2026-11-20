// @vitest-environment happy-dom
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';

// One series over fourteen months, January 2024 to February 2025.
const months = d3.utcMonths(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2025, 2, 1))).map(d3.utcFormat('%Y-%m'));
const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { series: months.map((timestamp, i) => ({ timestamp, value: i })) },
    } as Feature],
};

/** The ticks of a line chart of the months whose xTickLabel is `xTickLabel`: each tick's bucket rank and text. */
function xTicks(xTickLabel?: (key: string) => string): Array<[number, string]> {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, {
        type: 'linechart', collection, attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' }, xTickLabel,
    });
    return Array.from(div.querySelectorAll('.x.axis .tick'), (tick) => [d3.select(tick).datum() as number, tick.textContent ?? '']);
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Line chart ticks with xTickLabel', () => {
    it('puts a tick at every bucket its text is not empty for, and nowhere else', () => {
        const halfYears = (key: string) => (key.endsWith('-01') || key.endsWith('-07') ? key : '');

        expect(xTicks(halfYears)).toEqual([[0, '2024-01'], [6, '2024-07'], [12, '2025-01']]);
    });

    it('puts a tick at every bucket when its text is never empty', () => {
        expect(xTicks((key) => key.slice(5)).map(([rank]) => rank)).toEqual(months.map((_, i) => i));
    });

    it('keeps the ticks at buckets, labeled with their keys, without it', () => {
        const ticks = xTicks();

        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every(([rank, text]) => Number.isInteger(rank) && text === months[rank])).toBe(true);
    });
});
