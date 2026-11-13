/**
 * One registration API for built-in and user plots.
 *
 * The bar chart, scatter plot, and bubble chart are plot definitions
 * registered like user plots. What a built-in plot needs (a transform it
 * reads, defaults, a declared segregated design, axes) is an optional field
 * of the same definition, so a user plot can use it too.
 *
 * This file installs no `getBBox`: marks are measured from their attributes,
 * as in a detached host.
 */

import * as d3 from 'd3';
import { afterEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { PartialDesign, PlotDefinition, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';
import type { Collection } from './fixtures';
import { effectiveBox } from './svg-geometry';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

/** Two categories, so no channel can be proven from three distinct values. */
const twoCategories = (): Collection => {
    const collection = regions();
    collection.features = collection.features.filter(f => f.properties!.landuse !== 'Mixed').slice(0, 5);
    collection.features.forEach((f, i) => { f.properties!.kind = i < 2 ? 'A' : 'B'; });
    return collection;
};

/** Plain D3 bars, as a user writes them. */
const userBars = (name: string, design?: PlotDefinition['design']): PlotDefinition => ({
    name,
    design,
    draw({ group, rows, width, height, value }) {
        const x = d3.scaleBand(rows.map(r => String(value(r, 0))), [0, width]);
        const y = d3.scaleLinear([0, d3.max(rows, r => Number(value(r, 1))) ?? 1], [height, 0]);
        group.selectAll('rect').data(rows).join('rect')
            .attr('class', 'autkMark')
            .attr('x', r => x(String(value(r, 0)))!).attr('width', x.bandwidth())
            .attr('y', r => y(Number(value(r, 1)))).attr('height', r => height - y(Number(value(r, 1))));
    },
});

const registered: string[] = [];
function register(definition: PlotDefinition): void {
    next.registerPlot(definition);
    registered.push(definition.name);
}
afterEach(() => {
    registered.splice(0).forEach(name => next.unregisterPlot(name));
    document.body.innerHTML = '';
});

function mount(config: Omit<UnifiedPlotConfig, 'collection'>, collection: Collection = regions()) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, { width: 400, height: 300, collection, ...config } as UnifiedPlotConfig);
    const part = (mark: Element) => effectiveBox(div.querySelector(`.autkPartial[data-autk-provenance="${mark.getAttribute('data-autk-provenance')}"]`));
    return { div, plot, marks: () => Array.from(div.querySelectorAll('.autkMark')), part };
}

const bins = { attributes: { axis: ['kind', '@transform'] }, transform: { preset: 'binning-1d' as const } };

