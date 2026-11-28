/**
 * Plots registered by the user: plain D3 drawing code plus SVG annotations.
 *
 * Interactions, linking, and the segregated view come from the annotations
 * alone. The generic part rules are checked on their geometry, the drawing
 * validator on one broken drawing per invariant, and a treemap written in
 * plain D3 against the built-in treemap: same selection, same parts.
 */

import * as d3 from 'd3';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';
import * as geometry from '../src/plots/partial-design';
import type { AutkDatum, PlotDefinition, PlotEventData, UnifiedPlotConfig } from '../src';

import { LAB_PLOT, plotDefinitionOf, plotLabConfig, transformConfigOf, transformFields } from '../../usecases/src/provenance/lab-plot';
import { PLOT_LAB_TEMPLATES } from '../../usecases/src/provenance/lab-plot-templates';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';
import { effectiveBox, installSvgBBox } from './svg-geometry';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

/** A template transform as the page gives it: through the Transform list and the options field. */
const roundTrip = (transform: Parameters<typeof transformFields>[0]) => {
    const { choice, options } = transformFields(transform);
    return transformConfigOf(choice, options);
};
const BARS = { attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' as const } };

/** A treemap in plain D3 over the rows of the hierarchy transform, written as a developer would. */
const D3_TREEMAP = `// Treemap in plain D3, over the rows of the "hierarchy" preset.
// No painting code: the parts come from the geometry, as for any user plot.
return {
  draw({ group, rows, width, height }) {
    // Tree from the rows (key, parent, level, value).
    const nodes = new Map(rows.map(r => [r.key, { row: r, children: [] }]));
    const root = { row: null, children: [] };
    rows.forEach(r => (r.parent ? nodes.get(r.parent) : root).children.push(nodes.get(r.key)));
    const depth = d3.max(rows, r => r.level + 1);

    const tree = d3.hierarchy(root, n => (n.children.length ? n.children : undefined))
      .sum(n => (n.children.length === 0 && n.row ? Math.max(0, n.row.value) : 0))
      .sort((a, b) => b.value - a.value);
    d3.treemap()
      .size([width, height])
      .paddingOuter(2)
      .paddingTop(n => (n.depth > 0 && n.depth < depth ? 14 : 2))
      .paddingInner(2)
      .round(true)(tree);

    const groups = tree.descendants().filter(n => n.data.row && n.data.row.level < depth - 1);
    group.selectAll('rect.frame').data(groups).join('rect')
      .attr('class', 'frame autkContext') // Autark: a row drawn only as context
      .attr('x', n => n.x0).attr('y', n => n.y0)
      .attr('width', n => n.x1 - n.x0).attr('height', n => n.y1 - n.y0)
      .attr('fill', '#f6f8fa').attr('stroke', '#d0d7de')
      .property('__data__', n => n.data.row);       // Autark: after the geometry, the datum becomes the row
    group.selectAll('text.frame').data(groups.filter(n => n.x1 - n.x0 > 30)).join('text')
      .attr('class', 'frame')
      .attr('x', n => n.x0 + 4).attr('y', n => n.y0 + 10)
      .style('font', '600 10px sans-serif')
      .text(n => n.data.row.label);

    const leaves = tree.leaves().filter(n => n.data.row);
    const box = new Map(leaves.map(n => [n.data.row, n]));
    group.selectAll('rect.autkMark').data(leaves.map(n => n.data.row)).join('rect') // Autark: binds the rows themselves
      .attr('class', 'autkMark')                                                     // Autark
      .attr('x', r => box.get(r).x0).attr('y', r => box.get(r).y0)
      .attr('width', r => box.get(r).x1 - box.get(r).x0)
      .attr('height', r => box.get(r).y1 - box.get(r).y0);
  },
};
`;

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
            if (part) marks.attr('data-autk-highlight', part);
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
    autkPlot.registerPlot(definition);
    registered.push(definition.name);
    return definition;
}

