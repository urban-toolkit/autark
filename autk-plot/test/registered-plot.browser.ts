/**
 * Plots registered by the user: plain D3 drawing code plus SVG annotations.
 *
 * Interactions, linking, and the segregated view come from the annotations
 * alone. The generic part rules are checked on their geometry, the drawing
 * validator on one broken drawing per invariant, and a D3 treemap written as
 * a lab template against the built-in treemap: same selection, same parts.
 */

import * as d3 from 'd3';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotDefinition, PlotEventData, UnifiedPlotConfig } from '../src';

import { LAB_PLOT, plotDefinitionOf, plotLabConfig } from '../../usecases/src/provenance/lab-plot';
import { PLOT_LAB_TEMPLATES } from '../../usecases/src/provenance/lab-plot-templates';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';
import { installSvgBBox } from './svg-geometry';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const BARS = { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' as const } };

/** Bars of category-value rows, drawn as user code would. */
function bars(name: string, part?: string): PlotDefinition {
    return {
        name,
        draw({ group, rows, width, height }) {
            const x = d3.scaleBand(rows.map(r => String(r.label)), [0, width]);
            const y = d3.scaleLinear([0, d3.max(rows, r => Number(r.value)) ?? 1], [height, 0]);
            const marks = group.selectAll('rect').data(rows).join('rect')
                .attr('class', 'autkMark')
                .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
                .attr('y', r => y(Number(r.value))).attr('height', r => height - y(Number(r.value)));
            if (part) marks.attr('data-autk-part', part);
        },
    };
}

/** One dot per row, for one-to-one plots. */
const DOTS: PlotDefinition = {
    name: 'dots',
    draw({ group, rows, width, value }) {
        const x = d3.scaleLinear(d3.extent(rows, r => Number(value(r))) as [number, number], [0, width]);
        group.selectAll('circle').data(rows).join('circle')
            .attr('class', 'autkMark').attr('cx', r => x(Number(value(r)))).attr('cy', 50).attr('r', 4);
    },
};

const registered: string[] = [];
function register(definition: PlotDefinition): PlotDefinition {
    next.registerPlot(definition);
    registered.push(definition.name);
    return definition;
}

function mount(config: Omit<UnifiedPlotConfig, 'type' | 'collection'>, collection = regions()) {
    const div = document.createElement('div');
    document.body.append(div);
    const plot = new next.AutkPlot(div, { type: 'registered', collection, width: 480, height: 280, ...config } as UnifiedPlotConfig);
    const rows = () => plot.instance['_data'] as unknown as AutkDatum[];
    const marks = () => Array.from(div.querySelectorAll<SVGElement>('.autkMark'));
    const partials = () => Array.from(div.querySelectorAll<SVGElement>('.autkPartial'));
    return { div, plot, rows, marks, partials };
}

beforeAll(() => installSvgBBox());
afterEach(() => {
    registered.splice(0).forEach(name => next.unregisterPlot(name));
    next.unregisterPlot(LAB_PLOT);
    document.body.innerHTML = '';
});

describe('registry', () => {
    test('a name is registered once; unknown names and bad definitions are rejected clearly', () => {
        register(DOTS);
        expect(() => next.registerPlot(DOTS)).toThrow(/already registered/);
        expect(() => next.registerPlot({ ...DOTS, name: ' ' })).toThrow(/non-empty name/);
        expect(() => next.registerPlot({ name: 'x', draw: 1 as never })).toThrow(/draw must be a function/);
        expect(() => mount({ plot: 'nope', attributes: { axis: ['shape_area'] } })).toThrow(/No plot is registered as "nope"/);
    });
});

describe('interactions come from the annotations', () => {
    test('a click on a mark selects the features of its row, with shares', () => {
        register(bars('bars'));
        const { plot, rows, marks } = mount({ plot: 'bars', ...BARS, events: [next.PlotEvent.CLICK] });
        let emitted: PlotEventData | undefined;
        plot.events.on(next.PlotEvent.CLICK, data => { emitted = data; });
        marks()[0].dispatchEvent(new MouseEvent('click'));
        expect(emitted!.selection.sort((a, b) => a - b)).toEqual([...rows()[0].autkIds!].sort((a, b) => a - b));
        expect(emitted!.shares).toHaveLength(rows()[0].autkIds!.length);
    });

    test('mark colors follow the selection on the mark element', () => {
        register(DOTS);
        const { plot, marks } = mount({ plot: 'dots', attributes: { axis: ['shape_area'] } });
        plot.setSelection([0]);
        const rgb = (color: string) => d3.color(color)!.formatRgb();
        expect(rgb(marks()[0].style.fill)).toBe(rgb(next.PlotStyle.provenance));
        expect(rgb(marks()[1].style.fill)).toBe(rgb(next.PlotStyle.default));
    });
});

describe('segregated view without painting code', () => {
    const selectHalf = (plot: next.AutkPlot) => plot.setSelection(regions().features.map((_f, i) => i).filter(i => i % 2 === 0));

    test('shrink: the copy is scaled by √f about the box center, so its area is f', () => {
        register(bars('bars', 'shrink'));
        const { plot, marks, partials } = mount({ plot: 'bars', ...BARS });
        selectHalf(plot);
        expect(partials().length).toBeGreaterThan(0);
        for (const copy of partials()) {
            const mark = marks().find(m => m.getAttribute('data-autk-provenance') === copy.getAttribute('data-autk-provenance'))!;
            const [selected, total] = copy.getAttribute('data-autk-units')!.split('/').map(Number);
            const scale = Number(/scale\(([^)]+)\)/.exec(copy.getAttribute('transform')!)![1]);
            expect(scale * scale).toBeCloseTo(selected / total, 12);
            expect(d3.color(copy.style.fill)!.formatRgb()).toBe(d3.color(next.PlotStyle.provenance)!.formatRgb());
            expect(copy.style.pointerEvents).toBe('none');
            expect(copy.nextElementSibling === mark || copy.previousElementSibling === mark).toBe(true);
        }
    });

    test('fill-y: the copy is clipped to the bottom fraction of its box', () => {
        register(bars('bars-y', 'fill-y'));
        const { plot, marks, partials, div } = mount({ plot: 'bars-y', ...BARS });
        selectHalf(plot);
        for (const copy of partials()) {
            const mark = marks().find(m => m.getAttribute('data-autk-provenance') === copy.getAttribute('data-autk-provenance'))!;
            const clip = div.querySelector(`${copy.getAttribute('clip-path')!.slice(4, -1)} rect`)!;
            const [selected, total] = copy.getAttribute('data-autk-units')!.split('/').map(Number);
            const height = Number(mark.getAttribute('height'));
            const bottom = Number(mark.getAttribute('y')) + height;
            expect(Number(clip.getAttribute('height'))).toBeCloseTo(height * selected / total, 9);
            expect(Number(clip.getAttribute('y')) + Number(clip.getAttribute('height'))).toBeCloseTo(bottom, 9);
        }
    });

    test('one-to-one marks show the share sent by the emitting view', () => {
        register(DOTS);
        const { plot, partials } = mount({ plot: 'dots', attributes: { axis: ['shape_area'] } });
        plot.setSelection([3], [{ feature: 3, selectedUnits: 1, totalUnits: 4 }]);
        expect(partials()).toHaveLength(1);
        expect(Number(/scale\(([^)]+)\)/.exec(partials()[0].getAttribute('transform')!)![1])).toBeCloseTo(0.5, 12);
    });

    test('drawPart replaces the rules; none skips a mark', () => {
        const custom = register({
            ...bars('custom'),
            drawPart({ group, parts }) {
                group.selectAll('line.autkPartial').data(parts).join('line')
                    .attr('class', 'autkPartial').attr('data-autk-provenance', p => p.mark);
            },
        });
        const { plot, partials } = mount({ plot: custom.name, ...BARS });
        selectHalf(plot);
        expect(partials().length).toBeGreaterThan(0);
        expect(partials().every(p => p.tagName === 'line')).toBe(true);

        register(bars('none', 'none'));
        const skipped = mount({ plot: 'none', ...BARS });
        selectHalf(skipped.plot);
        expect(skipped.partials()).toHaveLength(0);
    });
});

