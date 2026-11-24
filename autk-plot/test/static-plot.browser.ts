/**
 * A plot whose configuration enables no `events` is static (issue #94): a
 * click selects nothing, a table header does not sort, an axis name does not
 * recolor, and no mark wears the pointer cursor. It still shows a selection
 * made elsewhere (`setSelection`) and keeps its tooltips.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';
import type { PlotDefinition, UnifiedPlotConfig } from '../src';

import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { PLOTS, withReducer } from '../../usecases/src/provenance/plot';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

afterEach(() => { document.body.innerHTML = ''; });
beforeAll(() => autkPlot.registerTransform(movingAverage));
afterAll(() => autkPlot.unregisterTransform(movingAverage.name));

function mount(config: Config) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const plot = new autkPlot.AutkPlot(div, { width: 400, height: 300, collection: regions(), ...config } as UnifiedPlotConfig);
    return { div, plot, marks: () => Array.from(div.querySelectorAll<HTMLElement>('.autkMark')) };
}

const click = (element: Element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const cursors = (elements: HTMLElement[]) => [...new Set(elements.map(element => element.style.cursor))];

type Config = Omit<UnifiedPlotConfig, 'collection'>;
const pie: Config = { type: 'pie', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } };
const table: Config = { type: 'table', attributes: { axis: ['ntaname', 'shape_area'] } };
const pcoords: Config = { type: 'parallel-coordinates', attributes: { axis: ['shape_area', 'shape_leng', 'landuse'] } };

describe('a plot without events is static', () => {
    test('a click on a mark selects nothing, and no mark has the pointer cursor', () => {
        const { plot, marks } = mount(pie);
        expect(marks().length).toBeGreaterThan(0);
        expect(cursors(marks())).toEqual(['']);
        click(marks()[0]);
        expect(plot.selection).toEqual([]);
    });

    test('a click on a table header keeps the order', () => {
        const { div } = mount(table);
        const names = () => Array.from(div.querySelectorAll('tbody tr')).map(tr => tr.children[0].textContent);
        const before = names();
        click(div.querySelectorAll('th')[1]);
        expect(names()).toEqual(before);
        expect(cursors(Array.from(div.querySelectorAll<HTMLElement>('th')))).toEqual(['default']);
    });

    test('a click on an axis name of the parallel coordinates keeps the colors', () => {
        const { div, marks } = mount(pcoords);
        const colors = () => marks().map(mark => mark.style.stroke || mark.getAttribute('stroke'));
        const before = colors();
        click(div.querySelectorAll('.axis-label')[2]);
        expect(colors()).toEqual(before);
    });

    test('it still shows a selection made elsewhere, and keeps its tooltips', () => {
        const { div, plot } = mount(pie);
        expect(div.querySelectorAll('.autkMark title').length).toBeGreaterThan(0);
        plot.setSelection([0, 1, 2]);
        expect(plot.selection.length).toBeGreaterThan(0);
    });
});

describe('enabled events bring the interactions back', () => {
    test('with click, marks have the pointer cursor and a click selects', () => {
        const { plot, marks } = mount({ ...pie, events: [autkPlot.PlotEvent.CLICK] });
        expect(cursors(marks())).toEqual(['pointer']);
        click(marks()[0]);
        expect(plot.selection.length).toBeGreaterThan(0);
    });

    test('with a brush only, marks keep the default cursor', () => {
        const { marks } = mount({ ...pcoords, events: [autkPlot.PlotEvent.BRUSH_Y] });
        expect(cursors(marks())).toEqual(['']);
    });

    test('with any event, a header click sorts the table and an axis name recolors the lines', () => {
        const sorted = mount({ ...table, events: [autkPlot.PlotEvent.CLICK] });
        const areas = () => Array.from(sorted.div.querySelectorAll('tbody tr')).map(tr => Number(tr.children[1].textContent));
        click(sorted.div.querySelectorAll('th')[1]);
        expect(areas()).toEqual(areas().slice().sort((a, b) => a - b));

        const lines = mount({ ...pcoords, events: [autkPlot.PlotEvent.BRUSH_Y] });
        const colors = () => lines.marks().map(mark => mark.style.stroke || mark.getAttribute('stroke'));
        const before = colors();
        click(lines.div.querySelectorAll('.axis-label')[2]);
        expect(colors()).not.toEqual(before);
    });
});

/** The page's data: regions with their complaints, their number, and their daily series. */
function pageData() {
    const data = withSyntheticEvents(regions());
    for (const feature of data.features) {
        const sjoin = feature.properties!.sjoin as { collect: { noise: unknown[] }; count?: { noise: number } };
        sjoin.count = { noise: sjoin.collect.noise.length };
    }
    return data;
}

