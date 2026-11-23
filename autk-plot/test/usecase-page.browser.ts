/**
 * The page of the provenance use case: the page reducer is applied by what each
 * plot can draw (charts of the page and of Try It Yourself alike) and named on the value axis,
 * the Try It Yourself fields follow the chosen transform and chart, and its built-in templates
 * draw what their titles say.
 */

import * as d3 from 'd3';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';

import { LAB_PLOT, optionsOfChoice, plotDefinitionOf, plotLabConfig, setupPlotLab } from '../../usecases/src/provenance/lab-plot';
import { PLOT_LAB_TEMPLATES } from '../../usecases/src/provenance/lab-plot-templates';
import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { LAB_TRANSFORM, plainMessage, projectNameNote, regionProperties, setupLab } from '../../usecases/src/provenance/lab-transform';
import type { LabPlotConfig } from '../../usecases/src/provenance/lab-transform';
import { LAB_TEMPLATES } from '../../usecases/src/provenance/lab-transform-templates';
import { shapeProblems } from '../src/transforms/registry';
import { PLOTS, withReducer } from '../../usecases/src/provenance/plot';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

const chart = (name: string) => PLOTS.find(plot => plot.name === name)!;

beforeAll(() => autkPlot.registerTransform(movingAverage));
afterAll(() => autkPlot.unregisterTransform(movingAverage.name));
afterEach(() => { if (autkPlot.hasRegisteredPlot(LAB_PLOT)) autkPlot.unregisterPlot(LAB_PLOT); });

describe('page reducer', () => {
    test('sums the perimeter and says so on the value axis', () => {
        const config = withReducer(chart('histogram').config, 'sum');
        expect(config.transform?.options).toMatchObject({ reducer: 'sum', value: 'shape_leng' });
        expect(config.labels?.axis).toEqual(['shape_area', 'sum of shape_leng']);
    });

    test('leaves counting the plots that cannot draw the reducer, from their definitions', () => {
        const waffle = PLOTS.find(plot => plot.config.type === 'waffle')!;
        expect(withReducer(waffle.config, 'sum')).toBe(waffle.config);
        const pie = PLOTS.find(plot => plot.config.type === 'pie')!;
        expect(withReducer(pie.config, 'avg')).toBe(pie.config);
        expect(withReducer(pie.config, 'sum').transform?.options).toMatchObject({ reducer: 'sum' });
    });

    test('applies to a Try It Yourself chart as to the page chart it copies', () => {
        const donut = PLOT_LAB_TEMPLATES.find(template => template.group === 'built-in' && template.title.startsWith('Donut'))!;
        autkPlot.registerPlot(plotDefinitionOf(donut.code));
        const config = plotLabConfig(donut.columns, donut.transform, donut.event, donut.chartTitle!, donut.margins, donut.topK);
        expect(withReducer(config, 'avg')).toBe(config);
        expect(withReducer(config, 'sum').transform?.options).toMatchObject({ reducer: 'sum', value: 'shape_leng' });
    });
});

describe('tooltips', () => {
    test('every mark of every chart of the page names its row on hover, except the table, which shows its values', () => {
        // The page's data: complaints per region, their number, and their daily series.
        const collection = withSyntheticEvents(regions());
        for (const feature of collection.features) {
            const sjoin = feature.properties!.sjoin as { collect: { noise: unknown[] }; count?: { noise: number } };
            sjoin.count = { noise: sjoin.collect.noise.length };
        }
        const missing: string[] = [];
        for (const plot of PLOTS) {
            if (plot.config.type === 'table') continue;
            const div = document.createElement('div');
            new autkPlot.AutkPlot(div, { ...withReducer(plot.config, 'count'), collection, width: 480, height: 280, events: [plot.event] } as never);
            const marks = Array.from(div.querySelectorAll('.autkMark'));
            if (marks.length === 0 || marks.some(mark => !mark.querySelector('title')?.textContent)) missing.push(plot.name);
        }
        expect(missing).toEqual([]);
    });
});

