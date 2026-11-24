/**
 * Highlight parts and contracts.
 *
 * Each test reproduces one defect fixed: a part drawn from the wrong end of a
 * flipped or negative bar, a valid annotation refused, a malformed provenance
 * that crashed the validator, an inherited key accepted as a row shape, a
 * clamped ratio, a stroke width with units, and day ids that repeat across years.
 */

import * as d3 from 'd3';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';
import * as geometry from '../src/plots/partial-design';
import type { AutkDatum, HighlightDesign, PlotDefinition, TransformDefinition, UnifiedPlotConfig } from '../src';

import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { installSvgBBox } from './svg-geometry';

const WIDTH = 400;
const HEIGHT = 200;

/** Features with a category and a signed value. */
function signed(values: [string, number][]): FeatureCollection<Geometry, GeoJsonProperties> {
    return {
        type: 'FeatureCollection',
        features: values.map(([cat, v]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { cat, v } })),
    };
}
const SUM = { attributes: { axis: ['cat', '@transform'] }, transform: { preset: 'binning-1d' as const, options: { reducer: 'sum' as const, value: 'v' } } };

const registered: string[] = [];
afterEach(() => {
    registered.splice(0).forEach(name => autkPlot.unregisterPlot(name));
    document.body.innerHTML = '';
});
beforeAll(() => installSvgBBox());

function mount(draw: PlotDefinition['draw'], collection: FeatureCollection<Geometry, GeoJsonProperties>, config: Omit<UnifiedPlotConfig, 'type' | 'collection'> = SUM) {
    const name = `parts-${registered.length}`;
    autkPlot.registerPlot({ name, draw });
    registered.push(name);
    const div = document.createElement('div');
    document.body.append(div);
    const plot = new autkPlot.AutkPlot(div, { type: 'registered', plot: name, collection, width: WIDTH + 80, height: HEIGHT + 80, margins: { left: 40, right: 40, top: 40, bottom: 40 }, ...config } as UnifiedPlotConfig);
    const designs = () => (plot.instance as unknown as { highlightDesigns: HighlightDesign[] }).highlightDesigns;
    const partOf = (mark: Element) => Array.from(div.querySelectorAll('.autkPartial')).find(p => p.getAttribute('data-autk-provenance') === mark.getAttribute('data-autk-provenance'));
    return { div, plot, designs, partOf };
}

/** Vertical extent of a rect after its own transform. */
function extentOf(element: Element): [number, number] {
    const [, , , d, , f] = geometry.ownMatrix(element);
    const y0 = d * Number(element.getAttribute('y')) + f;
    const y1 = d * (Number(element.getAttribute('y')) + Number(element.getAttribute('height'))) + f;
    return [Math.min(y0, y1), Math.max(y0, y1)];
}

