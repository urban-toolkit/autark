import * as d3 from 'd3';
import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotEvent, PlotStyle } from '../src';
import type { PlotEventData, UnifiedPlotConfig } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 5, 10].map((x, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x, y: x * 10 },
    })),
};
const config: UnifiedPlotConfig = {
    type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] },
    events: [PlotEvent.BRUSH, PlotEvent.CLICK, PlotEvent.HOVER],
};

const hex = (color: string) => d3.color(color)?.formatHex() ?? '';

afterEach(() => document.body.replaceChildren());

describe('A brush overlay over the marks', () => {
    it('still reports hover and click for the mark under the pointer', () => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const plot = new AutkPlot(div, config);
        const events: Array<{ type: string; data: PlotEventData }> = [];
        plot.events.on(PlotEvent.HOVER, data => events.push({ type: 'hover', data }));
        plot.events.on(PlotEvent.CLICK, data => events.push({ type: 'click', data }));

        const mark = div.querySelector<SVGElement>('circle.autkMark')!;
        const box = mark.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const overlay = div.querySelector<SVGRectElement>('.autkBrush .overlay')!;
        expect(overlay).not.toBeNull();

        overlay.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
        expect(hex(mark.style.fill)).toBe(hex(PlotStyle.hover));
        expect(events.at(-1)?.type).toBe('hover');
        expect(events.at(-1)?.data.selection).toEqual([0]);

        overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
        expect(events.at(-1)?.type).toBe('click');
        expect(plot.selection).toEqual([0]);

        div.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        expect(hex(mark.style.fill)).not.toBe(hex(PlotStyle.hover));
        expect(events.at(-1)?.data.selection).toEqual([]);
    });
});