describe('Try It Yourself, D3 chart tab', () => {
    test('a built-in template keeps the top-k cut of its page chart', () => {
        const donut = PLOT_LAB_TEMPLATES.find(template => template.group === 'built-in' && template.title.startsWith('Donut'))!;
        expect(donut.topK).toEqual(chart('donut').config.topK);
        expect(plotLabConfig(donut.columns, donut.transform, donut.event, donut.chartTitle!, donut.margins, donut.topK).topK).toEqual(donut.topK);
    });

    test('another transform takes the options a chart of the page gives it, or none', () => {
        expect(JSON.parse(optionsOfChoice('registered:moving-average'))).toEqual({ timestamp: 'date', halfWindow: 3 });
        expect(optionsOfChoice('fold')).toBe('');
        expect(optionsOfChoice('')).toBe('');
    });

    test('code that returns no draw function is explained', () => {
        expect(() => plotDefinitionOf('return {};')).toThrow('The code must end with "return { draw }", draw being a function.');
    });
});

describe('Try It Yourself, messages and fields', () => {
    afterEach(() => {
        autkPlot.unregisterTransform(LAB_TRANSFORM);
        document.body.innerHTML = '';
    });

    /** The D3 chart tab of main.html, wired; returns helpers to drive it. */
    function plotLab() {
        document.body.innerHTML = `
            <select id="plab-template"></select>
            <label title="Fields">Fields <input id="plab-columns" /></label>
            <select id="plab-transform"></select><input id="plab-options" /><span id="plab-rows"></span>
            <select id="plab-event"><option value="click">click</option><option value="brush">brush</option></select>
            <textarea id="plab-code"></textarea>
            <button id="plab-run"></button>
            <p id="plab-message"></p><ol id="plab-checks"></ol>
            <div><ul id="plab-design"></ul></div>
            <div id="plab-plot-box"></div>`;
        const drawn: (LabPlotConfig | null)[] = [];
        setupPlotLab(regions(), config => { drawn.push(config); return undefined; });
        const element = <T extends HTMLElement>(id: string) => document.querySelector<T>(id)!;
        const change = (id: string, value: string) => {
            element<HTMLSelectElement>(id).value = value;
            element<HTMLSelectElement>(id).dispatchEvent(new Event('change'));
        };
        return { drawn, element, change, run: () => element<HTMLButtonElement>('#plab-run').click() };
    }

    test('a chart whose code was edited is titled as the person\'s, not as the template', () => {
        const lab = plotLab();
        lab.run();
        expect(lab.drawn[lab.drawn.length - 1]?.labels?.title).toBe(PLOT_LAB_TEMPLATES[0].title.replace(/ \(.*\)$/, ''));
        lab.element<HTMLTextAreaElement>('#plab-code').value += '\n// my change';
        lab.run();
        expect(lab.drawn[lab.drawn.length - 1]?.labels?.title).toBe('Your chart');
    });

    test('edited code is not replaced by another template unless the person agrees', () => {
        const lab = plotLab();
        const code = lab.element<HTMLTextAreaElement>('#plab-code');
        code.value += '\n// my change';
        const edited = code.value;
        const confirm = window.confirm;
        try {
            window.confirm = () => false;
            lab.change('#plab-template', '1');
            expect(lab.element<HTMLSelectElement>('#plab-template').value).toBe('0');
            expect(code.value).toBe(edited);
            window.confirm = () => true;
            lab.change('#plab-template', '1');
            expect(code.value).toBe(PLOT_LAB_TEMPLATES[1].code);
        } finally {
            window.confirm = confirm;
        }
    });

    test('choosing no transform takes @transform out of the fields, and the fields hint lists the region properties', () => {
        const lab = plotLab();
        expect(lab.element<HTMLInputElement>('#plab-columns').value).toContain('@transform');
        lab.change('#plab-transform', '');
        expect(lab.element<HTMLInputElement>('#plab-columns').value).not.toContain('@transform');
        expect(lab.element('#plab-columns').closest('label')!.title).toMatch(/Region properties: .*landuse/);
    });

    test('messages of the package are told in the words of the lab', () => {
        expect(plainMessage('PlotBaseData: attributes.axis[0] "nope" does not exist in the source data.', regions()))
            .toMatch(/^field 1 "nope" does not exist in the source data\. Region properties: .*ntaname/);
        expect(regionProperties(regions())).toEqual(expect.arrayContaining(['landuse', 'shape_area']));
    });

    test('a reducer with no property to reduce gives no rows, and the lab says so instead of "Contract met"', () => {
        const lab = plotLab();
        lab.change('#plab-transform', 'binning-1d');
        lab.element<HTMLInputElement>('#plab-columns').value = 'landuse, @transform';
        lab.element<HTMLInputElement>('#plab-options').value = '{"reducer": "sum"}';
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/gives no rows: nothing to draw\. .*"value": "shape_leng"/);
        expect(lab.drawn[lab.drawn.length - 1]).toBeNull();
    });

    test('the D3 tab shows the fields of the rows the drawing receives', () => {
        const lab = plotLab();
        lab.change('#plab-transform', 'binning-1d');
        expect(lab.element('#plab-rows').textContent).toBe('draw receives rows with label, value and autkIds.');
        lab.change('#plab-transform', '');
        expect(lab.element('#plab-rows').textContent).toBe('draw receives one row per region: its properties and autkIds.');
    });

    test('options that are not JSON say how JSON is written', () => {
        const lab = plotLab();
        lab.element<HTMLInputElement>('#plab-options').value = "{bins: 10}";
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/^The options are not valid JSON \(.*\): keys and text go in double quotes, as in \{"bins": 10\}\.$/);
    });

    test('a transform of events given a field with no events says which field holds them', () => {
        const lab = plotLab();
        lab.change('#plab-transform', 'binning-events');
        lab.element<HTMLInputElement>('#plab-columns').value = 'landuse, @transform';
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/gives no rows.*reads a list of events \(or a series\) per region: name it first in Fields, such as sjoin\.collect\.noise\.$/);
    });

    test('a drawing that reads a field the new transform does not give says which fields the rows have', () => {
        const lab = plotLab();
        const index = PLOT_LAB_TEMPLATES.findIndex(template => template.title.startsWith('Line of complaints per day'));
        lab.change('#plab-template', String(index));
        lab.change('#plab-transform', 'binning-1d');
        lab.element<HTMLInputElement>('#plab-columns').value = 'landuse, @transform';
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/^The drawing failed: .*The rows of this transform have label, value: does the code read another field\?$/);
    });

    test('a built-in template keeps the axis labels of its page chart while its fields are unchanged', () => {
        const lab = plotLab();
        const index = PLOT_LAB_TEMPLATES.findIndex(template => template.group === 'built-in' && template.title.includes('Area histogram'));
        lab.change('#plab-template', String(index));
        lab.run();
        expect(lab.drawn[lab.drawn.length - 1]?.labels?.axis).toEqual(chart('histogram').config.labels?.axis);
        lab.element<HTMLInputElement>('#plab-columns').value = 'shape_leng, @transform';
        lab.run();
        expect(lab.drawn[lab.drawn.length - 1]?.labels?.axis).toBeUndefined();
    });

    test('a field name that is not a region property is named in the no-rows message', () => {
        const lab = plotLab();
        lab.change('#plab-transform', 'binning-1d');
        lab.element<HTMLInputElement>('#plab-columns').value = 'landusee, @transform';
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/"landusee" is not a region property\. Region properties: .*landuse/);
    });

    test('a transform no chart of the page runs takes the options of its Transform tab template', () => {
        expect(JSON.parse(optionsOfChoice('reduce-series'))).toMatchObject({ timestamp: 'day', value: 'complaints', reducer: 'avg' });
    });

    test('edited code is told when a project would refuse its name; a template is not', () => {
        expect(projectNameNote(undefined, 'chart')).toBe(' In a project, give it a name: registerPlot needs one.');
        expect(projectNameNote('barchart', 'chart')).toBe(' In a project, "barchart" is a built-in name: registerPlot needs another one.');
        expect(projectNameNote('binning-1d', 'transform')).toBe(' In a project, "binning-1d" is a built-in name: registerTransform needs another one.');
        expect(projectNameNote('moving-average', 'transform')).toBe(' In a project, "moving-average" is already registered by this page: registerTransform needs another one.');
        expect(projectNameNote('my-bars', 'chart')).toBe('');
        const lab = plotLab();
        lab.run();
        expect(lab.element('#plab-message').textContent).toBe('Contract met: linked to the map and the 24 charts (close the drawer to see them).');
        lab.element<HTMLTextAreaElement>('#plab-code').value = lab.element<HTMLTextAreaElement>('#plab-code').value.replace('return {', "return {\n  name: 'barchart',");
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/"barchart" is a built-in name/);
    });

    test('marks that all sit at one place are pointed out: a field may not exist', () => {
        // Positions need a layout: jsdom has none, so this runs in Chrome (autark's browser tests).
        const sized = document.createElement('div');
        sized.style.width = '10px';
        document.body.append(sized);
        const layout = sized.getBoundingClientRect().width > 0;
        sized.remove();
        if (!layout) return;
        const lab = plotLab();
        lab.change('#plab-transform', '');
        lab.element<HTMLInputElement>('#plab-columns').value = 'shape_area, shape_leng';
        lab.element<HTMLTextAreaElement>('#plab-code').value = `return {
  draw({ group, rows, width, height }) {
    const y = d3.scaleLinear([0, 10], [height, 0]);
    group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
      .attr('cx', width / 2).attr('cy', d => y(d['no.such.field'])).attr('r', 3);
  },
};`;
        lab.run();
        expect(lab.element('#plab-message').textContent).toMatch(/Every mark is drawn at the same place: a field may not exist/);
    });

    test('the Fields are named as on the page in every message', () => {
        expect(plainMessage('PlotBaseData: attributes.axis must contain at least one attribute.', regions())).toBe('the Fields need at least one region property.');
    });

    test('a transform that returns no provenance is told how to build it', () => {
        document.body.innerHTML = `
            <select id="lab-template"></select>
            <input id="lab-columns" /><input id="lab-options" />
            <select id="lab-plot"></select>
            <button id="lab-run"></button>
            <textarea id="lab-code"></textarea>
            <p id="lab-message"></p>
            <ol id="lab-checks"></ol>`;
        setupLab(regions(), () => undefined);
        document.querySelector<HTMLTextAreaElement>('#lab-code')!.value = "return { shape: 'category-value', run: rows => ({ rows: [] }) };";
        document.querySelector<HTMLButtonElement>('#lab-run')!.click();
        expect(document.querySelector('#lab-message')!.textContent).toMatch(/incomplete .*binnedProvenance/);
    });
});

