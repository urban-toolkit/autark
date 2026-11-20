/**
 * A table answers row clicks only when its events enable click.
 *
 * From autark #134 (Fabio Miranda), the fixes of the original autk-plot carried into this one; the
 * tests run on this package as written there.
 */

import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot, PlotEvent } from '../src';

const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: ['a', 'b', 'c'].map((name, i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { name, value: i + 1 },
    })),
};

/** Draws a table of the collection and records the selection each of its click events carries. */
function drawTable(events?: PlotEvent[]) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new AutkPlot(div, { type: 'table', collection, attributes: { axis: ['name', 'value'] }, events });
    const clicks: number[][] = [];
    plot.events.on(PlotEvent.CLICK, ({ selection }) => clicks.push(selection));
    return { div, plot, clicks };
}

/** Clicks the row whose first cell reads `name`. */
function clickRow(div: HTMLElement, name: string): void {
    const row = Array.from(div.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('td')?.textContent === name);
    if (!row) {
        throw new Error(`The table has no row "${name}".`);
    }
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('Table row clicks', () => {
    it('answers no row click when its events enable none, before or after a selection', () => {
        const { div, plot, clicks } = drawTable();
        clickRow(div, 'b');
        expect(clicks).toEqual([]);
        expect(plot.selection).toEqual([]);

        plot.setSelection([0]);
        clickRow(div, 'c');
        expect(clicks).toEqual([]);
        expect(plot.selection).toEqual([0]);
    });

    it('answers row clicks when its events enable click, before and after a selection', () => {
        const { div, plot, clicks } = drawTable([PlotEvent.CLICK]);
        clickRow(div, 'b');
        expect(clicks).toEqual([[1]]);

        plot.setSelection([0]);
        clickRow(div, 'c');
        expect(clicks).toEqual([[1], [0, 2]]);
        expect(plot.selection).toEqual([0, 2]);
    });
});
