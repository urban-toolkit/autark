// @vitest-environment happy-dom
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotStyle } from '../src';

// Three features, with numbers and categories to color by and a one-point series for the line chart.
const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { v: 10, kind: 'a', year: '2020' },
        { v: 20, kind: 'b', year: '2021' },
        { v: 30, kind: 'c', year: '2022' },
    ].map(({ v, kind, year }, i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x: i, y: 2 * i, v, kind, series: [{ timestamp: year, value: v }] },
    })),
};

function host(): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

/** A CSS color as `#rrggbb`, so that `rgb(1,2,3)`, `rgb(1, 2, 3)` and `#010203` compare equal. */
function hex(color: string): string {
    return d3.color(color)?.formatHex() ?? `not a color: "${color}"`;
}

/** The fill of each mark of the plot drawn in `div`, in the order of its marks. */
function fills(div: HTMLElement): string[] {
    return Array.from(div.querySelectorAll<SVGElement>('.autkMark'), (mark) => hex(mark.style.getPropertyValue('fill')));
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Scatterplot colors at its first draw', () => {
    it('fills each point by its numeric color scale', () => {
        const div = host();
        new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'v' } });

        // autk-plot's default scheme for numbers, interpolateReds, over the values' extent [10, 30].
        expect(fills(div)).toEqual([0, 0.5, 1].map((t) => hex(d3.interpolateReds(t))));
    });

    it('fills each point by its categorical color scale', () => {
        const div = host();
        new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'kind' } });

        // autk-plot's default scheme for categories, Observable10, in the order the categories first appear.
        expect(fills(div)).toEqual(d3.schemeObservable10.slice(0, 3).map(hex));
    });

    it('fills every point with the default color when it has no color attribute', () => {
        const div = host();
        new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });

        expect(fills(div)).toEqual([PlotStyle.default, PlotStyle.default, PlotStyle.default].map(hex));
    });
});

describe('A selection through a redraw', () => {
    // The second feature is selected: its point is highlighted, the others keep the default color.
    const selected = [PlotStyle.default, PlotStyle.highlight, PlotStyle.default].map(hex);

    it('keeps the selected point of a scatterplot highlighted', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });
        plot.setSelection([1]);
        expect(fills(div)).toEqual(selected);

        plot.draw();
        expect(plot.selection).toEqual([1]);
        expect(fills(div)).toEqual(selected);
    });

    it('keeps the selected point of a line chart highlighted', () => {
        const div = host();
        const plot = new AutkPlot(div, {
            type: 'linechart',
            collection,
            attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series' },
        });
        plot.setSelection([1]);
        expect(fills(div)).toEqual(selected);

        plot.draw();
        expect(plot.selection).toEqual([1]);
        expect(fills(div)).toEqual(selected);
    });
});