describe('provenance path', () => {
    test('a part of a heat matrix cell names both of its categories', () => {
        const div = document.createElement('div');
        const plot = new autkPlot.AutkPlot(div, {
            type: 'heatmatrix', collection: regions(), width: 480, height: 320, provenance: { path: 'open' },
            attributes: { axis: ['shape_area', 'landuse'], color: '@transform' }, transform: { preset: 'binning-2d' },
        } as never);
        plot.setSelection([0, 1, 2, 3, 4, 5, 6, 7]);
        const parts = div.querySelector('.autk-provenance-parts')!.textContent ?? '';
        expect(parts).toMatch(/ · (Residential|Mixed|Commercial): /);
    });
});

describe('Try It Yourself, Transform tab', () => {
    afterEach(() => {
        autkPlot.unregisterTransform(LAB_TRANSFORM);
        document.body.innerHTML = '';
    });

    test('the person\'s own transform keeps its fields when another chart is chosen', () => {
        document.body.innerHTML = `
            <select id="lab-template"></select>
            <input id="lab-columns" /><input id="lab-options" />
            <select id="lab-plot"></select>
            <button id="lab-run"></button>
            <textarea id="lab-code"></textarea>
            <p id="lab-message"></p>
            <ol id="lab-checks"></ol>`;
        setupLab(regions(), () => undefined);
        const code = document.querySelector<HTMLTextAreaElement>('#lab-code')!;
        code.value += '\n// my change';
        const columns = document.querySelector<HTMLInputElement>('#lab-columns')!;
        columns.value = 'landuse';
        const plot = document.querySelector<HTMLSelectElement>('#lab-plot')!;
        plot.value = Array.from(plot.options).map(option => option.value).find(value => value !== plot.value)!;
        plot.dispatchEvent(new Event('change'));
        expect(columns.value).toBe('landuse');
    });

    test('another chart takes its own fields, so every chart offered for a template draws it', () => {
        document.body.innerHTML = `
            <select id="lab-template"></select>
            <input id="lab-columns" /><input id="lab-options" />
            <select id="lab-plot"></select>
            <button id="lab-run"></button>
            <textarea id="lab-code"></textarea>
            <p id="lab-message"></p>
            <ol id="lab-checks"></ol>`;
        const drawn: (LabPlotConfig | null)[] = [];
        setupLab(withSyntheticEvents(regions()), config => { drawn.push(config); return undefined; });
        const select = (id: string, value: string) => {
            const element = document.querySelector<HTMLSelectElement>(id)!;
            element.value = value;
            element.dispatchEvent(new Event('change'));
        };
        for (const name of ['flows', 'density']) {
            select('#lab-template', String(LAB_TEMPLATES.findIndex(template => template.name === name)));
            const offered = Array.from(document.querySelectorAll<HTMLOptionElement>('#lab-plot option')).map(option => option.value);
            expect(offered.length, name).toBeGreaterThan(1);
            for (const plot of offered) {
                select('#lab-plot', plot);
                const page = PLOTS.find(candidate => candidate.name === plot)!;
                expect(document.querySelector<HTMLInputElement>('#lab-columns')!.value).toBe((page.config.attributes?.axis ?? []).filter(field => field !== '@transform').join(', '));
                document.querySelector<HTMLButtonElement>('#lab-run')!.click();
                expect(document.querySelector('#lab-message')!.textContent, `${name} → ${plot}`).toBe('Contract met: linked to the map and the 24 charts (close the drawer to see them).');
                // The chart actually draws the config the lab gives it.
                expect(() => new autkPlot.AutkPlot(document.createElement('div'), { ...drawn[drawn.length - 1]!, collection: withSyntheticEvents(regions()), width: 480, height: 280 } as never), `${name} → ${plot}`).not.toThrow();
            }
        }
    });
});

