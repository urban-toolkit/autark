// @vitest-environment happy-dom
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';

import { AutkPlot, PlotStyle } from '../src';
import type { UnifiedPlotConfig } from '../src';

// Three features with a category and a number to color by.
const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { v: 10, kind: 'a' },
        { v: 20, kind: 'b' },
        { v: 30, kind: 'c' },
    ].map(({ v, kind }, i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x: i, y: 2 * i, v, kind },
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

/** The fill of each mark of the scatterplot drawn with `config`, in the order of its marks. */
function fills(config: Partial<UnifiedPlotConfig>): string[] {
    const div = host();
    new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'], color: 'kind' }, ...config });
    return Array.from(div.querySelectorAll<SVGElement>('.autkMark'), (mark) => hex(mark.style.getPropertyValue('fill')));
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('categoryColors', () => {
    it('fills each category with its color, in the order of the color domain', () => {
        expect(fills({ categoryColors: ['#ff0000', 'green', 'rgb(0, 0, 255)'] })).toEqual(
            ['#ff0000', '#008000', '#0000ff'],
        );
    });

    it('follows the order a USER domain gives the categories', () => {
        expect(fills({
            categoryColors: ['#ff0000', '#00ff00', '#0000ff'],
            domainSpec: { type: ColorMapDomainStrategy.USER, params: ['c', 'b', 'a'] },
        })).toEqual(['#0000ff', '#00ff00', '#ff0000']);
    });

    it('gives a category past the last color the last color', () => {
        expect(fills({ categoryColors: ['#ff0000', '#00ff00'] })).toEqual(['#ff0000', '#00ff00', '#00ff00']);
    });

    it('falls back to the scheme for an entry that is not a CSS color', () => {
        expect(fills({ categoryColors: ['#ff0000', 'not-a-color', '#0000ff'] })).toEqual(
            ['#ff0000', hex(d3.schemeObservable10[1]), '#0000ff'],
        );
    });

    it('uses the scheme when it is omitted or empty', () => {
        const scheme = d3.schemeObservable10.slice(0, 3).map(hex);
        expect(fills({})).toEqual(scheme);
        expect(fills({ categoryColors: [] })).toEqual(scheme);
    });

    it('is ignored for a numeric color attribute', () => {
        expect(fills({ attributes: { axis: ['x', 'y'], color: 'v' }, categoryColors: ['#ff0000', '#00ff00', '#0000ff'] }))
            .toEqual([0, 0.5, 1].map((t) => hex(d3.interpolateReds(t))));
    });

    it('gives way to the highlight of a selected mark', () => {
        const div = host();
        const plot = new AutkPlot(div, {
            type: 'scatterplot',
            collection,
            attributes: { axis: ['x', 'y'], color: 'kind' },
            categoryColors: ['#ff0000', '#00ff00', '#0000ff'],
        });
        plot.setSelection([1]);
        const marks = Array.from(div.querySelectorAll<SVGElement>('.autkMark'), (m) => hex(m.style.getPropertyValue('fill')));
        expect(marks).toEqual(['#ff0000', hex(PlotStyle.highlight), '#0000ff']);
    });
});
