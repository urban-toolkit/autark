/**
 * Point colors at the first draw, and a selection through a redraw.
 *
 * From autark #134 (Fabio Miranda), the fixes of the original autk-plot carried into this one; the
 * tests run on this package, with its own selection: the provenance color, and the part of each
 * aggregated mark.
 */

import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

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

describe('Plot style options', () => {
    it('uses a fixed scatter radius and an explicit palette in domain order without replacing highlights', () => {
        const div = host();
        const plot = new AutkPlot(div, {
            type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'kind' },
            style: { radius: 2.5, colorMap: {
                type: 'categorical', colors: ['#ff6347', '#001122'],
                domainSpec: { type: ColorMapDomainStrategy.USER, params: ['c', 'a', 'b'] },
            } },
        });
        const radii = () => Array.from(div.querySelectorAll('circle.autkMark'), mark => mark.getAttribute('r'));
        expect(radii()).toEqual(['2.5', '2.5', '2.5']);
        expect(fills(div)).toEqual(['#001122', '#001122', hex('tomato')]);
        plot.setSelection([1]);
        plot.draw();
        expect(radii()).toEqual(['2.5', '2.5', '2.5']);
        expect(fills(div)).toEqual(['#001122', hex(PlotStyle.provenance), hex('tomato')]);
    });

    it('uses a named categorical interpolator on bar marks, overriding the legacy scheme', () => {
        const div = host();
        new AutkPlot(div, {
            type: 'barchart', collection, attributes: { axis: ['kind', 'v'], color: 'kind' },
            categoricalColorMapInterpolator: ColorMapInterpolator.CAT_SET1,
            style: { colorMap: { interpolator: ColorMapInterpolator.CAT_SET2 } },
        });
        expect(fills(div)).toEqual(d3.schemeSet2.slice(0, 3).map(hex));
    });

    it('uses custom sequential and diverging palettes with map-style domains', () => {
        const sequential = host();
        new AutkPlot(sequential, {
            type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'v' },
            style: { colorMap: { type: 'sequential', colors: ['#000000', '#ffffff'] } },
        });
        expect(fills(sequential)).toEqual(['#000000', '#808080', '#ffffff']);

        const diverging = host();
        new AutkPlot(diverging, {
            type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'v' },
            domainSpec: { type: ColorMapDomainStrategy.USER, params: [0, 30] },
            style: { colorMap: {
                type: 'diverging', colors: ['#000000', '#ffffff', '#ff0000'],
                domainSpec: { type: ColorMapDomainStrategy.USER, params: [10, 20, 50] },
            } },
        });
        expect(fills(diverging)).toEqual(['#000000', '#ffffff', '#ffaaaa']);
    });

    it('rejects an invalid custom palette using the shared map validation', () => {
        expect(() => new AutkPlot(host(), {
            type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'v' },
            style: { colorMap: { type: 'diverging', colors: ['#000000', '#ffffff'] } },
        })).toThrow('Invalid custom colormap');
    });

    it('keeps the default radius for invalid values', () => {
        for (const radius of [undefined, -1, 0, NaN, Infinity]) {
            const div = host();
            new AutkPlot(div, {
                type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'v' },
                style: { radius },
            });
            expect(div.querySelector('circle.autkMark')?.getAttribute('r')).toBe('5');
            expect(fills(div)).toEqual([0, 0.5, 1].map(t => hex(d3.interpolateReds(t))));
        }
    });
});

describe('A selection through a redraw', () => {
    // The second feature is selected: its point is highlighted, the others keep the default color.
    // This package draws a selection in the provenance color (aqua), not PlotStyle.highlight (blue).
    const selected = [PlotStyle.default, PlotStyle.provenance, PlotStyle.default].map(hex);

    it('keeps the selected point of a scatterplot highlighted', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });
        plot.setSelection([1]);
        expect(fills(div)).toEqual(selected);

        plot.draw();
        expect(plot.selection).toEqual([1]);
        expect(fills(div)).toEqual(selected);
    });

    // A line chart aggregates: a selection made elsewhere is drawn as the part of each point it
    // produces (an autkPartial over the point), here the whole of the one point of feature 1.
    it('keeps the part of the selected point of a line chart through a redraw', () => {
        const div = host();
        const plot = new AutkPlot(div, {
            type: 'linechart',
            collection,
            attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series' },
        });
        const part = () => Array.from(div.querySelectorAll<SVGElement>('circle.autkPartial'), (copy) => [copy.getAttribute('data-autk-units'), hex(copy.style.getPropertyValue('fill'))]);
        plot.setSelection([1]);
        expect(part()).toEqual([['1/1', hex(PlotStyle.provenance)]]);

        plot.draw();
        expect(plot.selection).toEqual([1]);
        expect(part()).toEqual([['1/1', hex(PlotStyle.provenance)]]);
    });
});
