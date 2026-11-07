/**
 * One registration API for built-in and user transforms.
 *
 * The 12 built-in transforms are transform definitions registered with
 * `registerTransform`, the function user transforms use, and run by the same
 * code. A plot reads a transform by its name or by the shape of its rows, so a
 * user transform that yields the rows of a built-in shape is read by the same
 * plots, extras included (`shapeOutput`).
 */

import { afterEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, TransformDefinition, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection, withSyntheticEvents, withSyntheticSeries } from './fixtures';
import type { Collection } from './fixtures';
import { installSvgBBox } from './svg-geometry';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const rows = (collection: Collection = regions()) => collection.features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];

const BUILT_INS = [
    'binning-1d', 'binning-2d', 'sort', 'binning-events', 'reduce-series', 'box-stats',
    'flows', 'binning-hex', 'hierarchy', 'cumulative', 'fold', 'density',
];

const registered: string[] = [];
function register(definition: TransformDefinition): void {
    next.registerTransform(definition);
    registered.push(definition.name);
}
afterEach(() => {
    registered.splice(0).forEach(name => next.unregisterTransform(name));
    document.body.innerHTML = '';
});

/** A user transform with the code of a built-in one, under another name. */
const copyOf = (builtIn: string, name: string): TransformDefinition => ({ ...next.registeredTransform(builtIn), name });

function mount(config: Omit<UnifiedPlotConfig, 'collection'>, collection: Collection = regions()) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, { width: 480, height: 320, collection, ...config } as UnifiedPlotConfig);
    return { div, plot, marks: () => Array.from(div.querySelectorAll('.autkMark')) };
}

/** Every mark of a drawing, with its attributes. */
const drawingOf = (div: HTMLElement) => Array.from(div.querySelectorAll('.autkMark'))
    .map(mark => `${mark.tagName} ${Array.from(mark.attributes).map(a => `${a.name}=${a.value}`).sort().join(' ')}`);

describe('built-in transforms are registered definitions', () => {
    test('the 12 built-in transforms are in the registry, each with its row shape', () => {
        expect(BUILT_INS.map(name => next.registeredTransform(name).name)).toEqual(BUILT_INS);
        expect(next.registeredTransform('binning-1d').shape).toBe('category-value');
        expect(next.registeredTransform('binning-events').shape).toBe('series');
        expect(next.registeredTransform('reduce-series').shape).toBe('series');
        expect(next.registeredTransform('hierarchy').shape).toBe('hierarchy');
    });

    test('their names are reserved: they cannot be replaced nor unregistered', () => {
        expect(() => next.registerTransform(copyOf('binning-1d', 'binning-1d'))).toThrow(/already registered/);
        expect(() => next.unregisterTransform('binning-1d')).toThrow(/built-in transform/);
        expect(() => next.registerTransform(copyOf('binning-1d', 'registered'))).toThrow(/already registered/);
    });

    test('a built-in transform named through the registered preset is the same transform', () => {
        const direct = next.run(rows(), { preset: 'binning-1d', options: { bins: 5 } }, ['shape_area']);
        const named = next.run(rows(), { preset: 'registered', name: 'binning-1d', options: { bins: 5 } }, ['shape_area']);
        expect(named.rows).toEqual(direct.rows);
        expect(named.provenance).toEqual(direct.provenance);
        expect(named).toMatchObject({ preset: 'registered', name: 'binning-1d', shape: 'category-value' });
    });

    test('an unknown transform is an error, not another transform', () => {
        expect(() => next.run(rows(), { preset: 'nope' } as never, ['shape_area'])).toThrow(/No transform is registered as "nope"/);
    });
});

