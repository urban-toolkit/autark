import type { FeatureCollection } from 'geojson';
import { afterEach, expect, it } from 'vitest';

import { AutkPlot, PlotEvent } from '../src';
import type { PlotHoverEventData, UnifiedPlotConfig } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [1, 2, 3].map((x, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x, y: x * 10, category: i < 2 ? 'a' : 'b' },
    })),
};

function mount(config: Omit<UnifiedPlotConfig, 'collection'>) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, { ...config, collection });
    const events: PlotHoverEventData[] = [];
    plot.events.on(PlotEvent.HOVER, event => events.push(event));
    return { div, plot, events };
}

afterEach(() => document.body.replaceChildren());

it('temporarily overrides the selection color and emits hover data without changing selection', () => {
    const { div, plot, events } = mount({ type: 'scatterplot', attributes: { axis: ['x', 'y'] }, events: [PlotEvent.HOVER] });
    const mark = div.querySelector<SVGElement>('circle.autkMark')!;
    plot.setSelection([0]);
    const selectedFill = mark.style.fill;
    mark.dispatchEvent(new MouseEvent('mouseenter'));
    expect(mark.style.fill).toBe('rgb(244, 162, 97)');
    expect(events).toEqual([{ selection: [0], datum: expect.objectContaining({ x: 1, y: 10 }) }]);
    expect(plot.selection).toEqual([0]);
    plot.setSelection([0, 1]);
    expect(mark.style.fill).toBe('rgb(244, 162, 97)');
    mark.dispatchEvent(new MouseEvent('mouseleave'));
    expect(mark.style.fill).toBe(selectedFill);
    expect(events.at(-1)).toEqual({ selection: [], datum: null });
    expect(plot.selection).toEqual([0, 1]);
});

it('reports a rendered bar and all its contributing feature IDs', () => {
    const { div, events, plot } = mount({ type: 'barchart', attributes: { axis: ['category', '@transform'] },
        transform: { preset: 'binning-1d' }, events: [PlotEvent.HOVER] });
    div.querySelector('rect.autkMark')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(events.at(-1)).toEqual({ selection: [0, 1], datum: expect.objectContaining({ label: 'a', value: 2 }) });
    plot.draw();
    expect(events.at(-1)).toEqual({ selection: [], datum: null });
});

it('colors a table row and restores its background on leave', () => {
    const { div, events } = mount({ type: 'table', attributes: { axis: ['x', 'y'] }, events: [PlotEvent.HOVER] });
    const row = div.querySelector<HTMLElement>('tr.autkMark')!;
    const background = row.style.backgroundColor;
    row.dispatchEvent(new MouseEvent('mouseenter'));
    expect(row.style.backgroundColor).toBe('rgb(244, 162, 97)');
    expect(events[0]?.datum).not.toBeNull();
    row.dispatchEvent(new MouseEvent('mouseleave'));
    expect(row.style.backgroundColor).toBe(background);
});

it('does not change marks or emit events without opt-in', () => {
    const { div, events } = mount({ type: 'scatterplot', attributes: { axis: ['x', 'y'] } });
    const mark = div.querySelector<SVGElement>('circle.autkMark')!;
    const fill = mark.style.fill;
    mark.dispatchEvent(new MouseEvent('mouseenter'));
    expect(mark.style.fill).toBe(fill);
    expect(events).toEqual([]);
});
