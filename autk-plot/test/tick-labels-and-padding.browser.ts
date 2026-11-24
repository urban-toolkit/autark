import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

function draw(config: UnifiedPlotConfig): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return div;
}

function xTicks(div: HTMLElement): string[] {
    return Array.from(div.querySelectorAll('.x.axis .tick text'), tick => tick.textContent ?? '');
}

function lineAt(timestamps: string[]): UnifiedPlotConfig {
    return {
        type: 'linechart',
        collection: { type: 'FeatureCollection', features: [{
            type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { series: timestamps.map((timestamp, i) => ({ timestamp, value: i + 1 })) },
        }] },
        attributes: { axis: ['series', '@transform'] },
        transform: { preset: 'reduce-series' },
    };
}

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [2020, 2021, 2022].map((year, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties: { year, amount: i + 1 },
    })),
};
const bars = { type: 'barchart', collection, attributes: { axis: ['year', 'amount'] } } satisfies UnifiedPlotConfig;

afterEach(() => document.body.replaceChildren());

describe('Timestamp and custom X tick labels', () => {
    it('shortens daily buckets and switches to day labels for a wide span', () => {
        expect(xTicks(draw(lineAt(['2024-03-01', '2024-03-02'])))).toEqual(['Mar 1', 'Mar 2']);
        expect(xTicks(draw(lineAt(['2024-03-01 06:00', '2024-03-10 06:00'])))).toEqual(['Mar 1', 'Mar 10']);
    });

    it('shows UTC hours on short spans, treating timestamps without a zone as UTC', () => {
        expect(xTicks(draw(lineAt(['2024-03-01 06:00', '2024-03-01T12:00:00+02:00', '2024-03-02 06:00']))))
            .toEqual(['Mar 1 06h', 'Mar 1 10h', 'Mar 2 06h']);
    });

    it('uses raw line bucket keys and can label a bucket outside the usual tick sample', () => {
        const dates = Array.from({ length: 20 }, (_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`);
        const div = draw({ ...lineAt(dates), ticks: { x: { label: key => key === '2024-03-02' ? 'Second day' : '' } } });
        expect(xTicks(div)).toEqual(['Second day']);
        expect(div.querySelectorAll('circle.autkMark')).toHaveLength(20);
    });

    it('uses raw bar keys before numeric formatting without changing bar categories', () => {
        const div = draw({ ...bars, ticks: { x: { format: ',d', label: key => key === '2021' ? '' : `FY ${key}` } } });
        expect(xTicks(div)).toEqual(['FY 2020', '', 'FY 2022']);
        expect(div.querySelectorAll('rect.autkMark')).toHaveLength(3);
    });
});

describe('Bar padding', () => {
    it('changes band widths and falls back to the default for invalid values', () => {
        const width = (div: HTMLElement) => Number(div.querySelector('rect.autkMark')?.getAttribute('width'));
        const defaultWidth = width(draw(bars));
        expect(width(draw({ ...bars, style: { barPadding: 0 } }))).toBeGreaterThan(defaultWidth);
        expect(width(draw({ ...bars, style: { barPadding: 0.75 } }))).toBeLessThan(defaultWidth);
        for (const barPadding of [-1, 2, Infinity, NaN]) {
            expect(width(draw({ ...bars, style: { barPadding } }))).toBe(defaultWidth);
        }
    });
});