describe('the drawing contract refuses each broken annotation', () => {
    const check = (definition: PlotDefinition, config: Omit<UnifiedPlotConfig, 'type' | 'collection'> = BARS) =>
        next.checkPlot(definition, document.createElement('div'), { ...config, collection: regions(), width: 480, height: 280 });
    const invariants = (definition: PlotDefinition, config?: Omit<UnifiedPlotConfig, 'type' | 'collection'>) =>
        new Set(check(definition, config).violations.map(v => v.invariant));
    const drawing = (draw: PlotDefinition['draw']): PlotDefinition => ({ name: 'broken', draw });

    test('a valid drawing has no violations', () => {
        expect(check(bars('ok'))).toMatchObject({ violations: [], skipped: [] });
        expect(check(DOTS, { attributes: { axis: ['shape_area'] } })).toMatchObject({ violations: [], skipped: [] });
    });

    test('1 and 2: copies of the rows are not rendered rows, and rows are left without marks', () => {
        const report = check(drawing(({ group, rows }) => {
            group.selectAll('rect').data(rows.map(r => ({ ...r }))).join('rect').attr('class', 'autkMark');
        }));
        expect(new Set(report.violations.map(v => v.invariant))).toEqual(new Set([1, 2]));
        expect(report.skipped).toEqual([6]);
    });

    test('3: marks outside the marks group', () => {
        expect(invariants(drawing(({ svg, rows }) => {
            svg.selectAll('rect.autkMark').data(rows).join('rect').attr('class', 'autkMark');
        }))).toEqual(new Set([3]));
    });

    test('4: marks that are not SVG shapes', () => {
        expect(invariants(drawing(({ group, rows }) => {
            group.selectAll('title').data(rows).join('title').attr('class', 'autkMark');
        }))).toEqual(new Set([4]));
    });

    test('5: an unknown part rule or origin', () => {
        expect(invariants(drawing(({ group, rows }) => {
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('data-autk-part', 'grow').attr('data-autk-origin', 'center');
        }))).toEqual(new Set([5]));
    });

    test('2 and 4: geometry with NaN (D3 writes it for an undefined coordinate) is refused on marks and context', () => {
        const nan = (as: 'autkMark' | 'autkContext') => drawing(({ group, rows }) => {
            group.selectAll('rect.ok').data(rows.slice(1)).join('rect').attr('class', 'ok autkMark').attr('width', 5).attr('height', 5);
            group.append('rect').datum(rows[0]).attr('class', as).attr('width', r => Number(r.missing) * 2).attr('height', 5);
        });
        expect(invariants(nan('autkMark'))).toEqual(new Set([4]));
        expect(invariants(nan('autkContext'))).toEqual(new Set([2]));
    });

    test('3 and 4: HTML marks belong in the HTML container, and support click only', () => {
        const rowsAsDivs = (target: 'html' | 'outside'): PlotDefinition => drawing(({ html, rows }) => {
            const parent = target === 'html' ? html.node()! : html.node()!.parentElement!;
            d3.select(parent).selectAll('div.row').data(rows).join('div').attr('class', 'row autkMark');
        });
        expect(check(rowsAsDivs('html'), { ...BARS, events: [next.PlotEvent.CLICK] }).violations).toEqual([]);
        expect(invariants(rowsAsDivs('outside'), { ...BARS, events: [next.PlotEvent.CLICK] })).toEqual(new Set([3]));
        expect(invariants(rowsAsDivs('html'), { ...BARS, events: [next.PlotEvent.BRUSH] })).toEqual(new Set([4]));
    });

    test('6: a drawPart that paints nothing', () => {
        expect(invariants({ ...bars('silent'), drawPart: () => undefined })).toEqual(new Set([6]));
    });

    test('0: a draw that throws; and plots refuse a broken drawing at every draw', () => {
        expect(check(drawing(() => { throw new Error('boom'); }))).toMatchObject({ violations: [{ invariant: 0, message: 'boom' }], skipped: [1, 2, 3, 4, 5, 6] });
        register({ ...drawing(({ group, rows }) => {
            group.selectAll('rect').data(rows.slice(1)).join('rect').attr('class', 'autkMark');
        }), name: 'missing' });
        expect(() => mount({ plot: 'missing', ...BARS })).toThrow(/breaks the drawing contract: \(2\) row 0/);
    });
});

