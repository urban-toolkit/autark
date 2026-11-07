/**
 * Holes found in the review before the migration: a transform that passes the contract is read
 * by every plot of its shape, a plot's own checks give correct messages, and built-ins cannot be
 * changed through a lookup.
 */

import * as d3 from 'd3';
import { afterEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotDefinition, TransformDefinition, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

const transforms: string[] = [];
const plots: string[] = [];
afterEach(() => {
    transforms.splice(0).forEach(name => next.unregisterTransform(name));
    plots.splice(0).forEach(name => next.unregisterPlot(name));
});

/** Registers a user transform made from a built-in one, with its output changed. */
function userTransform(builtIn: string, name: string, change: (output: ReturnType<TransformDefinition['run']>) => void = () => undefined): void {
    const original = next.registeredTransform(builtIn);
    next.registerTransform({
        name,
        shape: original.shape,
        run: (rows, options, columns) => {
            const output = original.run(rows, options, columns);
            change(output);
            return output;
        },
    });
    transforms.push(name);
}

function mount(config: Omit<UnifiedPlotConfig, 'collection'>) {
    const div = document.createElement('div');
    new next.AutkPlot(div, { width: 480, height: 320, collection: regions(), ...config } as UnifiedPlotConfig);
    return div;
}

describe('the contract of a shape is what its plots read', () => {
    test('a flows transform whose links do not name their nodes is refused by the contract, not by a crash', () => {
        userTransform('flows', 'renamed-flows', output => {
            for (const row of output.rows as (AutkDatum & { kind: string; source?: string; target?: string; from?: string; to?: string })[]) {
                if (row.kind !== 'link') continue;
                row.from = row.source;
                row.to = row.target;
                delete row.source;
                delete row.target;
            }
        });
        const report = next.checkTransformReport(next.registeredTransform('renamed-flows'), regions(), {}, ['ntatype', 'landuse']);
        expect(report.violations.map(v => v.message).join('\n')).toMatch(/must name the "key" of a node row in "source" and "target"/);
        expect(() => mount({ type: 'sankey', attributes: { axis: ['ntatype', 'landuse', '@transform'] }, transform: { preset: 'registered', name: 'renamed-flows' } }))
            .toThrow(/Transform "renamed-flows": .*"source" and "target"/);

        // The same transform, unchanged, draws in both plots of the shape.
        userTransform('flows', 'my-flows');
        for (const type of ['sankey', 'chord'] as const) {
            const div = mount({ type, attributes: { axis: ['ntatype', 'landuse', '@transform'] }, transform: { preset: 'registered', name: 'my-flows' } });
            expect(div.querySelectorAll('.autkMark').length, type).toBeGreaterThan(0);
        }
    });

    test('the radar scales any fold rows from their values, not from an option of the built-in fold', () => {
        userTransform('fold', 'raw-fold');
        const radius = (preset: UnifiedPlotConfig['transform']) => {
            const div = mount({ type: 'radar', attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] }, transform: preset });
            return Math.max(...Array.from(div.querySelectorAll('.autkMark')).map(m => Math.hypot(Number(m.getAttribute('cx')), Number(m.getAttribute('cy')))));
        };
        const builtIn = radius({ preset: 'fold', options: { normalize: false } });
        const user = radius({ preset: 'registered', name: 'raw-fold', options: { normalize: false } });
        expect(user).toBeCloseTo(builtIn, 6);
        // Inside the plot: the circle fits the drawing area.
        expect(user).toBeLessThanOrEqual(320 / 2);
        // Normalized values keep the unit circle, as before.
        expect(radius({ preset: 'fold' })).toBeLessThanOrEqual(builtIn + 1e-6);
    });
});

