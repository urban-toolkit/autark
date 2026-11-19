/**
 * Plots and transforms added to the original catalog: boxplot with `box-stats`
 * (order statistics produced by specific features) and Sankey with `flows`
 * (chain through segments, marks on two stages).
 */

import * as d3 from 'd3';
import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { BoxStatsRow, FlowRow, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const collection = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
const featureIndices = (ids: string[]) => sortNumbers(ids.map(id => Number(id.slice('feature:'.length))));

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const partials = () => Array.from(div.querySelectorAll('.autkPartial'));
    return { div, plot, partials };
}

describe('boxplot with box-stats (order statistics)', () => {
    const boxplot = (): UnifiedPlotConfig => ({
        type: 'boxplot',
        collection: collection(),
        attributes: { axis: ['landuse', 'shape_area'] },
        transform: { preset: 'box-stats' },
        events: [next.PlotEvent.CLICK],
    });
    const rowsOf = (plot: next.AutkPlot) => plot.instance['_data'] as unknown as BoxStatsRow[];

    test('quartiles, median witnesses, and whiskers match the data', () => {
        const { plot } = mount(boxplot());
        const features = collection().features;
        for (const row of rowsOf(plot)) {
            const values = sortNumbers(features.filter(f => f.properties!.landuse === row.category).map(f => f.properties!.shape_area));
            expect(row.q1).toBeCloseTo(d3.quantileSorted(values, 0.25)!);
            expect(row.median).toBeCloseTo(d3.quantileSorted(values, 0.5)!);
            expect(row.q3).toBeCloseTo(d3.quantileSorted(values, 0.75)!);

            const witnessValues = row.medianIds.map(i => features[i].properties!.shape_area as number);
            expect(witnessValues.reduce((a, b) => a + b, 0) / witnessValues.length).toBeCloseTo(row.median);
            const iqr = row.q3 - row.q1;
            for (const id of row.outlierIds) {
                const v = features[id].properties!.shape_area as number;
                expect(v < row.q1 - 1.5 * iqr || v > row.q3 + 1.5 * iqr).toBe(true);
            }
        }
    });

    test('relations agree with autkIds: D0 → groups N:1 → box summaries 1:1', () => {
        const { plot } = mount(boxplot());
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:1', '1:1', '1:1', 'N:1']);
        rowsOf(plot).forEach((row, index) => {
            const path = plot.provenance.inverse([`mark:aggregate:${index}`]);
            expect(featureIndices(path[path.length - 1].ids)).toEqual(sortNumbers(row.autkIds));
        });
    });

    test('segregated view: one dot per selected feature at its value, with its role', () => {
        const { plot, partials } = mount(boxplot());
        const row = rowsOf(plot)[0];
        const chosen = [row.medianIds[0], ...row.autkIds.filter(id => !row.medianIds.includes(id)).slice(0, 1)];
        plot.setSelection(chosen);

        expect(partials().map(p => Number(p.getAttribute('data-autk-feature'))).sort()).toEqual(sortNumbers(chosen));
        const roles = Object.fromEntries(partials().map(p => [p.getAttribute('data-autk-feature'), p.getAttribute('data-autk-role')]));
        expect(roles[String(row.medianIds[0])]).toBe('median');
    });

    test('a local click on a box keeps the whole-box highlight', () => {
        const { div, partials, plot } = mount(boxplot());
        div.querySelector('.autkMark')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(partials()).toHaveLength(0);
        expect(sortNumbers(plot.selection)).toEqual(sortNumbers(rowsOf(plot)[0].autkIds));
    });
});