describe('built-in plots are registered definitions', () => {
    test('their names are reserved: they cannot be replaced nor unregistered', () => {
        expect(next.hasRegisteredPlot('barchart')).toBe(true);
        expect(next.hasRegisteredPlot('scatterplot')).toBe(true);
        expect(next.hasRegisteredPlot('bubble')).toBe(true);
        expect(() => next.registerPlot(userBars('barchart'))).toThrow(/already registered/);
        expect(() => next.registerPlot(userBars('registered'))).toThrow(/already registered/);
        expect(() => next.unregisterPlot('barchart')).toThrow(/built-in plot/);
    });

    test('a built-in plot drawn through the registered type is the same plot', () => {
        const direct = mount({ type: 'barchart', ...bins }, twoCategories());
        const viaRegistry = mount({ type: 'registered', plot: 'barchart', ...bins }, twoCategories());
        const boxes = (marks: Element[]) => marks.map(effectiveBox);
        expect(boxes(viaRegistry.marks())).toEqual(boxes(direct.marks()));
        expect((direct.plot.instance as unknown as { definition: PlotDefinition }).definition.name).toBe('barchart');
    });

    test('definition fields refuse what the plot cannot read', () => {
        expect(() => mount({ type: 'barchart', attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'fold' } }))
            .toThrow('Barchart only supports the binning-1d transform preset.');
        expect(() => mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, topK: { k: 3 } }))
            .toThrow(/topK is not supported/);
        expect(() => mount({ type: 'scatterplot', attributes: { axis: ['shape_area'] } })).toThrow('Scatterplot requires two dimensions.');
        expect(() => mount({ type: 'bubble', attributes: { axis: ['shape_area', 'shape_leng'] } })).toThrow('Bubble chart requires x, y, and size attributes.');
    });

    test('the plot shows itself in a host hidden until it draws (as in the Autark gallery)', () => {
        const { div } = mount({ type: 'barchart', ...bins }, twoCategories());
        expect((div.querySelector('svg#plot') as SVGElement).style.visibility).toBe('visible');
        expect((div.querySelector('.autk-registered-html') as HTMLElement).style.visibility).toBe('visible');
    });

    test('a plot that needs a transform, or reducers that add up, refuses the others', () => {
        expect(() => mount({ type: 'heatmatrix', attributes: { axis: ['shape_area', 'landuse'] } }))
            .toThrow('Heatmatrix requires a binning-2d transform preset.');
        expect(() => mount({ type: 'waffle', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'sum', value: 'shape_area' } } }))
            .toThrow('Waffle requires the count reducer.');
        expect(() => mount({ type: 'donut', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_area' } } }))
            .toThrow('Donut chart requires an additive reducer (count or sum).');

        // A registered transform's reducer is known once it has run.
        next.registerTransform({
            name: 'avg-by-landuse',
            shape: 'category-value',
            run(rows) {
                const buckets = next.collectBuckets({ rows, bucketOf: row => String(row.landuse), valueOf: row => Number(row.shape_area), reducer: 'avg' });
                const keys = buckets.map(b => b.key);
                return {
                    rows: buckets.map(b => ({ label: b.key, value: b.value, autkIds: b.autkIds })) as never,
                    provenance: next.binnedProvenance({ rows, buckets, bins: next.indexedBins(keys, keys, 'landuse'), binLabel: 'land uses', rowKeys: keys, reducer: 'avg' }),
                };
            },
        });
        try {
            expect(() => mount({ type: 'pie', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'registered', name: 'avg-by-landuse' } }))
                .toThrow('Pie chart requires an additive reducer (count or sum).');
        } finally {
            next.unregisterTransform('avg-by-landuse');
        }
    });

    test('defaults fill only what the configuration leaves unset', () => {
        const { div } = mount({ type: 'barchart', ...bins, labels: { axis: ['kind', 'regions'] } }, twoCategories());
        expect(div.querySelector('#plotTitle')?.textContent).toBe('Distribution');
        expect(div.querySelector('#axisY .axis-label')?.textContent).toBe('regions');
    });
});

describe('the drawing context gives built-in helpers to every plot', () => {
    test('axes are drawn under the marks group, with the configured labels and formats', () => {
        register({
            name: 'axes',
            draw({ group, rows, width, height, value, axisX, axisY, format }) {
                const x = d3.scaleLinear([0, 1e6], [0, width]);
                axisX(d3.axisBottom(x).ticks(2).tickFormat(format(0, '~s')));
                axisY(d3.axisLeft(d3.scaleLinear([0, 1], [height, 0])));
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                    .attr('cx', r => x(Number(value(r)))).attr('cy', 10).attr('r', 3);
            },
        });
        const { div } = mount({ type: 'registered', plot: 'axes', attributes: { axis: ['shape_area', 'shape_leng'] }, labels: { axis: ['Area', 'Length'] } });
        const children = Array.from(div.querySelector('svg')!.children).map(c => c.id || c.getAttribute('class'));
        expect(children.indexOf('axisX')).toBeLessThan(children.indexOf('autkBrush autkMarksGroup'));
        expect(children.indexOf('axisY')).toBeLessThan(children.indexOf('autkBrush autkMarksGroup'));
        expect(div.querySelector('#axisX .axis-label')?.textContent).toBe('Area');
        expect(div.querySelector('#axisY .axis-label')?.textContent).toBe('Length');
        expect(Array.from(div.querySelectorAll('#axisX .tick text')).map(t => t.textContent)).toEqual(['0', '500k', '1M']);
    });

    test('a plot sizes its transform to the drawing area, reads its result, and adjusts the color domain', () => {
        let seen: { radius?: number; preset?: string } = {};
        const domains: [number, number][] = [];
        register({
            name: 'hexes',
            transforms: ['binning-hex'],
            transformOptions: area => area,
            colorDomain: domain => { domains.push(domain); return [domain[0], domain[1] * 2]; },
            draw({ group, rows, transform }) {
                if (transform?.preset === 'binning-hex') seen = { radius: transform.radius, preset: transform.preset };
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                    .attr('cx', r => Number(r.cx)).attr('cy', r => Number(r.cy)).attr('r', 3);
            },
        });
        const { marks } = mount({
            type: 'registered', plot: 'hexes', attributes: { axis: ['shape_area', 'shape_leng'] },
            transform: { preset: 'binning-hex', options: { radius: 12 } }, margins: { left: 0, right: 0, top: 0, bottom: 0 },
        });
        expect(seen).toEqual({ radius: 12, preset: 'binning-hex' });
        // Binned in the 400 × 300 drawing area: every center inside it.
        for (const mark of marks()) {
            expect(Number(mark.getAttribute('cx'))).toBeLessThanOrEqual(400);
            expect(Number(mark.getAttribute('cy'))).toBeLessThanOrEqual(300);
        }
        expect(domains).toHaveLength(1);
    });

    test('partRange tells where parts lie: under their row (count, sum), or anywhere in the reduced values (avg)', () => {
        let seen: next.PlotDrawContext['partRange'];
        register({ ...userBars('peek'), draw(context) { seen = context.partRange; userBars('peek').draw(context); } });
        mount({ type: 'registered', plot: 'peek', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } } });
        const lengths = regions().features.map(f => Number(f.properties!.shape_leng));
        expect(seen).toEqual({ additive: false, extent: [expect.closeTo(Math.min(...lengths)), expect.closeTo(Math.max(...lengths))] });
        mount({ type: 'registered', plot: 'peek', ...bins }, twoCategories());
        expect(seen).toEqual({ additive: true });
        // Rows that are features have no parts to fit.
        mount({ type: 'registered', plot: 'peek', attributes: { axis: ['landuse', 'shape_leng'] } });
        expect(seen).toBeUndefined();
    });
});

