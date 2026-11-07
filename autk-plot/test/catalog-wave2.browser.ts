/**
 * Catalog wave 2: plots built from new relations, all with integer weights.
 *
 * - hierarchy (chained partition, N:1 at every level): stacked bars,
 *   treemap, sunburst
 * - fold (unfold by measure, 1:N, then partition, N:1): radar
 * - cumulative (partition, then prefix accumulation, N:N): ECDF, Pareto
 * - pairs by shared attribute (the flows preset): chord
 */

import * as d3 from 'd3';
import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { CumulativeRow, FlowRow, FoldCellRow, HierarchyNodeRow, PlotEventData, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const props = () => regions().features.map(f => f.properties!);
const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
const featureIndices = (ids: string[]) => sortNumbers(ids.map(id => Number(id.slice('feature:'.length))));
const units = (el: Element) => el.getAttribute('data-autk-units')!.split('/').map(Number);

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const marks = () => Array.from(div.querySelectorAll<SVGElement>('.autkMark'));
    const partials = () => Array.from(div.querySelectorAll<SVGElement>('.autkPartial'));
    const rows = <T>() => plot.instance['_data'] as unknown as T[];
    const rowId = (row: unknown) => plot.instance['rowIdOf'](row) as string;
    const partialOf = (row: unknown) => partials().find(p => p.getAttribute('data-autk-provenance') === `mark:${rowId(row)}`);
    return { div, plot, marks, partials, rows, rowId, partialOf };
}

/** Every given row leads back, through the relations, to exactly its `autkIds`. */
function expectInverseMatchesAutkIds(plot: next.AutkPlot, rows: Array<{ autkIds: number[] }>) {
    for (const row of rows) {
        const rowId = plot.instance['rowIdOf'](row) as string;
        const path = plot.provenance.inverse([`mark:${rowId}`]);
        expect(featureIndices(path[path.length - 1].ids)).toEqual(sortNumbers(row.autkIds));
    }
}

/** Selects every feature of a row but one, so the row is split. */
function splitRow(plot: next.AutkPlot, row: { autkIds: number[] }) {
    const chosen = row.autkIds.slice(0, row.autkIds.length - 1);
    plot.setSelection(chosen);
    return chosen;
}

/** Last element of a list. */
const last = <T>(list: T[]) => list[list.length - 1];

/** Bound datum of a DOM mark. */
const datumOf = <T>(el: Element) => (el as unknown as { __data__: T }).__data__;

/** Plot-specific fields of the concrete plot, read by the tests. */
const internals = (plot: next.AutkPlot) => plot.instance as unknown as {
    boxes: Map<object, { x0: number; y0: number; x1: number; y1: number }>;
    spans: Map<object, { a0: number; a1: number; b0: number; b1: number }>;
    layout: Map<object, { kind: string; range?: { start: number; end: number }; source?: { start: number; end: number }; target?: { start: number; end: number } }>;
    radius: number;
    mapShare: (share: number) => number;
};

// ---------------------------------------------------------------------------
// Hierarchy: chained partitions
// ---------------------------------------------------------------------------

describe('hierarchy preset (chained partition)', () => {
    const run = (axis: string[]) => next.run(
        regions().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as never,
        { preset: 'hierarchy' },
        axis,
    ) as next.ExecutedHierarchyTransform;

    test('every feature falls in one leaf, and every parent is the sum of its children', () => {
        const result = run(['landuse', 'cdta2020']);
        const leaves = result.rows.filter(r => r.level === 1);
        expect(sortNumbers(leaves.flatMap(l => l.autkIds))).toEqual(props().map((_p, i) => i));
        for (const parent of result.rows.filter(r => r.level === 0)) {
            const children = leaves.filter(l => l.parent === parent.key);
            expect(d3.sum(children, c => c.value)).toBe(parent.value);
            expect(parent.value).toBe(props().filter(p => p.landuse === parent.label).length);
        }
    });

    test('relations go up the chain: features → leaves → parents, N:1 at every step', () => {
        const result = run(['landuse', 'cdta2020', 'ntatype']);
        expect(result.provenance.stages.map(s => s.label)).toEqual(['ntatype', 'cdta2020', 'landuse']);
        const model = new next.ProvenanceModel(
            [{ name: 'D0', label: 'features', ids: props().map((_p, i) => `feature:${i}`) }, ...result.provenance.stages],
            result.provenance.relations,
        );
        expect(model.cardinalities.map(c => c.cardinality)).toEqual(['N:1', 'N:1', 'N:1', 'N:1']);
    });
});

