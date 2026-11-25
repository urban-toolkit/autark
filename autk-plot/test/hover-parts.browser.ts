import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { afterEach, expect, it } from 'vitest';

import { AutkPlot, PlotStyle } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 1, 2, 3].map((v, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { v, series: [{ timestamp: `2024-0${i + 1}`, value: v }] },
    })),
};
const hex = (color: string) => d3.color(color)?.formatHex() ?? '';

afterEach(() => document.body.replaceChildren());

it('shows a hovered feature as a part of its aggregated mark', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, {
        type: 'barchart', collection,
        attributes: { axis: ['v', '@transform'] },
        transform: { preset: 'binning-1d', options: { bins: 2 } },
    });
    const bar = div.querySelector<SVGElement>('rect.autkMark')!;
    const base = hex(bar.style.fill);

    plot.setHover([0]);
    const part = div.querySelector<SVGElement>('rect.autkHoverPart');
    expect(part).not.toBeNull();
    expect(hex(part!.style.fill)).toBe(hex(PlotStyle.hover));
    expect(hex(bar.style.fill)).toBe(base);
    console.log('PART', part!.outerHTML, 'BAR', bar.outerHTML);
    expect(part!.getAttribute('transform')).toContain('scale(1, 0.5)');

    plot.setHover([]);
    expect(div.querySelector('rect.autkHoverPart')).toBeNull();
});