function mount(config: Omit<UnifiedPlotConfig, 'type' | 'collection'>, collection = regions()) {
    const div = document.createElement('div');
    document.body.append(div);
    const plot = new autkPlot.AutkPlot(div, { type: 'registered', collection, width: 480, height: 280, ...config } as UnifiedPlotConfig);
    const rows = () => plot.instance['_data'] as unknown as AutkDatum[];
    const marks = () => Array.from(div.querySelectorAll<SVGElement>('.autkMark'));
    const partials = () => Array.from(div.querySelectorAll<SVGElement>('.autkPartial'));
    return { div, plot, rows, marks, partials };
}

beforeAll(() => installSvgBBox());
afterEach(() => {
    registered.splice(0).forEach(name => autkPlot.unregisterPlot(name));
    autkPlot.unregisterPlot(LAB_PLOT);
    document.body.innerHTML = '';
});

describe('registry', () => {
    test('a name is registered once; unknown names and bad definitions are rejected clearly', () => {
        register(DOTS);
        expect(() => autkPlot.registerPlot(DOTS)).toThrow(/already registered/);
        expect(() => autkPlot.registerPlot({ ...DOTS, name: ' ' })).toThrow(/non-empty name/);
        expect(() => autkPlot.registerPlot({ name: 'x', draw: 1 as never })).toThrow(/registerPlot: "x" needs a draw function/);
        expect(() => mount({ plot: 'nope', attributes: { axis: ['shape_area'] } })).toThrow(/registeredPlot: no plot is registered as "nope"/);
    });
});

describe('interactions come from the annotations', () => {
    test('a click on a mark selects the features of its row, with shares', () => {
        register(bars('bars'));
        const { plot, rows, marks } = mount({ plot: 'bars', ...BARS, events: [autkPlot.PlotEvent.CLICK] });
        let emitted: PlotEventData | undefined;
        plot.events.on(autkPlot.PlotEvent.CLICK, data => { emitted = data; });
        marks()[0].dispatchEvent(new MouseEvent('click'));
        expect(emitted!.selection.sort((a, b) => a - b)).toEqual([...rows()[0].autkIds!].sort((a, b) => a - b));
        expect(Object.keys(emitted!.shares!)).toHaveLength(rows()[0].autkIds!.length);
    });

    test('mark colors follow the selection on the mark element', () => {
        register(DOTS);
        const { plot, marks } = mount({ plot: 'dots', attributes: { axis: ['shape_area'] } });
        plot.setSelection([0]);
        const rgb = (color: string) => d3.color(color)!.formatRgb();
        expect(rgb(marks()[0].style.fill)).toBe(rgb(autkPlot.PlotStyle.provenance));
        expect(rgb(marks()[1].style.fill)).toBe(rgb(autkPlot.PlotStyle.default));
    });
});