describe('stacked bars (two-level hierarchy)', () => {
    const bars = (): UnifiedPlotConfig => ({
        type: 'stackedbar',
        collection: regions(),
        attributes: { axis: ['cdta2020', 'landuse'] },
        transform: { preset: 'hierarchy' },
        events: [next.PlotEvent.CLICK],
    });

    test('stacked: one segment per district and land use, stacking up to the district total', () => {
        const { plot, marks, rows } = mount(bars());
        const nodes = rows<HierarchyNodeRow>();
        const leaves = nodes.filter(r => r.level === 1);
        expect(marks()).toHaveLength(leaves.length);

        const mapY = (value: number) => value; // heights are linear in value: compare ratios
        for (const group of nodes.filter(r => r.level === 0)) {
            const segments = marks().filter(m => datumOf<HierarchyNodeRow>(m).parent === group.key);
            const height = d3.sum(segments, s => Number(s.getAttribute('height')));
            const unit = Number(segments[0].getAttribute('height')) / datumOf<HierarchyNodeRow>(segments[0]).value;
            expect(height).toBeCloseTo(mapY(group.value) * unit, 6);
            expect(new Set(segments.map(s => s.getAttribute('x'))).size).toBe(1);
        }
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:1', 'N:1', '1:1', 'N:1']);
        expectInverseMatchesAutkIds(plot, leaves);
    });

    test('segregated view: each segment fills the selected fraction from its base', () => {
        const { plot, rows, partialOf, marks } = mount(bars());
        const leaf = rows<HierarchyNodeRow>().find(r => r.level === 1 && r.autkIds.length >= 2)!;
        const chosen = splitRow(plot, leaf);
        const partial = partialOf(leaf)!;
        const mark = marks().find(m => datumOf(m) === leaf)!;
        expect(units(partial)).toEqual([chosen.length, leaf.autkIds.length]);
        expect(Number(partial.getAttribute('height'))).toBeCloseTo(Number(mark.getAttribute('height')) * chosen.length / leaf.autkIds.length);
        const bottom = (el: Element) => Number(el.getAttribute('y')) + Number(el.getAttribute('height'));
        expect(bottom(partial)).toBeCloseTo(bottom(mark));
    });

    test('a non-additive reducer is rejected: segments must add up', () => {
        expect(() => mount({ ...bars(), transform: { preset: 'hierarchy', options: { reducer: 'avg', value: 'shape_area' } } })).toThrow(/additive/);
    });
});

