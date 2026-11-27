import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotEvent } from '../src';
import type { UnifiedPlotConfig, PlotEventData } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 5, 10].map((x, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x, y: x * 10, category: ['low', 'middle', 'high'][i], series: [1, 2, 3] },
    })),
};

function brush(config: Omit<UnifiedPlotConfig, 'collection'>, event: PlotEvent.BRUSH | PlotEvent.BRUSH_X | PlotEvent.BRUSH_Y, dimension = '0') {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, {
        ...config, collection, events: [event], width: 360, height: 340,
        margins: { left: 40, right: 20, top: 40, bottom: 40 },
    });
    const instance = plot.instance as unknown as { _brushBehaviors: Map<string, d3.BrushBehavior<unknown>> };
    const behavior = instance._brushBehaviors.get(dimension)!;
    const group = d3.select(div.querySelector<SVGGElement>(dimension === '0' ? '.autkBrush' : `[autkBrushId="${dimension}"]`)!);
    const emitted: PlotEventData[] = [];
    plot.events.on(event, data => emitted.push(data));
    return {
        div,
        move(selection: d3.BrushSelection | null) {
            group.call(behavior.move, selection);
            return emitted.at(-1);
        },
    };
}

afterEach(() => document.body.replaceChildren());

describe('Brush extent', () => {
    it('reports a numeric range per brushed axis and null on clear', () => {
        const { move } = brush({ type: 'scatterplot', attributes: { axis: ['x', 'y'] } }, PlotEvent.BRUSH);
        const result = move([[0, 0], [300, 260]]);
        expect(result?.extent).toEqual({ pixels: { x: [0, 300], y: [0, 260] }, data: {
            x: { kind: 'numeric', range: [0, 10] }, y: { kind: 'numeric', range: [0, 100] },
        } });
        expect(result?.selection).toEqual([0, 1, 2]);
        expect(move(null)).toMatchObject({ selection: [], extent: null });
    });

    it('reports data extents and selects marks from the same manual domains', () => {
        const { move } = brush({ type: 'scatterplot', attributes: { axis: ['x', 'y'] },
            scales: { x: { domain: [0, 20] }, y: { domain: [0, 100] } } }, PlotEvent.BRUSH);
        expect(move([[0, 0], [90, 260]])).toMatchObject({ selection: [0, 1], extent: { data: {
            x: { kind: 'numeric', range: [0, 6] }, y: { kind: 'numeric', range: [0, 100] },
        } } });
    });

    it('reports raw overlapping bar bands, including an empty range in a gap', () => {
        const { div, move } = brush({ type: 'barchart', attributes: { axis: ['category', 'y'] },
            ticks: { x: { label: key => key.toUpperCase() } } }, PlotEvent.BRUSH_X);
        const bar = div.querySelector('rect.autkMark')!;
        const x = Number(bar.getAttribute('x'));
        expect(move([x, x + 1])?.extent).toEqual({ pixels: { x: [x, x + 1] }, data: { x: { kind: 'categorical', keys: ['low'] } } });
        expect(move([1, 2])?.extent).toEqual({ pixels: { x: [1, 2] }, data: { x: { kind: 'categorical', keys: [] } } });
    });

    it('reports raw line buckets rather than ranks or display labels', () => {
        const { move } = brush({ type: 'linechart', attributes: { axis: ['series', '@transform'] },
            transform: { preset: 'reduce-series' }, ticks: { x: { label: key => `Bucket ${key}` } } }, PlotEvent.BRUSH_X);
        expect(move([130, 170])?.extent).toEqual({ pixels: { x: [130, 170] }, data: { x: { kind: 'categorical', keys: ['1'] } } });
    });

    it('reports the named dimension of a parallel coordinates brush', () => {
        const { move } = brush({ type: 'parallel-coordinates', attributes: { axis: ['x', 'category'] } }, PlotEvent.BRUSH_Y, 'category');
        expect(move([0, 260])?.extent).toEqual({ dimension: 'category', pixels: { y: [0, 260] },
            data: { y: { kind: 'categorical', keys: ['low', 'middle', 'high'] } } });
    });

    it('still reports pixels for plots without Cartesian scales', () => {
        const { move } = brush({ type: 'pie', attributes: { axis: ['category', '@transform'] }, transform: { preset: 'binning-1d' } }, PlotEvent.BRUSH);
        expect(move([[30, 40], [60, 80]])?.extent).toEqual({ pixels: { x: [30, 60], y: [40, 80] } });
    });
});
