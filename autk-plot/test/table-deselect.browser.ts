import type { FeatureCollection } from 'geojson';
import { afterEach, expect, it } from 'vitest';

import { AutkPlot, PlotEvent } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 1, 2].map((v, i) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [i, i] },
        properties: { name: `n${i}`, v },
    })),
};

afterEach(() => document.body.replaceChildren());

it('deselects a table row without moving it', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, {
        type: 'table', collection, attributes: { axis: ['name', 'v'] },
        events: [PlotEvent.CLICK],
    });
    const row = () => div.querySelectorAll('tr.autkMark')[1]!;

    row().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(plot.selection).toEqual([1]);
    expect(Array.from(div.querySelectorAll('tr.autkMark')).indexOf(row())).toBe(1);

    row().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(plot.selection).toEqual([]);
});
