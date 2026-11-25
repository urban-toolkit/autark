import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotStyle } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [1, 2, 3].map((x, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] }, properties: { x, y: x * 10 },
    })),
};

const hex = (color: string) => d3.color(color)?.formatHex() ?? '';
const fill = (mark: Element) => hex((mark as SVGElement).style.getPropertyValue('fill'));
const hover = hex(PlotStyle.hover);

function host(): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

afterEach(() => document.body.replaceChildren());

describe('Hover from another view', () => {
    it('paints only the matching marks and clears without changing the selection', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });
        const marks = Array.from(div.querySelectorAll('circle.autkMark'));
        const base = fill(marks[0]!);

        plot.setHover([1]);
        expect(marks.map(fill)).toEqual([base, hover, base]);
        expect(plot.selection).toEqual([]);

        plot.setHover([]);
        expect(marks.map(fill)).toEqual([base, base, base]);
    });

    it('keeps the selection color and survives a redraw', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });
        const marks = () => Array.from(div.querySelectorAll('circle.autkMark'));
        plot.setSelection([0]);
        const selected = fill(marks()[0]!);
        const base = fill(marks()[2]!);

        plot.setHover([1]);
        expect(marks().map(fill)).toEqual([selected, hover, base]);
        plot.draw();
        expect(marks().map(fill)).toEqual([selected, hover, base]);

        plot.setHover([]);
        expect(marks().map(fill)).toEqual([selected, base, base]);
    });

    it('highlights table rows and keeps a leaving pointer from clearing the external hover', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'table', collection, attributes: { axis: ['x', 'y'] } });
        const rows = Array.from(div.querySelectorAll<HTMLElement>('tr.autkMark'));
        const base = rows[0]!.style.backgroundColor;

        plot.setHover([1]);
        expect(hex(rows[1]!.style.backgroundColor)).toBe(hover);
        plot.setHover([]);
        expect(rows[1]!.style.backgroundColor).toBe(base);

        rows[2]!.dispatchEvent(new MouseEvent('mouseenter'));
        plot.setHover([1]);
        rows[2]!.dispatchEvent(new MouseEvent('mouseleave'));
        expect(hex(rows[1]!.style.backgroundColor)).toBe(hover);
        plot.setHover([]);
    });
});

it('thickens a hovered line in parallel coordinates and restores its width', () => {
    const div = host();
    const plot = new AutkPlot(div, {
        type: 'parallel-coordinates', collection,
        attributes: { axis: ['x', 'y'] },
    });
    const line = div.querySelector<SVGPathElement>('path.autkMark')!;
    const width = line.style.strokeWidth;
    plot.setHover([0]);
    expect(line.style.strokeWidth).toBe('4');
    plot.setHover([]);
    expect(line.style.strokeWidth).toBe(width);
});
