// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';

/** One feature whose series has a point at each of `timestamps`. */
function seriesAt(timestamps: string[]): FeatureCollection {
    const feature: Feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { series: timestamps.map((timestamp, i) => ({ timestamp, value: i + 1 })) },
    };
    return { type: 'FeatureCollection', features: [feature] };
}

/** The x tick labels of a line chart of a reduce-series over `timestamps`. */
function xTicks(timestamps: string[]): string[] {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, {
        type: 'linechart',
        collection: seriesAt(timestamps),
        attributes: { axis: ['series', '@transform'] },
        transform: { preset: 'reduce-series' },
    });
    return Array.from(div.querySelectorAll('.x.axis .tick text'), (text) => text.textContent ?? '');
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Line chart x labels of timestamp buckets', () => {
    it('writes the month and day of day buckets that span more than a few days', () => {
        expect(xTicks(['2024-03-01', '2024-03-05', '2024-03-10'])).toEqual(['Mar 1', 'Mar 5', 'Mar 10']);
    });

    it('adds the hour to buckets that span a few days or less', () => {
        expect(xTicks(['2024-03-01 06:00', '2024-03-01 12:00', '2024-03-02 06:00'])).toEqual(['Mar 1 06h', 'Mar 1 12h', 'Mar 2 06h']);
    });

    it('writes month and year buckets as they are', () => {
        expect(xTicks(['2024-01', '2024-02', '2024-03'])).toEqual(['2024-01', '2024-02', '2024-03']);
        expect(xTicks(['2020', '2021', '2022'])).toEqual(['2020', '2021', '2022']);
    });
});
