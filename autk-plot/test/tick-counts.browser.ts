import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 0.25, 0.5, 0.75, 1].map((share, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { name: `f${i}`, share, rate: share * 1000, series: [{ timestamp: `2024-0${i + 1}`, value: share * 1000 }] },
    })),
};
const points = { type: 'scatterplot', collection, attributes: { axis: ['share', 'rate'] } } satisfies UnifiedPlotConfig;
const bars = { type: 'barchart', collection, attributes: { axis: ['name', 'rate'] } } satisfies UnifiedPlotConfig;
const line = { type: 'linechart', collection, attributes: { axis: ['series', '@transform'] },
    transform: { preset: 'reduce-series' } } satisfies UnifiedPlotConfig;
const bubble = { ...points, type: 'bubble', attributes: { axis: ['share', 'rate', 'rate'] } } satisfies UnifiedPlotConfig;
const ecdf = { type: 'ecdf', collection, attributes: { axis: ['share'] },
    transform: { preset: 'cumulative' } } satisfies UnifiedPlotConfig;

function ticks(config: UnifiedPlotConfig, axis: 'x' | 'y'): string[] {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return Array.from(div.querySelectorAll(`.${axis}.axis .tick text`), text => text.textContent ?? '');
}

afterEach(() => document.body.replaceChildren());

describe('Numeric axis tick counts', () => {
    it('keeps usual counts at default size but reduces them on compact plots', () => {
        const compact = { width: 200, height: 160 };
        for (const [plot, axes] of [[points, ['x', 'y']], [bars, ['y']], [line, ['y']]] as const) {
            for (const axis of axes) {
                expect(ticks(plot, axis)).toHaveLength(plot.type === 'linechart' ? 6 : 11);
                expect(ticks({ ...plot, ...compact }, axis).length).toBeLessThan(ticks(plot, axis).length);
            }
        }
        expect(ticks({ ...line, height: 2000 }, 'y')).toEqual(ticks(line, 'y'));
    });

    it('sets counts and formats together, with nested formats overriding legacy ones per axis', () => {
        const plot = { ...points, ticks: { x: { count: 2, format: '.2f' }, y: { count: 2 } }, tickFormats: ['.0f', '.1f'] };
        expect(ticks(plot, 'x')).toEqual(['0.00', '0.50', '1.00']);
        expect(ticks(plot, 'y')).toEqual(['0.0', '500.0', '1000.0']);
        expect(ticks({ ...points, ticks: { y: { count: 20 } }, width: 200, height: 160 }, 'y')).toHaveLength(21);
        expect(ticks({ ...bars, ticks: { y: { count: 2, format: ',d' } } }, 'y')).toEqual(['0', '500', '1,000']);
        expect(ticks({ ...line, ticks: { y: { count: 2 } } }, 'y')).toEqual(['0', '500', '1k']);
    });

    it('falls back to adaptive density for missing and invalid entries', () => {
        const compact = { ...points, width: 200, height: 160 };
        const expected = ticks(compact, 'y');
        expect(ticks({ ...compact, ticks: { x: { count: 8 } } }, 'y')).toEqual(expected);
        for (const invalid of [0, -3, NaN, Infinity]) {
            expect(ticks({ ...compact, ticks: { y: { count: invalid } } }, 'y')).toEqual(expected);
        }
    });

    it('does not replace category and bucket positions, even with numeric keys', () => {
        expect(ticks({ ...bars, attributes: { axis: ['share', 'rate'] }, ticks: { x: { count: 2 } } }, 'x'))
            .toEqual(['0', '0.25', '0.5', '0.75', '1']);
        expect(ticks({ ...line, ticks: { x: { count: 2 } } }, 'x')).toEqual(ticks(line, 'x'));
    });

    it('preserves whole-count bar axes by default', () => {
        expect(ticks({ ...bars, transform: { preset: 'binning-1d' }, height: 160 }, 'y')).toEqual(['0', '1']);
    });

    it('accepts overrides on additional numeric axes without changing their compact defaults', () => {
        for (const plot of [bubble, ecdf]) {
            for (const axis of ['x', 'y'] as const) {
                expect(ticks({ ...plot, width: 200, height: 160 }, axis)).toEqual(ticks(plot, axis));
                expect(ticks({ ...plot, ticks: { x: { count: 2 }, y: { count: 2 } } }, axis)).toHaveLength(3);
            }
        }
    });

    it('formats ECDF share ticks while keeping percent labels by default', () => {
        expect(ticks(ecdf, 'y')).toContain('20%');
        expect(ticks({ ...ecdf, ticks: { y: { count: 2, format: '.1f' } } }, 'y')).toEqual(['0.0', '0.5', '1.0']);
    });

    it('does not add numeric labels to the relative density axis', () => {
        const density = { type: 'density', collection, attributes: { axis: ['share'] },
            transform: { preset: 'density' }, ticks: { x: { count: 2 }, y: { count: 2 } } } satisfies UnifiedPlotConfig;
        expect(ticks(density, 'y')).toEqual([]);
        // The density transform expands the domain past 0 and 1; D3 chooses whole-unit ticks here.
        expect(ticks(density, 'x')).toEqual(['0', '1']);
    });
});