describe('segregated view without painting code', () => {
    const selectHalf = (plot: autkPlot.AutkPlot) => plot.setSelection(regions().features.map((_f, i) => i).filter(i => i % 2 === 0));

    /** Each partial copy with the mark it shows a part of. */
    const pairs = (marks: () => SVGElement[], partials: () => SVGElement[]) => partials().map(copy => ({
        copy, mark: marks().find(m => m.getAttribute('data-autk-provenance') === copy.getAttribute('data-autk-provenance'))!,
    }));

    test('subset render: the bar drawn again with the subset value, on the same channel and base', () => {
        register(bars('bars'));
        const { plot, marks, partials } = mount({ plot: 'bars', ...BARS });
        selectHalf(plot);
        expect(partials().length).toBeGreaterThan(0);
        for (const { copy, mark } of pairs(marks, partials)) {
            const [selected, total] = copy.getAttribute('data-autk-units')!.split('/').map(Number);
            // Scaled in height from the base: the subset's count on the plot's own scale.
            const [, sy] = /scale\(([^,]+), ([^)]+)\)/.exec(copy.getAttribute('transform')!)!.slice(1).map(Number);
            expect(sy).toBeCloseTo(selected / total, 12);
            expect(d3.color(copy.style.fill)!.formatRgb()).toBe(d3.color(autkPlot.PlotStyle.provenance)!.formatRgb());
            expect(copy.style.pointerEvents).toBe('none');
            expect(copy.nextElementSibling === mark || copy.previousElementSibling === mark).toBe(true);
        }
    });

    test('boolean: the whole mark, asked by a mark, by the plot, or by the configuration', () => {
        const whole = (copy: SVGElement, mark: SVGElement) => !copy.getAttribute('transform') && copy.getAttribute('height') === mark.getAttribute('height');

        // A mark asks for it over its family's subset render.
        register(bars('by-mark', 'boolean'));
        const byMark = mount({ plot: 'by-mark', ...BARS });
        selectHalf(byMark.plot);
        expect(byMark.partials().length).toBeGreaterThan(0);
        expect(pairs(byMark.marks, byMark.partials).every(({ copy, mark }) => whole(copy, mark))).toBe(true);

        // The plot declares it for every family.
        register({ ...bars('by-plot'), highlight: 'boolean' });
        const byPlot = mount({ plot: 'by-plot', ...BARS });
        selectHalf(byPlot.plot);
        expect(pairs(byPlot.marks, byPlot.partials).every(({ copy, mark }) => whole(copy, mark))).toBe(true);
        expect((byPlot.plot.instance as unknown as { highlightDesigns: autkPlot.HighlightDesign[] }).highlightDesigns).toMatchObject([{ kind: 'rect', mode: 'boolean' }]);

        // The configuration asks for it, over the plot's own highlight and its highlight.
        register({ ...bars('own'), highlight: ({ group, parts }) => { group.selectAll('line.autkPartial').data(parts).join('line').attr('class', 'autkPartial').attr('data-autk-provenance', p => p.mark); } });
        const byConfig = mount({ plot: 'own', ...BARS, provenance: { highlight: 'boolean' } });
        selectHalf(byConfig.plot);
        expect(byConfig.partials().length).toBeGreaterThan(0);
        expect(byConfig.partials().every(p => p.tagName === 'rect')).toBe(true);
        expect(pairs(byConfig.marks, byConfig.partials).every(({ copy, mark }) => whole(copy, mark))).toBe(true);
    });

    test('a declared highlight names a known mode, channel, and preset', () => {
        const declare = (highlight: unknown) => () => autkPlot.registerPlot({ ...bars('declared'), highlight: highlight as autkPlot.PlotHighlight });
        expect(declare({ rect: { mode: 'subset', channel: 'height' } })).toThrow(/needs a channel \(length, position, band, angle, width, area, units\), not "height"/);
        expect(declare({ rect: { mode: 'custom', preset: 'sparkle' } })).toThrow(/needs a preset \(glyph, trace, members\), not "sparkle"; a plot's own custom highlight is highlight/);
        expect(declare({ rect: { mode: 'paint' } })).toThrow(/unknown mode "paint" \(expected boolean, subset, or custom\)/);
        expect(declare({ bar: { mode: 'boolean' } })).toThrow(/unknown mark family "bar"/);
        expect(declare('partial')).toThrow(/highlight "partial" is unknown \(expected boolean, subset, glyph, trace, a highlight per mark family, or a function\)/);
        expect(declare('members')).toThrow(/members needs the scale of its mark family/);
        expect(declare(3)).toThrow(/highlight must be a word/);
        expect(autkPlot.hasRegisteredPlot('declared')).toBe(false);
    });

    test('the modes as words: subset (the default), a preset for every family, and the boolean', () => {
        const designs = (definition: PlotDefinition) => {
            register(definition);
            const { plot } = mount({ plot: definition.name, ...BARS });
            return (plot.instance as unknown as { highlightDesigns: autkPlot.HighlightDesign[] }).highlightDesigns;
        };
        // 'subset' asks for what an undeclared plot gets: the channel inferred from the geometry.
        const subset = designs({ ...bars('as-subset'), highlight: 'subset' });
        expect(subset).toMatchObject([{ kind: 'rect', mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' }]);
        expect(designs(bars('undeclared'))).toEqual(subset);
        expect(designs({ ...bars('as-glyph'), highlight: 'glyph' })).toMatchObject([{ kind: 'rect', mode: 'custom', preset: 'glyph', reason: 'declared by the plot' }]);
        expect(designs({ ...bars('as-boolean'), highlight: 'boolean' })).toMatchObject([{ kind: 'rect', mode: 'boolean' }]);
    });

    test('one-to-one marks show the share sent by the emitting view', () => {
        register(DOTS);
        const { plot, partials } = mount({ plot: 'dots', attributes: { axis: ['shape_area'] } });
        plot.setSelection([3], { 3: { feature: { selectedUnits: 1, totalUnits: 4 } } });
        expect(partials()).toHaveLength(1);
        expect(Number(/scale\(([^)]+)\)/.exec(partials()[0].getAttribute('transform')!)![1])).toBeCloseTo(0.5, 12);
    });

    test('highlight replaces the rules; none skips a mark', () => {
        const custom = register({
            ...bars('custom'),
            highlight({ group, parts }) {
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
        autkPlot.checkPlot(definition, document.createElement('div'), { ...config, collection: regions(), width: 480, height: 280 });
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

    test('5: an unknown mark highlight', () => {
        const report = check(drawing(({ group, rows }) => {
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('width', 5).attr('height', 5).attr('data-autk-highlight', 'subset');
        }));
        expect(new Set(report.violations.map(v => v.invariant))).toEqual(new Set([5]));
        expect(report.violations[0].message).toMatch(/data-autk-highlight="subset" \(expected none or boolean\)/);
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
        expect(check(rowsAsDivs('html'), { ...BARS, events: [autkPlot.PlotEvent.CLICK] }).violations).toEqual([]);
        expect(invariants(rowsAsDivs('outside'), { ...BARS, events: [autkPlot.PlotEvent.CLICK] })).toEqual(new Set([3]));
        expect(invariants(rowsAsDivs('html'), { ...BARS, events: [autkPlot.PlotEvent.BRUSH] })).toEqual(new Set([4]));
    });

    test('6: a highlight that paints nothing', () => {
        expect(invariants({ ...bars('silent'), highlight: () => undefined })).toEqual(new Set([6]));
    });

    test('0: a draw that throws; and plots refuse a broken drawing at every draw', () => {
        expect(check(drawing(() => { throw new Error('boom'); }))).toMatchObject({ violations: [{ invariant: 0, message: 'boom' }], skipped: [1, 2, 3, 4, 5, 6] });
        register({ ...drawing(({ group, rows }) => {
            group.selectAll('rect').data(rows.slice(1)).join('rect').attr('class', 'autkMark');
        }), name: 'missing' });
        expect(() => mount({ plot: 'missing', ...BARS })).toThrow(/: the drawing breaks its contract: \(2\) row 0/);
    });
});

describe('plot lab templates', () => {
    const indexOf = (title: string) => PLOT_LAB_TEMPLATES.findIndex(t => t.title.startsWith(title));
    const configOf = (index: number) => {
        const t = PLOT_LAB_TEMPLATES[index];
        const { type, ...config } = plotLabConfig(t.columns, roundTrip(t.transform), t.event, t.title, t.margins);
        void type;
        return config;
    };
    const checkTemplate = (index: number) =>
        autkPlot.checkPlot(plotDefinitionOf(PLOT_LAB_TEMPLATES[index].code), document.createElement('div'), { ...configOf(index), collection: withSyntheticEvents(regions()), width: 480, height: 280 });

    test('the D3 examples of the lab honor the contract, each with its inferred design', () => {
        const rules = ['Lollipop', 'Line', 'Box plot', 'HTML table', 'Beeswarm'].map(title => {
            const report = checkTemplate(indexOf(title));
            expect(report, title).toMatchObject({ violations: [], skipped: [] });
            return report.designs.map(d => `${d.kind}:${geometry.ruleOf(d)}${'axis' in d && d.axis ? ':' + d.axis : ''}`).join(' ');
        });
        // The lollipop point slides along its stick; the line points slide down; the boxes span their members; table rows and 1:1 dots show the fraction.
        expect(rules).toEqual(['point:position:x', 'point:position:y', 'rect:members:y', 'html:glyph', 'point:glyph']);
    });

    test('no template draws an element with NaN geometry, marks and context alike', () => {
        for (const template of PLOT_LAB_TEMPLATES) {
            const div = document.createElement('div');
            autkPlot.checkPlot(plotDefinitionOf(template.code), div, { ...configOf(PLOT_LAB_TEMPLATES.indexOf(template)), collection: withSyntheticEvents(regions()), width: 480, height: 280 });
            const broken = Array.from(div.querySelectorAll('*')).filter(e => Array.from(e.attributes).some(a => /NaN/.test(a.value)));
            expect(broken.map(e => e.outerHTML.slice(0, 80)), template.title).toEqual([]);
        }
    });

    test('the Transform list and the options field give back the transform of every template', () => {
        for (const template of PLOT_LAB_TEMPLATES) expect(roundTrip(template.transform), template.title).toEqual(template.transform);
        expect(transformFields({ preset: 'registered', name: 'moving-average', options: { halfWindow: 3 } })).toEqual({ choice: 'registered:moving-average', options: '{"halfWindow":3}' });
        expect(transformConfigOf('binning-1d', ' ')).toEqual({ preset: 'binning-1d' });
        expect(transformConfigOf('', '{"bins": 6}')).toBeNull();
        expect(() => transformConfigOf('binning-1d', '{bins')).toThrow();
        expect(() => transformConfigOf('binning-1d', '[6]')).toThrow(/JSON object/);
    });

    test('the broken example is refused on invariants 1 and 2', () => {
        expect(new Set(checkTemplate(indexOf('A common mistake')).violations.map(v => v.invariant))).toEqual(new Set([1, 2]));
    });

    test('equivalence: the D3 treemap selects and paints exactly like the built-in treemap', () => {
        const config = { attributes: { axis: ['landuse', 'cdta2020'] }, transform: { preset: 'hierarchy' as const }, events: [autkPlot.PlotEvent.CLICK], margins: { left: 10, right: 10, top: 40, bottom: 10 } };
        const builtIn = document.createElement('div');
        const original = new autkPlot.AutkPlot(builtIn, { type: 'treemap', collection: regions(), width: 480, height: 280, ...config });
        autkPlot.registerPlot(plotDefinitionOf(D3_TREEMAP));
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
        const clickOn = (plot: autkPlot.AutkPlot, marks: Map<string, Element>, mark: string) => {
            let emitted: PlotEventData | undefined;
            plot.events.on(autkPlot.PlotEvent.CLICK, data => { emitted = data; });
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
            const drawn = effectiveBox(copy)!;
            const builtInPart = effectiveBox(originalParts.get(mark))!;
            expect(copy.getAttribute('data-autk-units')).toBe(originalParts.get(mark)!.getAttribute('data-autk-units'));
            // The part of the D3 leaf covers the built-in inner rectangle.
            expect(drawn.x).toBeCloseTo(builtInPart.x, 9);
            expect(drawn.y).toBeCloseTo(builtInPart.y, 9);
            expect(drawn.width).toBeCloseTo(builtInPart.width, 9);
            expect(drawn.height).toBeCloseTo(builtInPart.height, 9);
        }
    });
});