describe('a plot\'s own checks', () => {
    const draw: PlotDefinition['draw'] = ({ group, rows }) => {
        group.selectAll('circle').data(rows).join('circle').attr('class', 'autkMark').attr('r', 2);
    };
    const register = (definition: PlotDefinition) => {
        next.registerPlot(definition);
        plots.push(definition.name);
    };
    const config = (plot: string, transform?: UnifiedPlotConfig['transform']) => ({ type: 'registered' as const, plot, attributes: { axis: ['landuse', '@transform'] }, ...(transform ? { transform } : {}) });

    test('requiresTransform holds with or without a list of transforms', () => {
        register({ name: 'needs-any', requiresTransform: true, draw });
        expect(() => mount(config('needs-any'))).toThrow('needs-any requires a transform.');
        expect(mount(config('needs-any', { preset: 'binning-1d' })).querySelectorAll('.autkMark').length).toBeGreaterThan(0);
    });

    test('a plot that lists only row shapes names them in its messages', () => {
        register({ name: 'shape-only', transforms: ['category-value'], requiresTransform: true, draw });
        expect(() => mount(config('shape-only'))).toThrow('shape-only requires a transform of category-value rows.');
        expect(() => mount(config('shape-only', { preset: 'hierarchy' }))).toThrow('shape-only only supports transforms of category-value rows.');
    });

    test('topK on rows without a value says what it needs', () => {
        register({ name: 'one-axis', draw });
        expect(() => mount({ type: 'registered', plot: 'one-axis', attributes: { axis: ['landuse'] }, topK: { k: 3 } } as Omit<UnifiedPlotConfig, 'collection'>))
            .toThrow('PlotBaseData: topK needs a label (attributes.axis[0]) and a value (attributes.axis[1]).');
    });
});

describe('axes', () => {
    test('a bar chart of a few counts has whole ticks, never a fraction of a feature', () => {
        const div = mount({ type: 'barchart', attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' } });
        const ticks = Array.from(div.querySelectorAll('.autk-axis-y .tick text, g.tick text')).map(t => t.textContent ?? '');
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.filter(t => /m$|\./.test(t))).toEqual([]);
    });
});

describe('shared drawing helpers, the same for built-in and user plots', () => {
    test('grid lines take the grid color from the axis, in every built-in plot with a grid', () => {
        for (const config of [
            { type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
            { type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] } },
            { type: 'stackedbar', attributes: { axis: ['landuse', 'cdta2020', '@transform'] }, transform: { preset: 'hierarchy' } },
        ] as Omit<UnifiedPlotConfig, 'collection'>[]) {
            const lines = Array.from(mount(config).querySelectorAll<SVGLineElement>('.y.axis .tick line'));
            expect(lines.length, config.type).toBeGreaterThan(0);
            expect(new Set(lines.map(line => d3.color(line.style.stroke)?.formatHex())), config.type).toEqual(new Set([next.PlotStyle.grid]));
        }
    });

    test('a user plot draws a legend and whole ticks with the helpers the built-in ones use', () => {
        next.registerPlot({
            name: 'with-helpers',
            draw: ({ group, rows, value, width, height, axisY, tickCount, legend }) => {
                const y = d3.scaleLinear([0, d3.max(rows, row => Number(value(row, 1))) ?? 1], [height, 0]);
                axisY(d3.axisLeft(y).ticks(tickCount(y.domain()[1], rows.map(row => Number(value(row, 1))), 10)).tickSizeInner(-width));
                const labels = rows.map(row => String(value(row, 0)));
                legend(labels, next.PlotStyle.shades(labels), 'row');
                group.selectAll('circle.autkMark').data(rows).join('circle').attr('class', 'autkMark').attr('r', 2);
            },
        });
        plots.push('with-helpers');
        const div = mount({ type: 'registered', plot: 'with-helpers', attributes: { axis: ['cdta2020', '@transform'] }, transform: { preset: 'binning-1d' } });
        expect(div.querySelectorAll('.autk-legend').length).toBeGreaterThan(0);
        const ticks = Array.from(div.querySelectorAll('.y.axis .tick text')).map(t => t.textContent ?? '');
        expect(ticks.every(t => /^\d+$/.test(t))).toBe(true);
    });

    test('the radar and the stacked bars draw their legends with the shared helper', () => {
        const radar = mount({ type: 'radar', attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] }, transform: { preset: 'fold' } });
        const stacked = mount({ type: 'stackedbar', attributes: { axis: ['landuse', 'cdta2020', '@transform'] }, transform: { preset: 'hierarchy' } });
        const landuses = new Set(regions().features.map(f => String(f.properties!.landuse))).size;
        expect(radar.querySelectorAll('.autk-legend')).toHaveLength(landuses);
        expect(stacked.querySelectorAll('.autk-legend').length).toBeGreaterThan(0);
    });
});