describe('every chart of the page', () => {
    const page = (config: (typeof PLOTS)[number]['config'], events?: autkPlot.PlotEvent[]) => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        new autkPlot.AutkPlot(div, { ...withReducer(config, 'count'), collection: pageData(), width: 480, height: 280, ...(events ? { events } : {}) } as never);
        return Array.from(div.querySelectorAll<HTMLElement>('.autkMark'));
    };

    test.each(PLOTS.map(plot => [plot.name, plot] as const))('%s: no pointer without events; with its event, the pointer only if it is a click', (_name, plot) => {
        const still = page(plot.config);
        expect(still.length).toBeGreaterThan(0);
        expect(cursors(still)).not.toContain('pointer');
        const live = page(plot.config, [plot.event]);
        expect(cursors(live)).toEqual([plot.event === autkPlot.PlotEvent.CLICK ? 'pointer' : '']);
    });
});

describe('redraws keep the behavior', () => {
    test('a sorted table keeps its pointer, its clicks and its reverse order', () => {
        const { div, plot, marks } = mount({ ...table, events: [autkPlot.PlotEvent.CLICK] });
        const areas = () => Array.from(div.querySelectorAll('tbody tr')).map(tr => Number(tr.children[1].textContent));
        click(div.querySelectorAll('th')[1]);
        click(div.querySelectorAll('th')[1]);
        expect(areas()).toEqual(areas().slice().sort((a, b) => b - a));
        expect(cursors(marks())).toEqual(['pointer']);
        click(marks()[0]);
        expect(plot.selection.length).toBe(1);
    });

    test('a static table stays static after a selection from elsewhere', () => {
        const { div, plot } = mount(table);
        plot.setSelection([0]);
        const names = () => Array.from(div.querySelectorAll('tbody tr')).map(tr => tr.children[0].textContent);
        const before = names();
        click(div.querySelectorAll('th')[0]);
        expect(names()).toEqual(before);
        expect(cursors(Array.from(div.querySelectorAll<HTMLElement>('th')))).toEqual(['default']);
    });

    test('a second click on the same axis name takes the color back; static axis names have no pointer', () => {
        const lines = mount({ ...pcoords, events: [autkPlot.PlotEvent.BRUSH_Y] });
        const colors = () => lines.marks().map(mark => mark.style.stroke || mark.getAttribute('stroke'));
        const before = colors();
        click(lines.div.querySelectorAll('.axis-label')[2]);
        click(lines.div.querySelectorAll('.axis-label')[2]);
        expect(colors()).toEqual(before);

        const still = mount(pcoords);
        expect(cursors(Array.from(still.div.querySelectorAll<HTMLElement>('.axis-label')))).toEqual(['default']);
    });
});

describe('a user plot is told whether it is interactive', () => {
    test('interactive is false with no events or an empty list, true with any event', () => {
        const seen: boolean[] = [];
        const definition: PlotDefinition = {
            name: 'tells-interactive',
            draw({ group, rows, interactive }) {
                seen.push(interactive);
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark').attr('r', 2);
            },
        };
        autkPlot.registerPlot(definition);
        try {
            const user = (events?: autkPlot.PlotEvent[]) => mount({ type: 'registered', plot: definition.name, attributes: { axis: ['shape_area'] }, ...(events ? { events } : {}) } as Config);
            user();
            user([]);
            user([autkPlot.PlotEvent.BRUSH]);
            expect(seen).toEqual([false, false, true]);
        } finally {
            autkPlot.unregisterPlot(definition.name);
        }
    });
});
