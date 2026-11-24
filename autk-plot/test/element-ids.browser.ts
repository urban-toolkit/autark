/**
 * No fixed element ids: a page holds many plots, and each finds its svg, title and axes by class.
 *
 * From autark #134 (Fabio Miranda), the fixes of the original autk-plot carried into this one; the
 * tests run on this package as written there.
 */

import type { Feature, FeatureCollection } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
        { name: 'a', kind: 'k1', year: '2020' },
        { name: 'b', kind: 'k2', year: '2021' },
        { name: 'c', kind: 'k1', year: '2022' },
    ].map(({ name, kind, year }, i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { name, kind, x: i + 1, y: 2 * i, series: [{ timestamp: year, value: i }] },
    })),
};

// One plot of each kind autk-plot draws in an svg, each in a container of the page's own. The first
// container is `#plot`, the name autk-plot's README gives its own.
const plots: [string, UnifiedPlotConfig][] = [
    ['plot', { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } }],
    ['bars', { type: 'barchart', collection, attributes: { axis: ['name', 'x'] } }],
    ['lines', { type: 'linechart', collection, attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' } }],
    ['cells', { type: 'heatmatrix', collection, attributes: { axis: ['name', 'kind'], color: '@transform' }, transform: { preset: 'binning-2d' } }],
    ['lanes', { type: 'parallel-coordinates', collection, attributes: { axis: ['x', 'y'] } }],
];

beforeAll(() => {
    for (const [id, config] of plots) {
        const div = document.createElement('div');
        div.id = id;
        document.body.appendChild(div);
        new AutkPlot(div, config);
    }
});

describe('Plots in one page', () => {
    it('draws each plot in its own container', () => {
        for (const [id] of plots) {
            expect(document.getElementById(id)?.querySelectorAll('svg').length).toBe(1);
        }
    });

    it('preserves classes added by the host on redraw', () => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const plot = new AutkPlot(div, plots[0][1]);
        const svg = div.querySelector('svg')!;
        svg.classList.add('dashboard-chart');
        plot.draw();
        expect(div.querySelector('svg')).toBe(svg);
        expect(svg.classList.contains('dashboard-chart')).toBe(true);
        plot.destroy();
        div.remove();
    });

    it('gives no element an id another element has', () => {
        const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
        expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    });

    it('lets a page-wide selector of a container reach only the plot in it', () => {
        expect(document.querySelectorAll('#plot .autkMark').length).toBe(3);
        expect(document.querySelectorAll('#plot .plot-title').length).toBe(1);
        expect(document.querySelectorAll('#plot .x.axis').length).toBe(1);
        expect(document.querySelectorAll('#plot .y.axis').length).toBe(1);
    });
});
