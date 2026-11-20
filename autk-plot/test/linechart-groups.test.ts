// @vitest-environment happy-dom
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

/** A feature for each of `rows`, holding its properties. */
function featuresOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties })),
    };
}

// Two features of kind a, over January and February, and one of kind b, over February and March.
const kinds = featuresOf([
    { kind: 'a', series: [{ timestamp: '2024-01', value: 1 }, { timestamp: '2024-02', value: 2 }] },
    { kind: 'a', series: [{ timestamp: '2024-01', value: 3 }, { timestamp: '2024-02', value: 4 }] },
    { kind: 'b', series: [{ timestamp: '2024-02', value: 10 }, { timestamp: '2024-03', value: 20 }] },
]);

const byKind: UnifiedPlotConfig = {
    type: 'linechart',
    collection: kinds,
    attributes: { axis: ['series', '@transform'] },
    transform: { preset: 'reduce-series', options: { by: 'kind' } },
};
const allTogether: UnifiedPlotConfig = { ...byKind, transform: { preset: 'reduce-series' } };

function draw(config: UnifiedPlotConfig): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    new AutkPlot(div, config);
    return div;
}

/** A CSS color as `#rrggbb`, so that `rgb(1,2,3)`, `rgb(1, 2, 3)` and `#010203` compare equal. */
function hex(color: string | null): string {
    return d3.color(color ?? '')?.formatHex() ?? `not a color: "${color}"`;
}

/** Each mark's data as `[x, y]`, with its fill, in the order of the marks. */
function marks(div: HTMLElement): Array<{ x: number; y: number; group?: string; fill: string }> {
    return Array.from(div.querySelectorAll<SVGCircleElement>('.autkMark'), (mark) => {
        const d = d3.select(mark).datum() as { x: number; y: number; group?: string };
        return { x: d.x, y: d.y, ...(d.group !== undefined ? { group: d.group } : {}), fill: hex(mark.style.getPropertyValue('fill')) };
    });
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Line chart with reduce-series grouped by a property', () => {
    it('draws one line per group', () => {
        const div = draw(byKind);

        expect(div.querySelectorAll('.autk-line')).toHaveLength(2);
    });

    it('reduces each group on its own, on one shared x axis of all the buckets', () => {
        const div = draw(byKind);

        // Group a averages its two features; group b has its own buckets, placed among all three.
        expect(marks(div).map(({ x, y, group }) => ({ x, y, group }))).toEqual([
            { x: 0, y: 2, group: 'a' },
            { x: 1, y: 3, group: 'a' },
            { x: 1, y: 10, group: 'b' },
            { x: 2, y: 20, group: 'b' },
        ]);
        expect(Array.from(div.querySelectorAll('.x.axis .tick text'), (text) => text.textContent))
            .toEqual(['2024-01', '2024-02', '2024-03']);
    });

    it('colors each group\'s line like its marks, from the categorical scheme', () => {
        const div = draw(byKind);
        const [a, b] = d3.schemeObservable10.map(hex);

        const strokes = Array.from(div.querySelectorAll('.autk-line'), (line) => hex(line.getAttribute('stroke')));
        expect(strokes).toEqual([a, b]);
        expect(marks(div).map((mark) => mark.fill)).toEqual([a, a, b, b]);
    });
});

describe('Line chart with reduce-series not grouped', () => {
    it('draws one line for all the features, in the default line color', () => {
        const div = draw(allTogether);

        const lines = div.querySelectorAll('.autk-line');
        expect(lines).toHaveLength(1);
        expect(hex(lines[0].getAttribute('stroke'))).toBe('#4472c4');
        expect(marks(div).map(({ x, y, group }) => ({ x, y, group }))).toEqual([
            { x: 0, y: 2, group: undefined },
            { x: 1, y: 16 / 3, group: undefined },
            { x: 2, y: 20, group: undefined },
        ]);
    });
});