describe('contracts, axes, and data of the page', () => {
    afterEach(() => {
        autkPlot.unregisterTransform(LAB_TRANSFORM);
        document.body.innerHTML = '';
    });

    test('checkPlot refuses a highlight with a typo before drawing, as registerPlot does', () => {
        const report = autkPlot.checkPlot({
            name: 'typo',
            highlight: { rect: { mode: 'subset', channel: 'lenght' } } as never,
            draw: ({ group, rows }) => { group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark').attr('width', 4).attr('height', 4); },
        }, document.createElement('div'), { collection: regions(), attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' }, width: 480, height: 280 } as never);
        expect(report.violations).toEqual([{ invariant: 0, message: expect.stringMatching(/the subset highlight of rect needs a channel \(.*\), not "lenght"/) }]);
    });

    test('an axis takes the label of the field it shows: a horizontal bar chart labels its x axis with the values', () => {
        const seen: string[][] = [];
        autkPlot.registerPlot({
            name: 'horizontal-bars',
            draw({ svg, group, rows, width, height, axisX, axisY }) {
                const y = d3.scaleBand(rows.map(d => String(d.label)), [0, height]);
                const x = d3.scaleLinear([0, d3.max(rows, d => Number(d.value)) ?? 1], [0, width]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('y', d => y(String(d.label))!).attr('height', y.bandwidth()).attr('width', d => x(Number(d.value)));
                axisX(d3.axisBottom(x), 1);
                axisY(d3.axisLeft(y), 0);
                seen.push(['.x.axis', '.y.axis'].map(axis => svg.select(`${axis} .axis-label`).text()));
                svg.selectAll('.x.axis, .y.axis').remove();
                axisX(d3.axisBottom(x), 'regions');
                axisY(d3.axisLeft(y));
                seen.push(['.x.axis', '.y.axis'].map(axis => svg.select(`${axis} .axis-label`).text()));
            },
        });
        try {
            new autkPlot.AutkPlot(document.createElement('div'), {
                type: 'registered', plot: 'horizontal-bars', collection: regions(), width: 480, height: 280,
                attributes: { axis: ['landuse', '@transform'] }, labels: { axis: ['land use', 'count'] }, transform: { preset: 'binning-1d' },
            } as never);
            // By index: the label of that field; by text: the text; with neither: the field of its side.
            expect(seen).toEqual([['count', 'land use'], ['regions', 'count']]);
        } finally {
            autkPlot.unregisterPlot('horizontal-bars');
        }
    });

    test('a histogram keeps its empty range (value 0, no region); categories add none', () => {
        const rows = regions().features.map((feature, index) => ({ ...feature.properties, autkIds: [index] }));
        const ranges = autkPlot.run(rows, { preset: 'binning-1d', options: { bins: 10 } }, ['shape_area']).rows as { label: string; value: number; autkIds: number[] }[];
        expect(ranges).toHaveLength(10);
        expect(ranges.filter(row => row.autkIds.length === 0)).toEqual([expect.objectContaining({ label: '30900000-34600000', value: 0, count: 0 })]);
        const categories = autkPlot.run(rows, { preset: 'binning-1d' }, ['landuse']).rows as { autkIds: number[] }[];
        expect(categories.every(row => row.autkIds.length > 0)).toBe(true);
    });

    test('the Sankey of the page names the NTA types instead of their codes', () => {
        const regionsOfPage = withSyntheticEvents(regions());
        expect([...new Set(regionsOfPage.features.map(feature => feature.properties!.ntatype_name))].sort()).toEqual(['Park', 'Residential', 'Special area']);
        expect(PLOTS.find(plot => plot.name === 'sankey')!.config.attributes?.axis?.[0]).toBe('ntatype_name');
    });

    test('a row missing a field of its shape names only that field', () => {
        const problems = shapeProblems({ rows: [{ label: 'a', autkIds: [0] }], provenance: {} as never }, 'category-value');
        expect(problems[0]).toBe('row 0 lacks "value", required by the "category-value" shape');
    });

    test('the Transform tab asks for Fields instead of running with none', () => {
        document.body.innerHTML = `
            <select id="lab-template"></select>
            <input id="lab-columns" /><input id="lab-options" />
            <select id="lab-plot"></select>
            <button id="lab-run"></button>
            <textarea id="lab-code"></textarea>
            <p id="lab-message"></p>
            <ol id="lab-checks"></ol>`;
        setupLab(regions(), () => undefined);
        document.querySelector<HTMLInputElement>('#lab-columns')!.value = ' ';
        document.querySelector<HTMLButtonElement>('#lab-run')!.click();
        expect(document.querySelector('#lab-message')!.textContent).toBe('Name in Fields the region properties the transform reads, such as shape_area.');
    });
});