describe('selection and drawing found by the newcomer walkthrough', () => {
    test('after a selection from another view, a click adds its mark to that selection, or takes it out (as in the original)', () => {
        for (const config of [
            { type: 'barchart', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
            { type: 'pie', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } },
            { type: 'treemap', attributes: { axis: ['landuse', 'cdta2020', '@transform'] }, transform: { preset: 'hierarchy' } },
        ] as Omit<UnifiedPlotConfig, 'collection'>[]) {
            const div = document.createElement('div');
            const plot = new next.AutkPlot(div, { width: 480, height: 320, collection: regions(), events: [next.PlotEvent.CLICK], ...config } as UnifiedPlotConfig);
            const emitted: number[][] = [];
            plot.events.on(next.PlotEvent.CLICK, data => emitted.push([...data.selection].sort((a, b) => a - b)));
            // The map selects one region; a click on a mark that does not hold it adds the mark's regions.
            const marks = Array.from(div.querySelectorAll('.autkMark'));
            const idsOf = (mark: Element) => (mark as unknown as { __data__: AutkDatum }).__data__.autkIds ?? [];
            const other = marks.find(mark => !idsOf(mark).includes(0))!;
            plot.setSelection([0]);
            other.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const reached = marks.filter(mark => idsOf(mark).includes(0)).flatMap(idsOf);
            expect(emitted[emitted.length - 1], config.type).toEqual([...new Set([...reached, ...idsOf(other)])].sort((a, b) => a - b));
        }
    });

    test('a plain D3 join on rect draws every row: the group is empty when draw starts, and the clear area comes after', () => {
        let childrenAtStart = -1;
        next.registerPlot({
            name: 'plain-rects',
            draw: ({ group, rows, width, height }) => {
                childrenAtStart = group.selectChildren().size();
                const x = d3.scaleBand(rows.map((_r, i) => String(i)), [0, width]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark')
                    .attr('x', (_r, i) => x(String(i)) ?? 0).attr('width', x.bandwidth()).attr('y', 0).attr('height', height / 2);
            },
        });
        plots.push('plain-rects');
        const div = mount({ type: 'registered', plot: 'plain-rects', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } });
        expect(childrenAtStart).toBe(0);
        const marks = Array.from(div.querySelectorAll<SVGRectElement>('rect.autkMark'));
        expect(marks).toHaveLength(new Set(regions().features.map(f => f.properties!.landuse)).size);
        expect(marks.every(mark => mark.style.opacity !== '0' && !mark.classList.contains('autkClear'))).toBe(true);
        // The clear area exists, under the marks.
        expect(div.querySelector('.autkMarksGroup > rect.autkClear:first-child')).not.toBeNull();
    });
});