describe('a declared design is the same for built-in and user plots', () => {
    test('with two bars the channel cannot be inferred, so an undeclared plot falls back to the glyph', () => {
        register(userBars('inferred'));
        const { plot, marks, part } = mount({ type: 'registered', plot: 'inferred', ...bins }, twoCategories());
        plot.setSelection([0]);
        expect((plot.instance as unknown as { partialDesigns: PartialDesign[] }).partialDesigns[0].rule).toBe('glyph');
        const [bar, box] = [effectiveBox(marks()[0])!, part(marks()[0])!];
        expect(box.width).toBeLessThan(bar.width);
    });

    test('the built-in bar chart declares its channel: a slice from the base, whatever the number of bars', () => {
        const { plot, marks, part } = mount({ type: 'barchart', ...bins }, twoCategories());
        plot.setSelection([0]);
        const [bar, box] = [effectiveBox(marks()[0])!, part(marks()[0])!];
        expect(box.width).toBeCloseTo(bar.width);
        expect(box.y + box.height).toBeCloseTo(bar.y + bar.height);
        expect(box.height).toBeCloseTo(bar.height / 2);
    });

    test('a user plot declaring the same design draws the same parts', () => {
        register(userBars('declared', { rect: { rule: 'length', axis: 'y', anchor: 'end' } }));
        const { plot, marks, part } = mount({ type: 'registered', plot: 'declared', ...bins }, twoCategories());
        plot.setSelection([0]);
        const [bar, box] = [effectiveBox(marks()[0])!, part(marks()[0])!];
        expect(box.height).toBeCloseTo(bar.height / 2);
        expect(box.y + box.height).toBeCloseTo(bar.y + bar.height);
    });

    test('in a cell colored by its value, a subset statistic is a half-size cell of the statistic color', () => {
        // Equal cells, as a user writes them: no channel in the geometry, so the glyph rule is inferred.
        register({
            name: 'cells',
            draw({ group, rows, width, value }) {
                const x = d3.scaleBand(rows.map(r => `${value(r, 0)}|${value(r, 1)}`), [0, width]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('x', r => x(`${value(r, 0)}|${value(r, 1)}`)!).attr('y', 0)
                    .attr('width', x.bandwidth()).attr('height', 40);
            },
        });
        const config = (reducer: 'count' | 'avg') => ({
            type: 'registered' as const, plot: 'cells', attributes: { axis: ['shape_area', 'landuse'], color: '@transform' },
            transform: { preset: 'binning-2d' as const, options: { binsX: 2, reducer, value: 'shape_leng' } },
        });

        const avg = mount(config('avg'));
        avg.plot.setSelection([0]);
        const mark = avg.marks().find(m => avg.div.querySelector(`.autkPartial[data-autk-provenance="${m.getAttribute('data-autk-provenance')}"]`))!;
        const cell = avg.div.querySelector<SVGElement>(`.autkPartial[data-autk-provenance="${mark.getAttribute('data-autk-provenance')}"]`)!;
        expect((avg.plot.instance as unknown as { partialDesigns: PartialDesign[] }).partialDesigns[0].rule).toBe('glyph');
        expect(avg.part(mark)!.width).toBeCloseTo(effectiveBox(mark)!.width / 2);
        expect(avg.part(mark)!.height).toBeCloseTo(20);
        // Outlined as the selection (the highlight, darker), since its data color alone does not set it apart.
        const highlight = d3.color((avg.plot.instance as unknown as { highlightColor: string }).highlightColor)!.formatHex();
        expect(d3.color(cell.style.stroke)!.formatHex()).toBe(next.PlotStyle.provenanceStroke);
        expect(cell.style.strokeWidth).toBe('1');
        expect(d3.color(cell.style.fill)!.formatHex()).not.toBe(highlight);
        expect(cell.style.fill).not.toBe((mark as SVGElement).style.fill);

        // Count: the part is a share of the cell, in the highlight color, with the cell's outline.
        const count = mount(config('count'));
        count.plot.setSelection([0]);
        const share = count.div.querySelector<SVGElement>('.autkPartial')!;
        expect(d3.color(share.style.fill)!.formatHex()).toBe(highlight);
        expect(share.style.strokeWidth).toBe('');

        // Avg with uncolored cells (a 1D binning does not color by value): no channel shows the statistic, so the glyph shows the share of units, as for count.
        const plain = mount({ type: 'registered', plot: 'cells', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } } });
        plain.plot.setSelection([0]);
        const plainMark = plain.marks().find(m => plain.part(m))!;
        const plainPart = plain.div.querySelector<SVGElement>(`.autkPartial[data-autk-provenance="${plainMark.getAttribute('data-autk-provenance')}"]`)!;
        const units = plainPart.getAttribute('data-autk-units')!.split('/').map(Number);
        expect(units[0]).toBeLessThan(units[1]);
        const [whole, inner] = [effectiveBox(plainMark)!, plain.part(plainMark)!];
        expect(inner.width * inner.height).toBeCloseTo(whole.width * whole.height * units[0] / units[1]);
        expect(d3.color(plainPart.style.fill)!.formatHex()).toBe(highlight);
        expect(plainPart.style.strokeWidth).toBe('');
    });

    test('in a mark whose area encodes the value, a subset statistic is a copy of area statistic/value', () => {
        register({
            name: 'disks',
            design: { point: { rule: 'area' } },
            draw({ group, rows, width, value }) {
                const x = d3.scaleBand(rows.map(r => String(value(r, 0))), [0, width]);
                const r = d3.scaleSqrt([0, d3.max(rows, row => Number(value(row, 1))) || 1], [0, 30]);
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                    .attr('cx', row => x(String(value(row, 0)))! + x.bandwidth() / 2).attr('cy', 40)
                    .attr('r', row => r(Number(value(row, 1))));
            },
        });
        const { plot, marks, part } = mount({
            type: 'registered', plot: 'disks', attributes: { axis: ['landuse', '@transform'] },
            transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } },
        });
        plot.setSelection([0]);
        const mark = marks().find(m => part(m))!;
        const [disk, inner] = [effectiveBox(mark)!, part(mark)!];
        const length = Number(regions().features[0].properties!.shape_leng);
        const row = (mark as unknown as { __data__: { value: number } }).__data__;
        expect((inner.width * inner.height) / (disk.width * disk.height)).toBeCloseTo(length / row.value);
        expect(inner.x + inner.width / 2).toBeCloseTo(disk.x + disk.width / 2);
    });

    test('a subset statistic (avg) is an inner bar half as wide, at the statistic', () => {
        const { plot, marks, part, div } = mount({ type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } } });
        plot.setSelection([0]);
        const mark = marks().find(m => div.querySelector(`.autkPartial[data-autk-provenance="${m.getAttribute('data-autk-provenance')}"]`))!;
        const [bar, box] = [effectiveBox(mark)!, part(mark)!];
        expect(box.width).toBeCloseTo(bar.width / 2);
        expect(box.x + box.width / 2).toBeCloseTo(bar.x + bar.width / 2);
        const length = Number(regions().features[0].properties!.shape_leng);
        const row = (mark as unknown as { __data__: { value: number } }).__data__;
        expect(box.height / bar.height).toBeCloseTo(length / row.value);
    });
});