describe('a channel that cannot be proven', () => {
    /** Bars of two categories: two distinct values, fewer than a fit needs. */
    const twoBars = (highlight?: autkPlot.PlotHighlight) => {
        const name = `two-bars-${registered.length}`;
        autkPlot.registerPlot({
            name,
            ...(highlight ? { highlight } : {}),
            draw({ group, rows }) {
                const x = d3.scaleBand(rows.map(r => String(r.label)), [0, WIDTH]);
                const y = d3.scaleLinear([0, 5], [HEIGHT, 0]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
                    .attr('y', r => y(Number(r.value))).attr('height', r => HEIGHT - y(Number(r.value)));
            },
        });
        registered.push(name);
        const div = document.createElement('div');
        document.body.append(div);
        const plot = new autkPlot.AutkPlot(div, { type: 'registered', plot: name, collection: signed([['a', 1], ['b', 2], ['b', 1]]), width: WIDTH + 80, height: HEIGHT + 80, margins: { left: 40, right: 40, top: 40, bottom: 40 }, ...SUM } as UnifiedPlotConfig);
        return (plot.instance as unknown as { highlightDesigns: HighlightDesign[] }).highlightDesigns;
    };

    test('falls back to the glyph preset and says so, so a subset render can be declared', () => {
        const [design] = twoBars();
        expect(design).toMatchObject({ kind: 'rect', mode: 'custom', preset: 'glyph', unproven: true });
        expect(design.reason).toMatch(/2 distinct values: a channel needs three to be proven.*declare the channel for a subset render/);
    });

    test('a declared channel draws the subset render, with no warning left', () => {
        const [design] = twoBars({ rect: { mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' } });
        expect(design).toMatchObject({ kind: 'rect', mode: 'subset', channel: 'length', reason: 'declared by the plot' });
        expect(design.unproven).toBeUndefined();
    });

    test('a one-to-one mark is never unproven: it shows a covered share, not a value', () => {
        const { designs } = mount(({ group, rows }) => {
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark').attr('width', 5).attr('height', 5);
        }, signed([['a', 1], ['b', 2]]), { attributes: { axis: ['cat', 'v'] } });
        expect(designs()).toMatchObject([{ kind: 'rect', mode: 'custom', preset: 'glyph' }]);
        expect(designs()[0].unproven).toBeUndefined();
    });
});

describe('length parts', () => {
    test('a bar flipped by its own transform keeps its part on the baseline', () => {
        const data = signed([['a', 1], ['b', 2], ['b', 1], ['c', 4], ['d', 2], ['d', 3]]);
        const { div, plot, designs, partOf } = mount(({ group, rows }) => {
            const x = d3.scaleBand(rows.map(r => String(r.label)), [0, WIDTH]);
            const h = d3.scaleLinear([0, 5], [0, HEIGHT]);
            // Drawn upwards from y = 0, then flipped onto the baseline: a common D3 idiom.
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
                .attr('y', 0).attr('height', r => h(Number(r.value)))
                .attr('transform', `translate(0, ${HEIGHT}) scale(1, -1)`);
        }, data);
        expect(designs()).toMatchObject([{ mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' }]);
        plot.setSelection([2, 4]);
        for (const mark of Array.from(div.querySelectorAll('.autkMark'))) {
            const copy = partOf(mark);
            if (copy) expect(extentOf(copy)[1]).toBeCloseTo(HEIGHT, 5);
        }
    });

    test('a negative bar grows its part from the baseline, on its own side', () => {
        const data = signed([['a', 3], ['a', 1], ['b', 2], ['c', -4], ['c', -2], ['d', -1]]);
        const baseline = HEIGHT / 2;
        const { div, plot, designs, partOf } = mount(({ group, rows }) => {
            const x = d3.scaleBand(rows.map(r => String(r.label)), [0, WIDTH]);
            const y = d3.scaleLinear([-6, 6], [HEIGHT, 0]);
            group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
                .attr('y', r => Math.min(y(Number(r.value)), y(0))).attr('height', r => Math.abs(y(Number(r.value)) - y(0)));
        }, data);
        expect(designs()).toMatchObject([{ mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' }]);
        plot.setSelection([0, 3]);
        const touches = Array.from(div.querySelectorAll('.autkMark')).map(mark => {
            const copy = partOf(mark);
            if (!copy) return null;
            const [top, bottom] = extentOf(copy);
            const negative = Number(((mark as unknown as { __data__: AutkDatum }).__data__).value) < 0;
            return negative ? top : bottom;
        }).filter((v): v is number => v !== null);
        expect(touches.length).toBe(2);
        touches.forEach(edge => expect(edge).toBeCloseTo(baseline, 5));
    });

    test('a sum with negative units elsewhere shows the selected value, even above the row value', () => {
        // Row a = 15 − 5 = 10; selecting the +15 feature is 1.5 times the row.
        const data = signed([['a', 15], ['a', -5], ['b', 4], ['c', 7], ['d', 1]]);
        const { div, plot, designs, partOf } = mount(({ group, rows }) => {
            const y = d3.scaleBand(rows.map(r => String(r.label)), [0, HEIGHT]);
            const x = d3.scaleLinear([0, 20], [0, WIDTH]);
            group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark')
                .attr('cx', r => x(Number(r.value))).attr('cy', r => y(String(r.label))!).attr('r', 4);
        }, data);
        expect(designs()).toMatchObject([{ mode: 'subset', channel: 'position', axis: 'x' }]);
        plot.setSelection([0]);
        const mark = Array.from(div.querySelectorAll('.autkMark')).find(m => (m as unknown as { __data__: AutkDatum }).__data__.label === 'a')!;
        const [, , , , dx] = geometry.ownMatrix(partOf(mark)!);
        expect(Number(mark.getAttribute('cx')) + dx).toBeCloseTo((15 / 20) * WIDTH, 9);
    });
});

describe('drawing contract', () => {
    test('marks annotated data-autk-highlight="none" are not expected to show a part', () => {
        const report = autkPlot.checkPlot({
            name: 'none',
            draw({ group, rows }) {
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark').attr('data-autk-highlight', 'none')
                    .attr('width', 5).attr('height', r => Number(r.value) * 3);
            },
        }, document.createElement('div'), { ...SUM, collection: signed([['a', 1], ['b', 2], ['c', 3]]) });
        expect(report.violations).toEqual([]);
    });

    test('stroke widths written with units ("2px") are read', () => {
        const { designs } = mount(({ group, rows }) => {
            group.selectAll('line').data(rows).join('line').attr('class', 'autkMark').attr('fill', 'none')
                .attr('x1', 0).attr('x2', WIDTH).attr('y1', (_r, i) => i * 10).attr('y2', (_r, i) => i * 10)
                .attr('stroke-width', r => `${Number(r.value) * 2}px`);
        }, signed([['a', 1], ['b', 2], ['c', 3], ['d', 5]]));
        expect(designs()).toMatchObject([{ kind: 'stroke', mode: 'subset', channel: 'width' }]);
    });
});

describe('transform contract', () => {
    const regions = signed([['a', 1], ['b', 2]]);

    test('a provenance with missing parts is reported, not a crash', () => {
        const broken: TransformDefinition = { name: 'x', shape: 'category-value', run: () => ({ rows: [], provenance: {} as never }) };
        const report = autkPlot.checkTransformReport(broken, regions);
        expect(report.violations).toEqual([{ invariant: 0, message: 'provenance needs stages, relations, rowIds, contributions as arrays' }]);
        expect(autkPlot.checkProvenance(2, [], { stages: [], relations: null } as never)[0]).toMatch(/relations, rowIds, contributions/);
    });

    test('an inherited key is not a row shape', () => {
        expect(() => autkPlot.registerTransform({ name: 'x', shape: 'toString' as never, run: () => ({ rows: [], provenance: {} as never }) })).toThrow(/unknown row shape/);
    });

    test('the moving average gives one day id per calendar day, also across years', () => {
        const rows = [
            { autkIds: [0], events: [{ date: '2024-12-30T10:00:00Z' }, { date: '2025-01-02T10:00:00Z' }] },
            { autkIds: [1], events: [{ date: '2025-12-30T10:00:00Z' }] },
        ] as unknown as AutkDatum[];
        const { provenance } = movingAverage.run(rows, { timestamp: 'date', halfWindow: 1 }, ['events']);
        expect(new Set(provenance.rowIds).size).toBe(provenance.rowIds.length);
        expect(provenance.rowIds).toContain('day:2024-12-30');
        expect(provenance.rowIds).toContain('day:2025-12-30');
    });
});

describe('declared highlights: who wins, and what the declaration keeps', () => {
    /** Mounts a whole definition (not only its draw) over the summed categories. */
    function mountDefinition(definition: Omit<PlotDefinition, 'name'>, collection: FeatureCollection<Geometry, GeoJsonProperties>, config: Omit<UnifiedPlotConfig, 'type' | 'collection'> = SUM) {
        const name = `declared-${registered.length}`;
        autkPlot.registerPlot({ name, ...definition } as PlotDefinition);
        registered.push(name);
        const div = document.createElement('div');
        document.body.append(div);
        const plot = new autkPlot.AutkPlot(div, { type: 'registered', plot: name, collection, width: WIDTH + 80, height: HEIGHT + 80, margins: { left: 40, right: 40, top: 40, bottom: 40 }, ...config } as UnifiedPlotConfig);
        return (plot.instance as unknown as { highlightDesigns: HighlightDesign[] }).highlightDesigns;
    }
    const FOUR = signed([['a', 1], ['b', 2], ['b', 1], ['c', 4], ['d', 2], ['d', 3]]);
    const LENGTH = { rect: { mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' } } as const;
    const columns: PlotDefinition['draw'] = ({ group, rows }) => {
        const x = d3.scaleBand(rows.map(r => String(r.label)), [0, WIDTH]);
        const y = d3.scaleLinear([0, 6], [HEIGHT, 0]);
        group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
            .attr('x', r => x(String(r.label))!).attr('width', x.bandwidth())
            .attr('y', r => y(Number(r.value))).attr('height', r => HEIGHT - y(Number(r.value)));
    };

    test('a highlight returned by draw is checked like a declared one', () => {
        expect(() => mountDefinition({
            draw: context => { columns(context); return { highlight: { rect: { mode: 'subset', channel: 'height' } } } as never; },
        }, FOUR)).toThrow(/the subset highlight of rect needs a channel/);
    });

    test('what draw returns wins over the definition, a word or a family alike', () => {
        const drawn: PlotDefinition['draw'] = context => { columns(context); return { highlight: LENGTH }; };
        expect(mountDefinition({ highlight: 'glyph', draw: drawn }, FOUR)).toMatchObject([{ kind: 'rect', mode: 'subset', channel: 'length' }]);
        expect(mountDefinition({ highlight: { rect: { mode: 'custom', preset: 'glyph' } }, draw: drawn }, FOUR)).toMatchObject([{ kind: 'rect', mode: 'subset', channel: 'length' }]);
    });

    test('provenance.highlight boolean in the configuration wins over draw', () => {
        const drawn: PlotDefinition['draw'] = context => { columns(context); return { highlight: LENGTH }; };
        const [design] = mountDefinition({ draw: drawn }, FOUR, { ...SUM, provenance: { highlight: 'boolean' } });
        expect(design).toMatchObject({ kind: 'rect', mode: 'boolean' });
    });

    test('a declaration the geometry agrees with keeps what it leaves out (axis, anchor, fit)', () => {
        const [design] = mountDefinition({
            highlight: { rect: { mode: 'subset', channel: 'length' } },
            draw({ group, rows }) {
                // Horizontal bars: the length is along x, from the left.
                const y = d3.scaleBand(rows.map(r => String(r.label)), [0, HEIGHT]);
                const x = d3.scaleLinear([0, 6], [0, WIDTH]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('y', r => y(String(r.label))!).attr('height', y.bandwidth())
                    .attr('x', 0).attr('width', r => x(Number(r.value)));
            },
        }, FOUR);
        expect(design).toMatchObject({ mode: 'subset', channel: 'length', axis: 'x', anchor: 'start' });
        expect(design.reason).toMatch(/^declared by the plot; the geometry agrees/);
        expect(design.fit).toBeGreaterThanOrEqual(0.99);
    });

    test('declaring the preset that stood in drops the unproven warning', () => {
        const [design] = mountDefinition({ highlight: { rect: { mode: 'custom', preset: 'glyph' } }, draw: columns }, signed([['a', 1], ['b', 2], ['b', 1]]));
        expect(design).toMatchObject({ mode: 'custom', preset: 'glyph', reason: 'declared by the plot' });
        expect(design.unproven).toBeUndefined();
    });

    test('draw returns highlights per family only: a word or a function is refused, not ignored', () => {
        expect(() => mountDefinition({ draw: context => { columns(context); return { highlight: 'glyph' } as never; } }, FOUR))
            .toThrow(/draw returns highlight as a highlight per mark family/);
        expect(() => mountDefinition({ draw: context => { columns(context); return { highlight: () => undefined } as never; } }, FOUR))
            .toThrow(/draw returns highlight as a highlight per mark family/);
    });

    test('a members preset with no scale to declare or infer is refused, not drawn empty', () => {
        expect(() => mountDefinition({ highlight: { rect: { mode: 'custom', preset: 'members' } }, draw: columns }, FOUR))
            .toThrow(/the members highlight of rect needs a scale/);
    });

    test('provenance.highlight takes only boolean', () => {
        expect(() => mountDefinition({ draw: columns }, FOUR, { ...SUM, provenance: { highlight: 'glyph' } } as never))
            .toThrow(/provenance.highlight can only be 'boolean'/);
    });

    test('the trace word on filled marks traces the outline, not the whole fill', () => {
        const name = `traced-${registered.length}`;
        autkPlot.registerPlot({ name, highlight: 'trace', draw: columns });
        registered.push(name);
        const div = document.createElement('div');
        document.body.append(div);
        const plot = new autkPlot.AutkPlot(div, { type: 'registered', plot: name, collection: FOUR, width: WIDTH + 80, height: HEIGHT + 80, events: [autkPlot.PlotEvent.CLICK], ...SUM } as UnifiedPlotConfig);
        plot.setSelection([4]); // 2 of the 5 of bar d
        const copy = div.querySelector<SVGElement>('.autkPartial')!;
        expect(copy).not.toBeNull();
        expect(copy.style.fill).toBe('none');
        expect(copy.style.stroke).not.toBe('');
        expect(copy.getAttribute('pathLength')).toBe('1');
        // jsdom keeps "0.4 1"; Chrome serializes the list as "0.4, 1".
        expect(copy.style.strokeDasharray).toMatch(/^0\.\d+,? 1$/);
    });

    test('strokes with too few distinct values fall back to trace and say so, in the right number', () => {
        const lines: PlotDefinition['draw'] = ({ group, rows }) => {
            group.selectAll('polyline').data(rows).join('polyline').attr('class', 'autkMark').attr('fill', 'none')
                .attr('points', (_r, i) => `0,${i * 10} ${WIDTH},${i * 10 + 5}`);
        };
        const [two] = mountDefinition({ draw: lines }, signed([['a', 1], ['b', 2], ['b', 1]]));
        expect(two).toMatchObject({ kind: 'stroke', mode: 'custom', preset: 'trace', unproven: true });
        expect(two.reason).toMatch(/^2 distinct values:/);
        const [one] = mountDefinition({ draw: lines }, signed([['a', 1], ['b', 1]]));
        expect(one.reason).toMatch(/^1 distinct value:/);
    });
});
