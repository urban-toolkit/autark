import { afterEach, describe, expect, it } from 'vitest';
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { AutkPlot } from '../src';
import type { UnifiedPlotConfig } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [10, 20, 30].map((value, i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { category: ['a', 'b', 'a'][i], group: ['u', 'v', 'u'][i], value, x: value / 2,
            series: [{ timestamp: '2020', value }, { timestamp: '2022', value: value / 2 }] },
    })),
};

function draw(config: Omit<UnifiedPlotConfig, 'collection'>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const plot = new AutkPlot(host, { collection, width: 430, height: 340, ...config });
    return { host, plot };
}

function ticks(host: HTMLElement, axis: string) {
    return Array.from(host.querySelectorAll(`${axis} .tick text`), tick => tick.textContent);
}

afterEach(() => document.body.replaceChildren());

describe('Manual plot domains', () => {
    it('orders bar categories, retains empty slots, and positions marks on the fixed numeric axis', () => {
        const { host } = draw({ type: 'barchart', attributes: { axis: ['category', 'value'] },
            scales: { x: { domain: ['missing', 'b'] }, y: { domain: [5, 25] } } });
        expect(ticks(host, '.x.axis')).toEqual(['missing', 'b']);
        expect(ticks(host, '.y.axis').at(-1)).toBe('24');
        const marks = host.querySelectorAll<SVGRectElement>('rect.autkMark');
        expect(marks.length).toBe(1);
        const height = Number(host.querySelector('.autkClear')?.getAttribute('height'));
        expect(Number(marks[0].getAttribute('y'))).toBeCloseTo(height / 4);
        expect(marks[0].closest('.autkMarksGroup')?.hasAttribute('clip-path')).toBe(true);
    });

    it('uses the scatter domains for marks and the bubble size domain for bounded radii', () => {
        const { host } = draw({ type: 'bubble', attributes: { axis: ['x', 'value', 'value'] },
            scales: { x: { domain: [0, 10] }, y: { domain: [0, 40] }, size: { domain: [15, 25] } } });
        const marks = Array.from(host.querySelectorAll('circle.autkMark'));
        const width = Number(host.querySelector('.autkClear')?.getAttribute('width'));
        expect(marks.map(mark => Number(mark.getAttribute('cx')))).toEqual([1.5 * width, width, 0.5 * width]);
        expect(Number(marks[0].getAttribute('r'))).toBe(16);
        expect(Number(marks[2].getAttribute('r'))).toBe(2);
    });

    it('uses the supplied line bucket order and leaves an empty bucket in the axis', () => {
        const { host } = draw({ type: 'linechart', attributes: { axis: ['series'] },
            transform: { preset: 'reduce-series' }, scales: { x: { domain: ['2022', '2021', '2020'] } } });
        expect(ticks(host, '.x.axis')).toEqual(['2022', '2021', '2020']);
        const points = Array.from(host.querySelectorAll('circle.autkMark'));
        expect(points.length).toBe(2);
        expect(Number(points[0].getAttribute('cx'))).toBeLessThan(Number(points[1].getAttribute('cx')));
    });

    it('keeps hexbin contents and repositions cell geometry with the configured axes', () => {
        const config: Omit<UnifiedPlotConfig, 'collection'> = {
            type: 'hexbin', attributes: { axis: ['x', 'value'] }, transform: { preset: 'binning-hex' },
        };
        const automatic = draw(config).host;
        const manual = draw({ ...config, scales: { x: { domain: [0, 50] } } }).host;
        const hexes = (host: HTMLElement) => Array.from(host.querySelectorAll<SVGPathElement>('path.autkMark'));
        expect(hexes(manual).map(mark => mark.textContent)).toEqual(hexes(automatic).map(mark => mark.textContent));
        expect(hexes(manual).map(mark => mark.getAttribute('d'))).not.toEqual(hexes(automatic).map(mark => mark.getAttribute('d')));
        expect(ticks(manual, '.x.axis').at(-1)).toBe('50');
    });

    it.each([
        ['stackedbar', { preset: 'hierarchy' }, ['category', 'group']],
        ['boxplot', { preset: 'box-stats' }, ['category', 'value']],
        ['violin', { preset: 'density' }, ['category', 'value']],
    ] as const)('orders %s categories without drawing marks for excluded groups', (type, transform, axis) => {
        const { host } = draw({ type, attributes: { axis: [...axis] }, transform,
            scales: { x: { domain: ['missing', 'b'] }, y: { domain: [0, 40] } } });
        expect(ticks(host, '.x.axis')).toEqual(['missing', 'b']);
        expect(ticks(host, '.y.axis').at(-1)).toBe('40');
        const labels = Array.from(host.querySelectorAll('.autkMark title'), title => title.textContent ?? '');
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every(label => label.startsWith('b'))).toBe(true);
    });

    it('places heat matrix cells in the configured category order on both axes', () => {
        const { host } = draw({ type: 'heatmatrix', attributes: { axis: ['category', 'group'], color: '@transform' },
            transform: { preset: 'binning-2d' }, scales: { x: { domain: ['missing', 'b'] }, y: { domain: ['v', 'u'] } } });
        expect(ticks(host, '.x.axis')).toEqual(['missing', 'b']);
        expect(ticks(host, '.y.axis')).toEqual(['v', 'u']);
        expect(Array.from(host.querySelectorAll('.autkMark title'), title => title.textContent)).toEqual(['b · v: 1']);
    });

    it('uses numeric display domains for density without changing the density values', () => {
        const config: Omit<UnifiedPlotConfig, 'collection'> = {
            type: 'density', attributes: { axis: ['value'] }, transform: { preset: 'density' },
        };
        const automatic = draw(config).host;
        const manual = draw({ ...config, scales: { x: { domain: [0, 40] }, y: { domain: [0, 0.1] } } }).host;
        const labels = (host: HTMLElement) => Array.from(host.querySelectorAll('.autkMark title'), title => title.textContent);
        expect(labels(manual)).toEqual(labels(automatic));
        expect(ticks(manual, '.x.axis').at(-1)).toBe('40');
        expect(ticks(manual, '.y.axis').at(-1)).toBe('0.1');
    });

    it('uses a domain per parallel coordinate field and hides rows with excluded categories', () => {
        const { host } = draw({ type: 'parallel-coordinates', attributes: { axis: ['category', 'value'] },
            scales: { dimensions: { category: { domain: ['missing', 'b'] }, value: { domain: [0, 40] } } } });
        expect(ticks(host, '[autkBrushId="category"]')).toEqual(['missing', 'b']);
        expect(ticks(host, '[autkBrushId="value"]').at(-1)).toBe('40');
        expect(host.querySelectorAll('path.autkMark').length).toBe(1);
    });

    it('keeps the subset bar at its data value when the view excludes zero', () => {
        const { host, plot } = draw({ type: 'barchart', attributes: { axis: ['category', '@transform'] },
            transform: { preset: 'binning-1d', options: { reducer: 'sum', value: 'value' } },
            scales: { y: { domain: [5, 35] } } });
        plot.setSelection([0]);
        const part = host.querySelector<SVGRectElement>('.autkPartial')!;
        const height = Number(host.querySelector('.autkClear')?.getAttribute('height'));
        const p = new DOMPoint(0, part.y.baseVal.value).matrixTransform(part.transform.baseVal.consolidate()!.matrix);
        expect(p.y).toBeCloseTo(d3.scaleLinear([5, 35], [height, 0])(10));
    });

    it('rejects invalid domains for the affected scale', () => {
        expect(() => draw({ type: 'scatterplot', attributes: { axis: ['x', 'value'] },
            scales: { x: { domain: [10, 0] } } })).toThrow('scales.x.domain');
    });
});
