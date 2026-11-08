// @vitest-environment happy-dom
import * as d3 from 'd3';
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotEvent } from '../src';
import type { PlotEventData, UnifiedPlotConfig } from '../src';

/** A feature for each of `rows`, holding its properties. */
function featuresOf(rows: Record<string, unknown>[]): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map((properties, i): Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties })),
    };
}

// Points from (0, 0) to (10, 100), and one series over five months.
const points = featuresOf([0, 2, 4, 6, 8, 10].map((x) => ({ x, y: 10 * x })));
const months = featuresOf([{ series: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05'].map((timestamp, i) => ({ timestamp, value: i + 1 })) }]);

/** What a test reaches inside a plot: its brush behaviors and the scales of its latest render. */
type PlotInternals = {
    _brushBehaviors: Map<string, d3.BrushBehavior<unknown>>;
    mapX: d3.ScaleLinear<number, number>;
    mapY: d3.ScaleLinear<number, number>;
};

/** Draws `config` with `event` enabled, and records the payload of each `event` it emits. */
function drawBrushable(config: UnifiedPlotConfig, event: PlotEvent) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, { ...config, events: [event] });
    const emitted: PlotEventData[] = [];
    plot.events.on(event, (data) => emitted.push(data));

    const internals = plot.instance as unknown as PlotInternals;
    const behavior = [...internals._brushBehaviors.values()][0];
    const group = d3.select(div.querySelector<SVGGElement>('.autkBrush')!);
    /** Moves the brush, as a drag would, to a box given in pixels of the marks area, or clears it with `null`. */
    const move = (selection: d3.BrushSelection | null) => group.call(behavior.move, selection);
    return { emitted, move, mapX: internals.mapX, mapY: internals.mapY };
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Brush events of a scatterplot', () => {
    const scatter: UnifiedPlotConfig = { type: 'scatterplot', collection: points, attributes: { axis: ['x', 'y'] } };

    it('carry the brushed box in data units, low to high on each axis, and the phase of the brush', () => {
        const { emitted, move, mapX, mapY } = drawBrushable(scatter, PlotEvent.BRUSH);

        // From the top left corner (x 3, y 70) to the bottom right one (x 7, y 30).
        move([[mapX(3), mapY(70)], [mapX(7), mapY(30)]]);

        expect(emitted.map((data) => data.phase)).toEqual(['start', 'brush', 'end']);
        for (const { extent } of emitted) {
            expect(extent?.x?.[0]).toBeCloseTo(3);
            expect(extent?.x?.[1]).toBeCloseTo(7);
            expect(extent?.y?.[0]).toBeCloseTo(30);
            expect(extent?.y?.[1]).toBeCloseTo(70);
        }
    });

    it('carry only the x range for a horizontal brush', () => {
        const { emitted, move, mapX } = drawBrushable(scatter, PlotEvent.BRUSH_X);

        move([mapX(1), mapX(5)]);

        const { extent, phase } = emitted[emitted.length - 1];
        expect(phase).toBe('end');
        expect(extent?.x?.[0]).toBeCloseTo(1);
        expect(extent?.x?.[1]).toBeCloseTo(5);
        expect(extent?.y).toBeUndefined();
    });

    it('carry no box, and the end phase, when the brush is cleared', () => {
        const { emitted, move, mapX, mapY } = drawBrushable(scatter, PlotEvent.BRUSH);
        move([[mapX(3), mapY(70)], [mapX(7), mapY(30)]]);
        emitted.length = 0;

        move(null);

        expect(emitted.length).toBeGreaterThan(0);
        expect(emitted.every((data) => data.phase === 'end' && data.extent === undefined)).toBe(true);
        expect(emitted[emitted.length - 1].selection).toEqual([]);
    });
});

describe('Brush events of a line chart', () => {
    const lines: UnifiedPlotConfig = {
        type: 'linechart', collection: months, attributes: { axis: ['series', '@transform'] }, transform: { preset: 'reduce-series' },
    };

    it('carry the brushed ranks and the bucket keys nearest each end, for a horizontal brush', () => {
        const { emitted, move, mapX } = drawBrushable(lines, PlotEvent.BRUSH_X);

        // From a little past February (rank 1) to a little short of April (rank 3).
        move([mapX(0.6), mapX(2.6)]);

        const { extent, phase } = emitted[emitted.length - 1];
        expect(phase).toBe('end');
        expect(extent?.x?.[0]).toBeCloseTo(0.6);
        expect(extent?.x?.[1]).toBeCloseTo(2.6);
        expect(extent?.xBucket).toEqual(['2024-02', '2024-04']);
        expect(extent?.y).toBeUndefined();
    });

    it('carry the y range too, for a 2D brush', () => {
        const { emitted, move, mapX, mapY } = drawBrushable(lines, PlotEvent.BRUSH);

        move([[mapX(-0.4), mapY(4.5)], [mapX(1.2), mapY(1.5)]]);

        const { extent } = emitted[emitted.length - 1];
        // A rank before the first bucket keeps to the first bucket.
        expect(extent?.xBucket).toEqual(['2024-01', '2024-02']);
        expect(extent?.y?.[0]).toBeCloseTo(1.5);
        expect(extent?.y?.[1]).toBeCloseTo(4.5);
    });
});