describe('treemap and sunburst (hierarchy)', () => {
    const tree = (type: 'treemap' | 'sunburst'): UnifiedPlotConfig => ({
        type,
        collection: regions(),
        attributes: { axis: ['landuse', 'cdta2020'] },
        transform: { preset: 'hierarchy' },
        events: [next.PlotEvent.CLICK],
    });

    test('treemap: leaves are the marks, inside the frame of their parent', () => {
        const { plot, marks, rows } = mount(tree('treemap'));
        const nodes = rows<HierarchyNodeRow>();
        const leaves = nodes.filter(r => r.level === 1);
        expect(marks()).toHaveLength(leaves.length);
        const boxes = internals(plot).boxes;
        for (const leaf of leaves) {
            const box = boxes.get(leaf)!;
            const parent = boxes.get(nodes.find(n => n.key === leaf.parent)!)!;
            expect(box.x0).toBeGreaterThanOrEqual(parent.x0);
            expect(box.x1).toBeLessThanOrEqual(parent.x1);
            expect(box.y0).toBeGreaterThanOrEqual(parent.y0);
            expect(box.y1).toBeLessThanOrEqual(parent.y1);
        }
        expectInverseMatchesAutkIds(plot, leaves);
    });

    test('treemap segregated view: the inner rectangle covers the selected fraction of the leaf', () => {
        const { plot, rows, partialOf } = mount(tree('treemap'));
        const leaf = rows<HierarchyNodeRow>().find(r => r.level === 1 && r.autkIds.length >= 2)!;
        const chosen = splitRow(plot, leaf);
        const box = internals(plot).boxes.get(leaf)!;
        const partial = partialOf(leaf)!;
        const area = Number(partial.getAttribute('width')) * Number(partial.getAttribute('height'));
        expect(area / ((box.x1 - box.x0) * (box.y1 - box.y0))).toBeCloseTo(chosen.length / leaf.autkIds.length);
    });

    test('sunburst: every node is a mark, children span the angle of their parent', () => {
        const { plot, marks, rows } = mount(tree('sunburst'));
        const nodes = rows<HierarchyNodeRow>();
        expect(marks()).toHaveLength(nodes.length);
        const spans = internals(plot).spans;
        for (const parent of nodes.filter(r => r.level === 0)) {
            const children = nodes.filter(r => r.parent === parent.key);
            const span = spans.get(parent)!;
            expect(d3.sum(children, c => spans.get(c)!.a1 - spans.get(c)!.a0)).toBeCloseTo(span.a1 - span.a0);
            for (const child of children) expect(spans.get(child)!.b0).toBeCloseTo(span.b1);
        }
        // Marks span two stages: leaves (D1) and parents (D2).
        expect(last(plot.provenance.relations).source).toBe('D1+D2');
        expectInverseMatchesAutkIds(plot, nodes);
    });

    test('sunburst segregated view: r² = r₀² + f(r₁² − r₀²) for every touched ring', () => {
        const { plot, rows, partialOf } = mount(tree('sunburst'));
        const leaf = rows<HierarchyNodeRow>().find(r => r.level === 1 && r.autkIds.length >= 2)!;
        const chosen = splitRow(plot, leaf);
        const span = internals(plot).spans.get(leaf)!;
        const f = chosen.length / leaf.autkIds.length;
        const radii = Array.from(partialOf(leaf)!.getAttribute('d')!.matchAll(/A([\d.]+),/g)).map(m => Number(m[1]));
        expect(radii).toContainEqual(expect.closeTo(Math.sqrt(span.b0 ** 2 + f * (span.b1 ** 2 - span.b0 ** 2)), 3));
    });

    test('clicking a parent ring selects all its features, fully covered within their level', () => {
        const { plot, marks } = mount(tree('sunburst'));
        const emitted: PlotEventData[] = [];
        plot.events.on(next.PlotEvent.CLICK, data => emitted.push(data));
        const parent = marks().find(m => datumOf<HierarchyNodeRow>(m).level === 0)!;
        parent.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sortNumbers(emitted[0].selection)).toEqual(sortNumbers(datumOf<HierarchyNodeRow>(parent).autkIds));
        expect(emitted[0].shares!.every(s => s.selectedUnits === s.totalUnits)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Fold: one unit per measure
// ---------------------------------------------------------------------------

describe('radar (fold: unfold by measure, then partition)', () => {
    const radar = (): UnifiedPlotConfig => ({
        type: 'radar',
        collection: regions(),
        attributes: { axis: ['landuse', 'shape_area', 'shape_leng'] },
        transform: { preset: 'fold' },
        events: [next.PlotEvent.CLICK],
    });
    const normalized = (measure: string) => {
        const values = props().map(p => p[measure] as number);
        const [lo, hi] = [Math.min(...values), Math.max(...values)];
        return values.map(v => (v - lo) / (hi - lo));
    };

    test('one vertex per land use and measure, at the average rescaled value', () => {
        const { plot, marks, rows } = mount(radar());
        const cells = rows<FoldCellRow>();
        const landuses = new Set(props().map(p => p.landuse));
        expect(marks()).toHaveLength(landuses.size * 2);
        for (const cell of cells) {
            const values = normalized(cell.measure);
            const members = props().map((p, i) => [p, i] as const).filter(([p]) => p.landuse === cell.category);
            expect(cell.value).toBeCloseTo(d3.mean(members, ([, i]) => values[i])!);
        }
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['1:N', 'N:1', '1:1', 'N:N']);
        expectInverseMatchesAutkIds(plot, cells);
    });

    test('segregated view: the subset polygon averages the selected features only', () => {
        const { plot, rows, partialOf } = mount(radar());
        const cell = rows<FoldCellRow>().find(c => c.autkIds.length >= 3)!;
        const chosen = splitRow(plot, cell);
        const values = normalized(cell.measure);
        const expected = d3.mean(chosen, i => values[i])!;
        const partial = partialOf(cell)!;
        const [x, y] = [Number(partial.getAttribute('cx')), Number(partial.getAttribute('cy'))];
        expect(Math.hypot(x, y)).toBeCloseTo(expected * internals(plot).radius, 3);
    });

    test('a feature is fully covered within a measure when its cell is clicked', () => {
        const { plot, marks } = mount(radar());
        const emitted: PlotEventData[] = [];
        plot.events.on(next.PlotEvent.CLICK, data => emitted.push(data));
        marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(emitted[0].shares!.every(s => s.selectedUnits === s.totalUnits)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Cumulative: prefix accumulation
// ---------------------------------------------------------------------------

describe('ECDF and Pareto (cumulative: partition, then prefix)', () => {
    const ecdf = (attr = 'shape_area'): UnifiedPlotConfig => ({
        type: 'ecdf',
        collection: regions(),
        attributes: { axis: [attr] },
        transform: { preset: 'cumulative' },
        events: [next.PlotEvent.CLICK],
    });
    const pareto = (): UnifiedPlotConfig => ({
        type: 'pareto',
        collection: regions(),
        attributes: { axis: ['cdta2020'] },
        transform: { preset: 'cumulative' },
        events: [next.PlotEvent.CLICK],
    });

    test('ECDF: one step per distinct value; point k holds every feature up to it', () => {
        const { plot, marks, rows } = mount(ecdf());
        const points = rows<CumulativeRow>().filter(r => r.kind === 'point');
        const areas = props().map(p => p.shape_area as number);
        expect(marks()).toHaveLength(new Set(areas).size);
        for (const point of points) {
            expect(sortNumbers(point.autkIds)).toEqual(areas.map((a, i) => [a, i]).filter(([a]) => a <= point.upper!).map(([, i]) => i));
            expect(point.share).toBeCloseTo(point.autkIds.length / areas.length);
        }
        expect(last(points).share).toBe(1);
        // Exact steps: features → values is 1:1 when every value is distinct.
        // Bars → points is a prefix relation: each bar reaches every later point.
        const intoBars = new Set(areas).size === areas.length ? '1:1' : 'N:1';
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual([intoBars, 'N:N', '1:1', 'N:N']);
        expectInverseMatchesAutkIds(plot, points);
    });

    test('ECDF segregated view: the subset curve is the selected share of the whole', () => {
        const { plot, rows, partialOf } = mount(ecdf());
        const points = rows<CumulativeRow>().filter(r => r.kind === 'point');
        const chosen = [0, 5, 9];
        plot.setSelection(chosen);
        const areas = props().map(p => p.shape_area as number);
        for (const point of points) {
            const selectedUpTo = chosen.filter(i => areas[i] <= point.upper!).length;
            const partial = partialOf(point);
            if (selectedUpTo === 0) {
                expect(partial).toBeUndefined();
            } else {
                expect(Number(partial!.getAttribute('cy'))).toBeCloseTo(internals(plot).mapShare(selectedUpTo / areas.length));
            }
        }
    });

    test('ECDF needs a numeric column', () => {
        expect(() => mount(ecdf('landuse'))).toThrow(/numeric/);
    });

    test('Pareto: bars largest first, and the cumulative share line over them', () => {
        const { plot, marks, rows } = mount(pareto());
        const bars = rows<CumulativeRow>().filter(r => r.kind === 'bar');
        const points = rows<CumulativeRow>().filter(r => r.kind === 'point');
        expect(bars.map(b => b.value)).toEqual([...bars.map(b => b.value)].sort((a, b) => b - a));
        points.forEach((point, k) => expect(point.value).toBe(d3.sum(bars.slice(0, k + 1), b => b.value)));
        expect(marks()).toHaveLength(bars.length + points.length);
        expect(last(plot.provenance.relations).source).toBe('D1+D2');
        expectInverseMatchesAutkIds(plot, [...bars, ...points]);
    });

    test('Pareto segregated view: each bar fills its selected fraction', () => {
        const { plot, rows, partialOf } = mount(pareto());
        const bar = rows<CumulativeRow>().find(r => r.kind === 'bar' && r.autkIds.length >= 2)!;
        const chosen = splitRow(plot, bar);
        expect(units(partialOf(bar)!)).toEqual([chosen.length, bar.autkIds.length]);
    });
});

// ---------------------------------------------------------------------------
// Pairs by shared attribute: the flows preset
// ---------------------------------------------------------------------------

describe('chord (pairs of categories)', () => {
    const chord = (axis = ['landuse', 'cdta2020']): UnifiedPlotConfig => ({
        type: 'chord',
        collection: regions(),
        attributes: { axis },
        transform: { preset: 'flows' },
        events: [next.PlotEvent.CLICK],
    });

    test('chord: each arc is exactly covered by the ends of its ribbons', () => {
        const { plot, marks, rows } = mount(chord());
        const all = rows<FlowRow>();
        expect(marks()).toHaveLength(all.length);
        const layout = internals(plot).layout;
        for (const node of all.filter(r => r.kind === 'node')) {
            const range = layout.get(node)!.range!;
            const ends = all.filter(r => r.kind === 'link').flatMap(link => {
                const box = layout.get(link)!;
                return [link.source === node.key ? box.source! : null, link.target === node.key ? box.target! : null].filter(Boolean);
            }) as { start: number; end: number }[];
            expect(d3.sum(ends, e => e.end - e.start)).toBeCloseTo(range.end - range.start);
        }
        expectInverseMatchesAutkIds(plot, all);
    });

    test('chord segregated view: a ribbon keeps the selected fraction of both ends', () => {
        const { plot, rows, partialOf } = mount(chord());
        const link = rows<FlowRow>().find(r => r.kind === 'link' && r.autkIds.length >= 2)!;
        const chosen = splitRow(plot, link);
        expect(units(partialOf(link)!)).toEqual([chosen.length, link.autkIds.length]);
    });

    test('chord takes exactly two columns', () => {
        expect(() => mount(chord(['ntatype', 'landuse', 'cdta2020']))).toThrow(/two/);
    });
});
