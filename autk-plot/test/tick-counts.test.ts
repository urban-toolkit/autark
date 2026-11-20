// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

/** Features with a `share` from 0 to 1 and a `rate` from 0 to 1000, and a one-point series of the rate in a month of 2024. */
function collection(): FeatureCollection {
    const shares = [0, 0.25, 0.5, 0.75, 1];
    return {
        type: 'FeatureCollection',
        features: shares.map((share, i): Feature => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [i, i] },
            properties: { name: `f${i}`, share, rate: share * 1000, series: [{ timestamp: `2024-0${i + 1}`, value: share * 1000 }] },
        })),
    };
}

/** How many tick labels `selector` finds in a plot drawn in a container of its own. */
function tickCount(config: UnifiedPlotConfig, selector: string): number {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return div.querySelectorAll(selector).length;
}

const points = (extra: Partial<UnifiedPlotConfig> = {}): UnifiedPlotConfig =>
    ({ type: 'scatterplot', collection: collection(), attributes: { axis: ['share', 'rate'] }, ...extra }) as UnifiedPlotConfig;
const bars = (extra: Partial<UnifiedPlotConfig> = {}): UnifiedPlotConfig =>
    ({ type: 'barchart', collection: collection(), attributes: { axis: ['name', 'rate'] }, ...extra }) as UnifiedPlotConfig;
const line = (extra: Partial<UnifiedPlotConfig> = {}): UnifiedPlotConfig =>
    ({ type: 'linechart', collection: collection(), attributes: { axis: ['series', '@transform'] },
        transform: { preset: 'reduce-series' }, ...extra }) as UnifiedPlotConfig;

afterEach(() => {
    document.body.replaceChildren();
});

describe('Tick counts of a plot given no tickCounts', () => {
    it('keeps the usual ticks at the default size', () => {
        // D3's default of about ten: 0 to 1 by 0.1, and 0 to 1000 by 100.
        expect(tickCount(points(), '.x.axis .tick text')).toBe(11);
        expect(tickCount(points(), '.y.axis .tick text')).toBe(11);
        expect(tickCount(bars(), '.y.axis .tick text')).toBe(11);
    });

    it('draws fewer ticks on a small plot', () => {
        const small = { width: 200, height: 160 };
        const x = tickCount(points(small), '.x.axis .tick text');
        const y = tickCount(points(small), '.y.axis .tick text');
        expect(x).toBeGreaterThanOrEqual(2);
        expect(x).toBeLessThan(11);
        expect(y).toBeGreaterThanOrEqual(2);
        expect(y).toBeLessThan(11);
        expect(tickCount(bars(small), '.y.axis .tick text')).toBeLessThan(11);
        expect(tickCount(line(small), '.y.axis .tick text')).toBeLessThan(tickCount(line(), '.y.axis .tick text'));
    });

    it('never draws more than the line chart\'s usual five-ish y ticks, however tall', () => {
        // 0 to 1000 with about five ticks: by 200.
        expect(tickCount(line({ height: 2000 }), '.y.axis .tick text')).toBe(6);
    });
});

describe('tickCounts', () => {
    it('sets the approximate count of each axis, whatever the size', () => {
        // About two ticks: 0 to 1 by 0.5, 0 to 1000 by 500.
        expect(tickCount(points({ tickCounts: [2, 2] }), '.x.axis .tick text')).toBe(3);
        expect(tickCount(points({ tickCounts: [2, 2] }), '.y.axis .tick text')).toBe(3);
        expect(tickCount(points({ tickCounts: [20, 20], width: 200, height: 160 }), '.y.axis .tick text')).toBe(21);
        expect(tickCount(bars({ tickCounts: [undefined as unknown as number, 2] }), '.y.axis .tick text')).toBe(3);
    });

    it('falls back to the size rule for a missing, zero, negative or non-finite entry', () => {
        for (const bad of [0, -3, NaN, Infinity]) {
            expect(tickCount(points({ tickCounts: [bad, bad] }), '.y.axis .tick text'), String(bad)).toBe(11);
        }
        expect(tickCount(points({ tickCounts: [5] }), '.y.axis .tick text')).toBe(11);
    });
});