describe('sankey with flows (segments make link provenance exact)', () => {
    const COLUMNS = ['ntatype', 'landuse', 'cdta2020'];
    const sankey = (reducer: 'count' | 'avg' = 'count'): UnifiedPlotConfig => ({
        type: 'sankey',
        collection: collection(),
        attributes: { axis: COLUMNS },
        transform: { preset: 'flows', options: { reducer, value: 'shape_area' } },
        events: [next.PlotEvent.CLICK],
    });
    const rowsOf = (plot: next.AutkPlot) => plot.instance['_data'] as unknown as FlowRow[];
    const markOf = (row: FlowRow) => `mark:${row.kind}:${row.key}`;

    test('stages: features → segments (1:N) → links (N:1) → nodes (N:N)', () => {
        const { plot } = mount(sankey());
        const features = collection().features;
        const distinct = (f: (p: Record<string, unknown>) => string) => new Set(features.map(x => f(x.properties!))).size;
        const links = distinct(p => `${p.ntatype}|${p.landuse}`) + distinct(p => `${p.landuse}|${p.cdta2020}`);
        const nodes = COLUMNS.reduce((acc, c) => acc + distinct(p => String(p[c])), 0);

        expect(plot.provenance.stages.map(s => [s.name, s.label, s.ids.length])).toEqual([
            ['D0', 'features', 38], ['D1', 'segments', 76], ['D2', 'links', links], ['D3', 'nodes', nodes], ['M', 'marks', links + nodes],
        ]);
        expect(plot.provenance.cardinalities.map(c => `${c.source}→${c.target} ${c.cardinality}`)).toEqual([
            'D0→D1 1:N', 'D1→D2 N:1', 'D2→D3 N:N', 'D2+D3→M 1:1', 'D0→M N:N',
        ]);
    });

    test('every link and node traces back exactly to the features that pass through it', () => {
        const { plot } = mount(sankey());
        for (const row of rowsOf(plot)) {
            const path = plot.provenance.inverse([markOf(row)]);
            expect(featureIndices(path[path.length - 1].ids)).toEqual(sortNumbers(row.autkIds));
        }
    });

    test('a chain through nodes would over-approximate links; the segment chain does not', () => {
        const { plot } = mount(sankey());
        const rows = rowsOf(plot);

        // Composing feature → node → link (through nodes only) reaches links a feature never walked.
        const linksOfNode = (key: string) => rows.filter(r => r.kind === 'link' && (r.source === key || r.target === key)).map(r => r.key);
        const feature0Nodes = rows.filter(r => r.kind === 'node' && r.autkIds.includes(0)).map(r => r.key);
        const naiveLinks = new Set(feature0Nodes.flatMap(linksOfNode));
        const exactLinks = plot.provenance.direct([0])[2].ids.map(id => id.slice('link:'.length));
        expect(exactLinks).toHaveLength(2);
        expect(naiveLinks.size).toBeGreaterThan(exactLinks.length);
    });

    test('a feature reaches its two segments, two links, and three nodes', () => {
        const { plot } = mount(sankey());
        expect(plot.provenance.direct([0]).map(step => step.ids.length)).toEqual([1, 2, 2, 3, 5]);
    });

    test('segregated view fills the selected part of links and nodes', () => {
        const { plot, partials } = mount(sankey());
        plot.setSelection([0]);
        expect(partials()).toHaveLength(5);
        for (const part of partials()) expect(part.getAttribute('data-autk-units')).toMatch(/^1\/\d+$/);
    });

    test('clicking a link or a node covers its features fully: shares are computed per step and per column', () => {
        // Each feature lies entirely in one node per column and walks one link per step,
        // so counting all its nodes (1/3) or links (1/2) together would be wrong.
        for (const kind of ['link', 'node'] as const) {
            const { div, plot } = mount(sankey());
            const row = rowsOf(plot).find(r => r.kind === kind)!;
            const emitted: next.PlotEventData[] = [];
            plot.events.on(next.PlotEvent.CLICK, (data) => emitted.push(data));

            Array.from(div.querySelectorAll('.autkMark'))
                .find(mark => mark.getAttribute('data-autk-provenance') === markOf(row))!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(sortNumbers(plot.selection)).toEqual(sortNumbers(row.autkIds));
            expect(emitted[0].shares!.every(s => s.selectedUnits === 1 && s.totalUnits === 1), kind).toBe(true);
        }
    });

    test('selecting a whole column covers every feature fully', () => {
        const { plot } = mount(sankey());
        const columnOne = rowsOf(plot).filter(r => r.kind === 'node' && r.column === 1).map(r => `node:${r.key}`);
        const shares = plot.provenance.featureShares(columnOne);
        expect(shares).toHaveLength(38);
        expect(shares.every(s => s.selectedUnits === s.totalUnits)).toBe(true);
    });

    test('non-additive reducers are rejected', () => {
        expect(() => mount(sankey('avg'))).toThrow(/additive/);
    });
});
