/**
 * Axis titles clear of their tick labels.
 *
 * From autark #134 (Fabio Miranda), the fix of the original autk-plot carried into this one: an
 * axis title drawn over a tick label moves clear of it, and where its margin cannot hold it, the
 * margin grows and the plot is drawn once more. This package centers each title on its axis, one
 * gap past its tick labels, so the tests check what both versions promise: no title over a tick
 * label, every title inside its svg, and no x title turned through a redraw.
 *
 * Text is measured only where there is a layout: in Chrome, where these tests run in the autark
 * repository. jsdom has none, so here they are skipped, not passed.
 */

import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

const hasLayout = typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent);
const suite = hasLayout ? describe : describe.skip;

function collectionOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties })),
    };
}

// Land uses with long names, as the rotated tick labels of autarkjs.org's examples.
const landUses = collectionOf([
    { landuse: 'Commercial', kind: 'k1', area: 10 },
    { landuse: 'Residential', kind: 'k2', area: 20 },
    { landuse: 'Industrial', kind: 'k1', area: 30 },
    { landuse: 'Institutional', kind: 'k2', area: 40 },
]);

afterEach(() => {
    document.body.replaceChildren();
});

/** Draws a plot twice (a redraw too), and measures each axis title against its tick labels and its svg. */
function measure(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, config);
    plot.draw();
    const svg = div.querySelector('svg.autk-plot')!.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return (['x', 'y'] as const).map(side => {
        const axis = div.querySelector(`.${side}.axis`)!;
        const title = axis.querySelector('.axis-label')!;
        const box = title.getBoundingClientRect();
        const ticks = Array.from(axis.querySelectorAll('.tick text'), text => text.getBoundingClientRect());
        return {
            side,
            over: ticks.filter(tick => overlap(box, tick)).length,
            inside: box.left >= svg.left - 0.5 && box.right <= svg.right + 0.5 && box.top >= svg.top - 0.5 && box.bottom <= svg.bottom + 0.5,
            turned: title.getAttribute('transform') !== null && side === 'x',
        };
    });
}

const clear = (side: 'x' | 'y') => ({ side, over: 0, inside: true, turned: false });

suite('Axis titles clear of their tick labels', () => {
    it('puts a bar chart\'s x title, drawn over its rotated tick labels, below them, inside the svg', () => {
        const config = { type: 'barchart', collection: landUses, attributes: { axis: ['landuse', 'area'] }, labels: { axis: ['Land use', 'Area'] }, width: 300 };
        expect(measure(config as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
    });

    it('grows a margin too small for the title, rather than drawing it over the labels or past the svg', () => {
        const config = {
            type: 'barchart', collection: landUses, attributes: { axis: ['landuse', 'area'] }, labels: { axis: ['Land use', 'Area'] },
            width: 300, margins: { left: 40, right: 20, top: 40, bottom: 30 },
        };
        expect(measure(config as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
    });

    it('puts a heat matrix\'s y title beyond its widest tick label, inside the svg, even with a short margin', () => {
        for (const margins of [undefined, { left: 30, right: 20, top: 40, bottom: 50 }]) {
            const config = {
                type: 'heatmatrix', collection: landUses, attributes: { axis: ['kind', 'landuse'], color: '@transform' },
                transform: { preset: 'binning-2d' }, labels: { axis: ['Kind', 'Land use of the parcel'] }, ...(margins ? { margins } : {}),
            };
            expect(measure(config as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
        }
    });

    it('restores the configured bottom margin when a redraw no longer needs extra room', () => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const plot = new AutkPlot(div, {
            type: 'barchart', collection: collectionOf([
                { landuse: 'A', area: 10 },
                { landuse: 'Residential and institutional mixed-use development', area: 20 },
                { landuse: 'C', area: 30 },
            ]), attributes: { axis: ['landuse', 'area'] },
            width: 300, height: 300, margins: { left: 50, right: 20, top: 40, bottom: 48 },
        });
        const axisOffset = () => div.querySelector('.x.axis')?.getAttribute('transform');
        const first = axisOffset();
        plot.updateCollection(collectionOf([{ landuse: 'A', area: 10 }, { landuse: 'B', area: 20 }]));
        expect(first).not.toBe('translate(50, 252)');
        expect(axisOffset()).toBe('translate(50, 252)');
        plot.destroy();
    });

    it('keeps the titles of a scatterplot clear', () => {
        const config = { type: 'scatterplot', collection: collectionOf([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }]), attributes: { axis: ['a', 'b'] } };
        expect(measure(config as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
    });

    it('keeps the x titles of a bar chart and a line chart unrotated through a redraw', () => {
        const bars = { type: 'barchart', collection: landUses, attributes: { axis: ['kind', 'area'] } };
        const lines = { type: 'linechart', collection: collectionOf([{ series: [1, 2, 3] }]), attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' } };
        expect(measure(bars as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
        expect(measure(lines as UnifiedPlotConfig)).toEqual([clear('x'), clear('y')]);
    });
});