describe('found by the third newcomer walkthrough', () => {
    test('an unknown reducer is refused with the list of reducers, for built-in and user transforms alike', () => {
        const rows = regions().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];
        expect(() => next.run(rows, { preset: 'binning-1d', options: { reducer: 'median', value: 'shape_leng' } } as never, ['landuse']))
            .toThrow('Unknown reducer "median" (expected count, sum, avg, min, max).');
        expect(() => next.collectBuckets({ rows, bucketOf: () => 'a', valueOf: undefined, reducer: 'mode' as never })).toThrow(/Unknown reducer "mode"/);
    });

    test('a bar chart with no transform and one field says it needs a label and a value', () => {
        expect(() => mount({ type: 'barchart', attributes: { axis: ['landuse'] } })).toThrow('Barchart requires a label and a value (two fields) when it has no transform.');
    });

    test('points with no numbers on an axis are refused instead of all drawn at zero', () => {
        expect(() => mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng', '@transform'] }, transform: { preset: 'binning-2d' } }))
            .toThrow('Points need numbers on both axes: field 1 has none in these rows.');
    });

    test('rows that share their label (or bucket) are refused: each one is a mark of its own', () => {
        userTransform('binning-1d', 'same-label', output => { (output.rows as AutkDatum[]).forEach(row => { (row as Record<string, unknown>).label = 'X'; }); });
        const report = next.checkTransformReport(next.registeredTransform('same-label'), regions(), {}, ['landuse']);
        expect(report.violations.map(v => v.message).join('\n')).toMatch(/rows 0 and 1 share the label "X"/);
    });

    test('marks bound to numbers are told to bind the rows themselves, not that they are copies', () => {
        next.registerPlot({ name: 'numbers', draw: ({ group, rows }) => { group.selectAll('circle').data(d3.range(rows.length)).join('circle').attr('class', 'autkMark').attr('r', 2); } });
        plots.push('numbers');
        const report = next.checkPlot(next.registeredPlot('numbers'), document.createElement('div'), { collection: regions(), attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } } as never);
        expect(report.violations.map(v => v.message).join('\n')).toMatch(/binds a number, not one of the rows it received \(bind the rows themselves\)/);
    });
});

describe('found on the migrated page', () => {
    test('a capped report says that there are more violations than the ones it keeps', () => {
        next.registerPlot({ name: 'no-marks', draw: ({ group, rows }) => { group.selectAll('circle').data(rows).join('circle').attr('r', 2); } });
        plots.push('no-marks');
        const many = next.checkPlot(next.registeredPlot('no-marks'), document.createElement('div'), { collection: regions(), attributes: { axis: ['shape_area'] } } as never);
        expect(many.violations).toHaveLength(20);
        expect(many.truncated).toBe(true);
        const few = next.checkPlot(next.registeredPlot('no-marks'), document.createElement('div'), { collection: regions(), attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'binning-1d' } } as never);
        expect(few.violations.length).toBeLessThan(20);
        expect(few.truncated).toBeUndefined();
    });

    test('binnedProvenance names a key that has no bin instead of failing inside', () => {
        const rows = regions().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];
        const buckets = next.collectBuckets({ rows, bucketOf: row => String(row.landuse), valueOf: undefined, reducer: 'count' });
        const keys = buckets.map(bucket => bucket.key);
        expect(() => next.binnedProvenance({ rows, buckets, bins: next.indexedBins(keys, keys, 'bin'), binLabel: 'bins', rowKeys: ['X', ...keys.slice(1)], reducer: 'count' }))
            .toThrow('binnedProvenance: the key "X" has no bin; every bucket key and row key needs one (indexedBins)');
    });

    test('a drag over the labels of a plot brushes instead of selecting their text', () => {
        const div = mount({ type: 'parallel-coordinates', attributes: { axis: ['shape_area', 'landuse'] } });
        expect(div.querySelector<SVGSVGElement>('svg')!.style.userSelect).toBe('none');
    });
});

describe('built-ins cannot be changed through a lookup', () => {
    test('the definitions of built-in plots and transforms are frozen, nested objects too', () => {
        const barchart = next.registeredPlot('barchart');
        expect(() => { (barchart as { draw: unknown }).draw = () => undefined; }).toThrow(TypeError);
        expect(() => { (barchart.design as Record<string, unknown>).rect = { rule: 'glyph' }; }).toThrow(TypeError);
        const fold = next.registeredTransform('fold');
        expect(() => { (fold as { run: unknown }).run = () => undefined; }).toThrow(TypeError);
        expect(Object.isFrozen(next.registeredPlot('pie'))).toBe(true);
    });
});
