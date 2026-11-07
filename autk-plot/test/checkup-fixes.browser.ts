/**
 * Regressions found by the general checkup of the extension work.
 *
 * Each test reproduces one defect: a part drawn from the wrong end of a
 * flipped or negative bar, a valid annotation refused, a malformed provenance
 * that crashed the validator, an inherited key accepted as a row shape, a
 * clamped ratio, a stroke width with units, and day ids that repeat across years.
 */

import * as d3 from 'd3';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PartialDesign, PlotDefinition, TransformDefinition, UnifiedPlotConfig } from '../src';

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
    registered.splice(0).forEach(name => next.unregisterPlot(name));
    document.body.innerHTML = '';
});
beforeAll(() => installSvgBBox());

function mount(draw: PlotDefinition['draw'], collection: FeatureCollection<Geometry, GeoJsonProperties>, config: Omit<UnifiedPlotConfig, 'type' | 'collection'> = SUM) {
    const name = `checkup-${registered.length}`;
    next.registerPlot({ name, draw });
    registered.push(name);
    const div = document.createElement('div');
    document.body.append(div);
    const plot = new next.AutkPlot(div, { type: 'registered', plot: name, collection, width: WIDTH + 80, height: HEIGHT + 80, margins: { left: 40, right: 40, top: 40, bottom: 40 }, ...config } as UnifiedPlotConfig);
    const designs = () => (plot.instance as unknown as { partialDesigns: PartialDesign[] }).partialDesigns;
    const partOf = (mark: Element) => Array.from(div.querySelectorAll('.autkPartial')).find(p => p.getAttribute('data-autk-provenance') === mark.getAttribute('data-autk-provenance'));
    return { div, plot, designs, partOf };
}

/** Vertical extent of a rect after its own transform. */
function extentOf(element: Element): [number, number] {
    const [, , , d, , f] = next.ownMatrix(element);
    const y0 = d * Number(element.getAttribute('y')) + f;
    const y1 = d * (Number(element.getAttribute('y')) + Number(element.getAttribute('height'))) + f;
    return [Math.min(y0, y1), Math.max(y0, y1)];
}

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
        expect(designs()).toMatchObject([{ rule: 'length', axis: 'y', anchor: 'end' }]);
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
        expect(designs()).toMatchObject([{ rule: 'length', axis: 'y', anchor: 'end' }]);
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
        expect(designs()).toMatchObject([{ rule: 'position', axis: 'x' }]);
        plot.setSelection([0]);
        const mark = Array.from(div.querySelectorAll('.autkMark')).find(m => (m as unknown as { __data__: AutkDatum }).__data__.label === 'a')!;
        const [, , , , dx] = next.ownMatrix(partOf(mark)!);
        expect(Number(mark.getAttribute('cx')) + dx).toBeCloseTo((15 / 20) * WIDTH, 9);
    });
});

describe('drawing contract', () => {
    test('marks annotated data-autk-part="none" are not expected to show a part', () => {
        const report = next.checkPlot({
            name: 'none',
            draw({ group, rows }) {
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark').attr('data-autk-part', 'none')
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
        expect(designs()).toMatchObject([{ kind: 'stroke', rule: 'width' }]);
    });
});

describe('transform contract', () => {
    const regions = signed([['a', 1], ['b', 2]]);

    test('a provenance with missing parts is reported, not a crash', () => {
        const broken: TransformDefinition = { name: 'x', shape: 'category-value', run: () => ({ rows: [], provenance: {} as never }) };
        const report = next.checkTransformReport(broken, regions);
        expect(report.violations).toEqual([{ invariant: 0, message: 'provenance needs stages, relations, rowIds, contributions as arrays' }]);
        expect(next.checkProvenance(2, [], { stages: [], relations: null } as never)[0]).toMatch(/relations, rowIds, contributions/);
    });

    test('an inherited key is not a row shape', () => {
        expect(() => next.registerTransform({ name: 'x', shape: 'toString' as never, run: () => ({ rows: [], provenance: {} as never }) })).toThrow(/unknown row shape/);
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