describe('a plot reads a transform by its row shape, built-in or user alike', () => {
    test('a user transform with hierarchy rows draws the treemap the built-in hierarchy draws', () => {
        installSvgBBox();
        register(copyOf('hierarchy', 'my-hierarchy'));
        const axis = { attributes: { axis: ['landuse', 'cdta2020'] } };
        const builtIn = mount({ type: 'treemap', ...axis, transform: { preset: 'hierarchy' } });
        const user = mount({ type: 'treemap', ...axis, transform: { preset: 'registered', name: 'my-hierarchy' } });
        expect(user.marks().length).toBeGreaterThan(0);
        expect(drawingOf(user.div)).toEqual(drawingOf(builtIn.div));
    });

    test('a plot that reads extras of a shape gets them from a user transform too (radar: measures; hexbin: grid)', () => {
        installSvgBBox();
        register(copyOf('fold', 'my-fold'));
        register(copyOf('binning-hex', 'my-hex'));
        const radar = { attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] } };
        expect(drawingOf(mount({ type: 'radar', ...radar, transform: { preset: 'registered', name: 'my-fold' } }).div))
            .toEqual(drawingOf(mount({ type: 'radar', ...radar, transform: { preset: 'fold' } }).div));
        const hex = { attributes: { axis: ['shape_area', 'shape_leng'] } };
        expect(drawingOf(mount({ type: 'hexbin', ...hex, transform: { preset: 'registered', name: 'my-hex' } }).div))
            .toEqual(drawingOf(mount({ type: 'hexbin', ...hex, transform: { preset: 'binning-hex' } }).div));
    });

    test('shapeOutput gives the extras only for the shape asked', () => {
        const fold = next.run(rows(), { preset: 'fold' }, ['landuse', 'shape_area', 'shape_leng']);
        expect(next.shapeOutput(fold, 'fold')?.measures).toEqual(['shape_area', 'shape_leng']);
        expect(next.shapeOutput(fold, 'hierarchy')).toBeUndefined();
        expect(next.shapeOutput(undefined, 'fold')).toBeUndefined();
    });

    test('a plot refuses a transform whose name and shape it does not read', () => {
        register(copyOf('binning-1d', 'my-bins'));
        register(copyOf('binning-events', 'my-events'));
        expect(() => mount({ type: 'treemap', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'registered', name: 'my-bins' } }))
            .toThrow('Treemap only supports the hierarchy transform preset.');
        // The calendar reads any series of days; a series of other buckets is refused by what it draws.
        const events = (resolution: string) => ({ type: 'calendar' as const, attributes: { axis: ['sjoin.collect.noise', '@transform'] }, transform: { preset: 'registered' as const, name: 'my-events', options: { timestamp: 'date', resolution } } });
        expect(mount(events('day'), withSyntheticEvents(regions())).div.querySelectorAll('.autkMark').length).toBeGreaterThan(0);
        expect(() => mount(events('month'), withSyntheticEvents(regions()))).toThrow('Calendar requires daily buckets (YYYY-MM-DD).');
    });

    test('the waffle reads any counting transform of category-value rows, one square per feature', () => {
        register(copyOf('binning-1d', 'my-bins'));
        const { div } = mount({ type: 'waffle', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'registered', name: 'my-bins' } });
        expect(div.querySelectorAll('.autkMark')).toHaveLength(regions().features.length);
        expect(() => mount({ type: 'waffle', attributes: { axis: ['landuse', '@transform'] }, transform: { preset: 'registered', name: 'my-bins', options: { reducer: 'sum', value: 'shape_leng' } } }))
            .toThrow();
    });

    test('a reducer the plot cannot draw is refused for every transform alike', () => {
        register(copyOf('binning-1d', 'my-bins'));
        const avg = { reducer: 'avg', value: 'shape_leng' };
        const axis = { attributes: { axis: ['landuse', '@transform'] } };
        expect(() => mount({ type: 'pie', ...axis, transform: { preset: 'binning-1d', options: avg } as never })).toThrow('Pie chart requires an additive reducer (count or sum).');
        expect(() => mount({ type: 'pie', ...axis, transform: { preset: 'registered', name: 'my-bins', options: avg } })).toThrow('Pie chart requires an additive reducer (count or sum).');
    });

    test('rows that are the source features themselves (the sort shape) map a selection one to one, with no @transform value', () => {
        register(copyOf('sort', 'my-sort'));
        const table = mount({ type: 'table', attributes: { axis: ['ntaname', 'shape_area'] }, transform: { preset: 'registered', name: 'my-sort', options: { column: 'shape_area' } } });
        expect(table.plot.instance['_selectionProjection']).toBe('bijective');
        expect(() => mount({ type: 'table', attributes: { axis: ['ntaname', '@transform'] }, transform: { preset: 'registered', name: 'my-sort' } }))
            .toThrow("'@transform' cannot be used with the 'my-sort' preset.");
    });
});

describe('the shape is checked for every transform', () => {
    const hierarchyRows = () => next.run(rows(), { preset: 'hierarchy' }, ['landuse']);

    test('a run whose rows lack a field of the shape is refused, naming the field', () => {
        register({ name: 'no-path', shape: 'hierarchy', run: (input, options, columns) => {
            const output = hierarchyRows();
            void input; void options; void columns;
            return { rows: (output.rows as AutkDatum[]).map(({ path, ...row }) => { void path; return row; }) as AutkDatum[], provenance: output.provenance, depth: 1 };
        } });
        expect(() => next.run(rows(), { preset: 'registered', name: 'no-path' }, ['landuse'])).toThrow(/lacks .*"path".* required by the "hierarchy" shape/);
    });

    test('a run without the extras of its shape is refused, and the checker reports it as invariant 0', () => {
        const noDepth: TransformDefinition = { name: 'no-depth', shape: 'hierarchy', run: () => {
            const { rows: out, provenance } = hierarchyRows();
            return { rows: out as AutkDatum[], provenance };
        } };
        register(noDepth);
        expect(() => next.run(rows(), { preset: 'registered', name: 'no-depth' }, ['landuse'])).toThrow('the "hierarchy" shape needs "depth" in the output');
        const report = next.checkTransformReport(noDepth, regions(), {}, ['landuse']);
        expect(report.violations).toEqual([{ invariant: 0, message: 'the "hierarchy" shape needs "depth" in the output' }]);
    });

    test('every built-in transform has the shape it declares, and passes the whole contract', () => {
        const data = withSyntheticSeries(withSyntheticEvents(regions()));
        const inputs: Record<string, [string[], Record<string, unknown>]> = {
            'binning-1d': [['landuse'], {}],
            'binning-2d': [['shape_area', 'landuse'], {}],
            sort: [['shape_area'], {}],
            'binning-events': [['sjoin.collect.noise'], { timestamp: 'date' }],
            'reduce-series': [['series'], {}],
            'box-stats': [['landuse', 'shape_area'], {}],
            flows: [['ntatype', 'landuse'], {}],
            'binning-hex': [['shape_area', 'shape_leng'], {}],
            hierarchy: [['landuse', 'cdta2020'], {}],
            cumulative: [['shape_area'], {}],
            fold: [['landuse', 'shape_area', 'shape_leng'], {}],
            density: [['landuse', 'shape_leng'], {}],
        };
        expect(Object.keys(inputs)).toEqual(BUILT_INS);
        for (const name of BUILT_INS) {
            const [columns, options] = inputs[name];
            const output = next.run(rows(data), { preset: name, options } as never, columns);
            expect(output.rows.length, name).toBeGreaterThan(0);
            expect(next.checkTransformReport(next.registeredTransform(name), data, options, columns).violations, name).toEqual([]);
        }
    });
});
