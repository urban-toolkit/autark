// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { PlotOverlay, UnifiedPlotConfig } from '../src';

// One series over five months, valued 1 to 5.
const months: FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { series: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05'].map((timestamp, i) => ({ timestamp, value: i + 1 })) },
    } as Feature],
};

/** Draws a line chart of the months whose overlay callback records each overlay it gets, and draws a rect into it. */
function drawWithOverlay(extra: Partial<UnifiedPlotConfig> = {}) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const calls: PlotOverlay[] = [];
    const config = {
        type: 'linechart',
        collection: months,
        attributes: { axis: ['series', '@transform'] },
        transform: { preset: 'reduce-series' },
        overlay: (overlay: PlotOverlay) => {
            calls.push(overlay);
            overlay.layer.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
        },
        ...extra,
    } as UnifiedPlotConfig;
    const plot = new AutkPlot(div, config);
    return { div, plot, calls };
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Line chart overlay hook', () => {
    it('gives the callback an empty layer behind the marks that ignores the pointer', () => {
        const { div, calls } = drawWithOverlay();
        const layer = div.querySelector<SVGGElement>('.autkOverlay')!;

        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((call) => call.layer === layer)).toBe(true);
        expect(layer.style.getPropertyValue('pointer-events')).toBe('none');
        // Earlier in the svg than the marks, so drawn under them; at the marks' origin.
        const marks = div.querySelector('.autkMarksGroup')!;
        expect(layer.compareDocumentPosition(marks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(layer.getAttribute('transform')).toBe(marks.getAttribute('transform'));
        // Cleared before each call: one rect, from the latest call.
        expect(layer.querySelectorAll('rect')).toHaveLength(1);
    });

    it('gives the size of the plot area and the scales of the latest render', () => {
        const { div, calls } = drawWithOverlay();
        const overlay = calls[calls.length - 1];
        const area = div.querySelector('.autkClear')!;

        expect(overlay.width).toBe(Number(area.getAttribute('width')));
        expect(overlay.height).toBe(Number(area.getAttribute('height')));
        const dots = Array.from(div.querySelectorAll('.autkMark'), (dot) => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);
        expect(dots).toEqual([0, 1, 2, 3, 4].map((rank) => [overlay.x(rank), overlay.y(rank + 1)]));
    });

    it('gives the rank of the first bucket not before a key, or one past the last', () => {
        const { calls } = drawWithOverlay();
        const { rankOf } = calls[calls.length - 1];

        expect(rankOf?.('2024-01')).toBe(0);
        expect(rankOf?.('2024-02')).toBe(1);
        expect(rankOf?.('2024-02-15')).toBe(2);
        expect(rankOf?.('2023-12')).toBe(0);
        expect(rankOf?.('2025-01')).toBe(5);
    });

    it('runs the callback again on refreshOverlay, into the cleared layer', () => {
        const { div, plot, calls } = drawWithOverlay();
        const before = calls.length;

        plot.refreshOverlay();

        expect(calls.length).toBe(before + 1);
        expect(div.querySelectorAll('.autkOverlay rect')).toHaveLength(1);
    });
});