describe('what wave 2 needed is open to user plots too', () => {
    test('marks are colored by a row field, or by the base color the plot gives, when the configuration sets no color', () => {
        register({
            name: 'tiles',
            colorAttribute: 'value',
            draw({ group, rows, width }) {
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('x', (_r, i) => i * (width / rows.length)).attr('y', 0).attr('width', width / rows.length).attr('height', 20);
            },
        });
        const tiles = mount({ type: 'registered', plot: 'tiles', ...bins, attributes: { axis: ['landuse', '@transform'] } });
        expect(new Set(tiles.marks().map(m => (m as SVGElement).style.fill)).size).toBeGreaterThan(1);

        register({ ...userBars('shaded'), baseColor: rows => row => (row === rows[0] ? 'rgb(17, 17, 17)' : 'rgb(238, 238, 238)') });
        const shaded = mount({ type: 'registered', plot: 'shaded', ...bins, events: [next.PlotEvent.CLICK] }, twoCategories());
        expect(shaded.marks().map(m => (m as SVGElement).style.fill)).toEqual(['rgb(17, 17, 17)', 'rgb(238, 238, 238)']);
        // A selected mark is highlighted whatever its base color.
        shaded.marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect((shaded.marks()[0] as SVGElement).style.fill).not.toBe('rgb(17, 17, 17)');
    });

    test('a plot gives the members scale from its drawing, and adds to the automatic dots', () => {
        register({
            name: 'boxes',
            transforms: ['box-stats'],
            draw({ group, rows, width, height }) {
                const x = d3.scaleBand(rows.map(r => String(r.category)), [0, width]).padding(0.3);
                const y = d3.scaleLinear([0, d3.max(rows, r => Number(r.whiskerHigh)) ?? 1], [height, 0]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('x', r => x(String(r.category))!).attr('width', x.bandwidth())
                    .attr('y', r => y(Number(r.q3))).attr('height', r => y(Number(r.q1)) - y(Number(r.q3)));
                return { design: { rect: { rule: 'members', axis: 'y', scale: { a: y(0), k: y(1) - y(0), fields: ['q1', 'q3'] } } } };
            },
            drawPart({ group, drawAuto }) {
                drawAuto();
                group.selectAll('.autkPartial').attr('data-checked', 'yes');
            },
        });
        const { plot, div } = mount({ type: 'registered', plot: 'boxes', attributes: { axis: ['landuse', 'shape_area'] }, transform: { preset: 'box-stats' } });
        plot.setSelection([0, 1]);
        const dots = Array.from(div.querySelectorAll<SVGCircleElement>('.autkPartial'));
        expect(dots).toHaveLength(2);
        const y = (dot: Element) => Number(dot.getAttribute('cy'));
        const area = (feature: number) => Number(regions().features[feature].properties!.shape_area);
        const [a, b] = dots.sort((p, q) => Number(p.getAttribute('data-autk-feature')) - Number(q.getAttribute('data-autk-feature')));
        // Linear in the value: the two dots and the scale agree.
        expect(Number(a.getAttribute('data-autk-value'))).toBe(area(0));
        expect((y(a) - y(b)) / (area(0) - area(1))).toBeLessThan(0);
        expect(a.getAttribute('data-checked')).toBe('yes');
        expect(d3.color(a.style.stroke)!.formatHex()).toBe(next.PlotStyle.provenanceStroke);
        expect(a.querySelector('title')!.textContent).toMatch(/^feature 0: /);
    });

    test('a row produced by no feature (a zero density) needs no mark', () => {
        register({
            name: 'strips',
            transforms: ['density'],
            draw({ group, rows, width }) {
                group.selectAll('rect').data(rows.filter(r => Number(r.value) > 0)).join('rect').attr('class', 'autkMark')
                    .attr('x', 0).attr('y', (_r, i) => i).attr('width', r => Number(r.value) * width).attr('height', 1);
            },
        });
        const config = { type: 'registered' as const, plot: 'strips', attributes: { axis: ['shape_leng'] }, transform: { preset: 'density' as const } };
        const { plot } = mount(config);
        const rows = plot.instance['_data'] as unknown as { value: number; autkIds: number[] }[];
        expect(rows.some(r => r.value === 0 && r.autkIds.length === 0)).toBe(true);
    });
});

describe('x tick labels that collide are turned (the Pareto chart of districts)', () => {
    /** Text boxes as a browser measures them: 7 px per character, centered on the tick. */
    function measureTicks(): () => void {
        const original = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const tick = this.parentElement;
            if (this.tagName.toLowerCase() !== 'text' || !tick?.classList.contains('tick')) return new DOMRect(0, 0, 0, 0);
            const x = Number(/translate\(([-\d.]+)/.exec(tick.getAttribute('transform') ?? '')?.[1] ?? 0);
            const width = (this.textContent ?? '').length * 7;
            return new DOMRect(x - width / 2, 0, width, 12);
        };
        return () => { Element.prototype.getBoundingClientRect = original; };
    }

    test('labels wider than their band are turned 45°; labels with room stay level', () => {
        const restore = measureTicks();
        try {
            const crowded = mount({ type: 'pareto', attributes: { axis: ['cdta2020'] }, transform: { preset: 'cumulative' }, width: 300 });
            const turned = Array.from(crowded.div.querySelectorAll('#axisX .tick text'));
            expect(turned.length).toBeGreaterThan(1);
            expect(turned.every(text => text.getAttribute('transform') === 'rotate(-45)')).toBe(true);

            const roomy = mount({ type: 'pareto', attributes: { axis: ['landuse'] }, transform: { preset: 'cumulative' }, width: 900 });
            expect(Array.from(roomy.div.querySelectorAll('#axisX .tick text')).some(text => text.getAttribute('transform'))).toBe(false);
        } finally {
            restore();
        }
    });
});

describe('what wave 4 needed is open to user plots too', () => {
    test('a drawing made only of HTML (the table) has no SVG: its title is HTML, and a header click sorts it', () => {
        const { div } = mount({ type: 'table', attributes: { axis: ['ntaname', 'shape_area'] }, labels: { title: 'Regions' }, events: [next.PlotEvent.CLICK] });
        expect(div.querySelector('svg')).toBeNull();
        expect(div.querySelector('#plotTitle')!.textContent).toBe('Regions');
        const areas = () => Array.from(div.querySelectorAll('tbody tr')).map(tr => Number(tr.children[1].textContent));
        div.querySelectorAll('th')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(areas()).toEqual(areas().slice().sort((a, b) => a - b));
        div.querySelectorAll('th')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(areas()).toEqual(areas().slice().sort((a, b) => b - a));
        // A clicked row goes on top (arrange), with readable text on the highlight.
        const row = div.querySelectorAll<HTMLElement>('tbody tr')[7];
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(div.querySelector('tbody tr')).toBe(row);
        expect(row.style.color).not.toBe('');
    });

    test('a part looks like a highlighted mark (markStyle), and a plot may brush on areas of its own', () => {
        register({
            ...userBars('translucent'),
            markStyle: (_row, highlighted) => ({ 'fill-opacity': highlighted ? 1 : 0.3 }),
        });
        const bars = mount({ type: 'registered', plot: 'translucent', ...bins }, twoCategories());
        expect((bars.marks()[0] as SVGElement).style.fillOpacity).toBe('0.3');
        bars.plot.setSelection([0]);
        expect((bars.div.querySelector('.autkPartial') as SVGElement).style.fillOpacity).toBe('1');

        register({
            name: 'two-axes',
            draw({ svg, group, rows, height, margins }) {
                group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark').attr('cx', 10).attr('cy', (_r, i) => i % height).attr('r', 2);
                svg.selectAll('g.axis-area').data(['a', 'b']).join('g').attr('class', 'axis-area autkBrush').attr('autkBrushId', d => d)
                    .attr('transform', (_d, i) => `translate(${margins.left + 10 + i * 100}, ${margins.top})`);
            },
        });
        const axes = mount({ type: 'registered', plot: 'two-axes', attributes: { axis: ['shape_area'] }, events: [next.PlotEvent.BRUSH_Y] });
        expect(axes.div.querySelector('.autkMarksGroup')!.classList.contains('autkBrush')).toBe(false);
        expect(axes.div.querySelectorAll('.autkBrush')).toHaveLength(2);
    });
});