describe('plot lab templates', () => {
    const indexOf = (title: string) => PLOT_LAB_TEMPLATES.findIndex(t => t.title.startsWith(title));
    const configOf = (index: number) => {
        const t = PLOT_LAB_TEMPLATES[index];
        const { type, ...config } = plotLabConfig(t.columns, t.transform ? JSON.stringify(t.transform) : '', t.event, t.title, t.margins);
        void type;
        return config;
    };
    const checkTemplate = (index: number) =>
        next.checkPlot(plotDefinitionOf(PLOT_LAB_TEMPLATES[index].code), document.createElement('div'), { ...configOf(index), collection: withSyntheticEvents(regions()), width: 480, height: 280 });

    test('the lollipop, the line, the beeswarm, and the D3 treemap honor the contract, each with its inferred design', () => {
        const rules = ['Lollipop', 'Line', 'Box plot', 'HTML table', 'Beeswarm', 'Treemap'].map(title => {
            const report = checkTemplate(indexOf(title));
            expect(report, title).toMatchObject({ violations: [], skipped: [] });
            return report.designs.map(d => `${d.kind}:${d.rule}${d.axis ? ':' + d.axis : ''}`).join(' ');
        });
        // The lollipop point slides along its stick; the line points slide down; 1:1 dots and color-free leaves show the fraction.
        expect(rules).toEqual(['point:position:x', 'point:position:y', 'rect:members:y', 'html:glyph', 'point:glyph', 'rect:glyph']);
    });

    test('no template draws an element with NaN geometry, marks and context alike', () => {
        for (const template of PLOT_LAB_TEMPLATES) {
            const div = document.createElement('div');
            next.checkPlot(plotDefinitionOf(template.code), div, { ...configOf(PLOT_LAB_TEMPLATES.indexOf(template)), collection: withSyntheticEvents(regions()), width: 480, height: 280 });
            const broken = Array.from(div.querySelectorAll('*')).filter(e => Array.from(e.attributes).some(a => /NaN/.test(a.value)));
            expect(broken.map(e => e.outerHTML.slice(0, 80)), template.title).toEqual([]);
        }
    });

    test('the broken example is refused on invariants 1 and 2', () => {
        expect(new Set(checkTemplate(indexOf('A common mistake')).violations.map(v => v.invariant))).toEqual(new Set([1, 2]));
    });

    test('equivalence: the D3 treemap selects and paints exactly like the built-in treemap', () => {
        const config = { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' as const }, events: [next.PlotEvent.CLICK], margins: PLOT_LAB_TEMPLATES[indexOf('Treemap')].margins };
        const builtIn = document.createElement('div');
        const original = new next.AutkPlot(builtIn, { type: 'treemap', collection: regions(), width: 480, height: 280, ...config });
        next.registerPlot(plotDefinitionOf(PLOT_LAB_TEMPLATES[indexOf('Treemap')].code));
        const custom = mount({ plot: LAB_PLOT, ...config });

        const byMark = (div: HTMLElement, selector: string) => new Map(Array.from(div.querySelectorAll(selector))
            .map(e => [e.getAttribute('data-autk-provenance')!, e]));
        const originalMarks = byMark(builtIn, '.autkMark');
        const customMarks = byMark(custom.div, '.autkMark');
        expect([...customMarks.keys()].sort()).toEqual([...originalMarks.keys()].sort());

        // Same leaf rectangles.
        const box = (e: Element) => ['x', 'y', 'width', 'height'].map(a => Number(e.getAttribute(a)));
        for (const [mark, element] of customMarks) expect(box(element)).toEqual(box(originalMarks.get(mark)!));

        // A click on the same leaf emits the same selection and shares.
        const clickOn = (plot: next.AutkPlot, marks: Map<string, Element>, mark: string) => {
            let emitted: PlotEventData | undefined;
            plot.events.on(next.PlotEvent.CLICK, data => { emitted = data; });
            marks.get(mark)!.dispatchEvent(new MouseEvent('click'));
            return emitted!;
        };
        const leaf = [...originalMarks.keys()][3];
        expect(clickOn(custom.plot, customMarks, leaf)).toEqual(clickOn(original, originalMarks, leaf));

        // A selection from another view paints the same part of each leaf.
        const half = regions().features.map((_f, i) => i).filter(i => i % 3 === 0);
        original.setSelection(half);
        custom.plot.setSelection(half);
        const originalParts = byMark(builtIn, '.autkPartial');
        const customParts = byMark(custom.div, '.autkPartial');
        expect([...customParts.keys()].sort()).toEqual([...originalParts.keys()].sort());
        for (const [mark, copy] of customParts) {
            const [x, y, w, h] = box(customMarks.get(mark)!);
            const s = Number(/scale\(([^)]+)\)/.exec(copy.getAttribute('transform')!)![1]);
            const [px, py, pw, ph] = box(originalParts.get(mark)!);
            expect(copy.getAttribute('data-autk-units')).toBe(originalParts.get(mark)!.getAttribute('data-autk-units'));
            // The scaled copy of the leaf covers the built-in inner rectangle.
            expect(x + w / 2 - (w * s) / 2).toBeCloseTo(px, 9);
            expect(y + h / 2 - (h * s) / 2).toBeCloseTo(py, 9);
            expect(w * s).toBeCloseTo(pw, 9);
            expect(h * s).toBeCloseTo(ph, 9);
        }
    });
});
