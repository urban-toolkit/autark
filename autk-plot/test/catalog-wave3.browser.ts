/**
 * Catalog wave 3: fractional coverage (weights in ℝ≥0).
 *
 * - density: each feature spreads an Epanechnikov kernel over the grid points
 *   within one bandwidth of its value; points sum real weights (N:N)
 * - density chart and violin plot over it
 *
 * The inverse direction now gives continuous shares: a selected interval covers
 * each feature by the part of its kernel mass inside it.
 */

import * as d3 from 'd3';
import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { DensityPointRow, FeatureShare, PlotEventData, UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const lengths = () => regions().features.map(f => f.properties!.shape_leng as number);
const landuses = () => regions().features.map(f => f.properties!.landuse as string);

function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, config);
    const points = () => plot.instance['_data'] as unknown as DensityPointRow[];
    const rowId = (row: unknown) => plot.instance['rowIdOf'](row) as string;
    // Row ids hold JSON, so partials are matched by attribute value rather than by CSS selector.
    const partialOf = (row: unknown) => Array.from(div.querySelectorAll('.autkPartial'))
        .find(p => p.getAttribute('data-autk-provenance') === `mark:${rowId(row)}`) ?? null;
    return { div, plot, points, rowId, partialOf };
}

const density = (bandwidth?: number): UnifiedPlotConfig => ({
    type: 'density',
    collection: regions(),
    attributes: { axis: ['shape_leng'] },
    transform: { preset: 'density', options: bandwidth ? { bandwidth } : {} },
    events: [next.PlotEvent.CLICK],
});
const violin = (): UnifiedPlotConfig => ({
    type: 'violin',
    collection: regions(),
    attributes: { axis: ['landuse', 'shape_leng'] },
    transform: { preset: 'density' },
    events: [next.PlotEvent.CLICK],
});

/** Plot-specific fields of the concrete plot, read by the tests. */
const internals = (plot: next.AutkPlot) => plot.instance as unknown as {
    mapY: (density: number) => number;
    widthPerDensity: number;
};

/** Area under a curve sampled at `[x, y]` points (trapezoids). */
const integral = (curve: [number, number][]) => d3.sum(curve.slice(1), ([x, y], i) => (x - curve[i][0]) * (y + curve[i][1]) / 2);
/** Epanechnikov kernel. */
const kernel = (u: number) => Math.abs(u) < 1 ? 0.75 * (1 - u * u) : 0;

describe('density preset (fractional coverage)', () => {
    const H = 4000;

    test('each curve integrates to 1', () => {
        const { points } = mount(density(H));
        expect(integral(points().map(p => [p.x, p.value]))).toBeCloseTo(1, 1);

        const grouped = mount(violin()).points();
        for (const group of new Set(grouped.map(p => p.group))) {
            expect(integral(grouped.filter(p => p.group === group).map(p => [p.x, p.value]))).toBeCloseTo(1, 1);
        }
    });

    test('a point is the sum of the kernels of the features within one bandwidth', () => {
        const { points } = mount(density(H));
        const values = lengths();
        for (const point of points()) {
            const near = values.flatMap((v, i) => Math.abs(point.x - v) < H ? [i] : []);
            expect([...point.autkIds].sort((a, b) => a - b)).toEqual(near);
            const expected = d3.sum(values, v => kernel((point.x - v) / H)) / (values.length * H);
            expect(point.value).toBeCloseTo(expected, 12);
        }
    });

    test('relations carry real weights, and features and points relate N:N', () => {
        const { plot } = mount(density(H));
        const weights = plot.provenance.relations[0].pairs.map(p => p.weight);
        expect(weights.every(w => w > 0)).toBe(true);
        expect(weights.some(w => !Number.isInteger(w))).toBe(true);
        expect(plot.provenance.cardinalities.map(c => c.cardinality)).toEqual(['N:N', '1:1', 'N:N']);
    });
});

describe('density chart', () => {
    const H = 4000;

    test('segregated view: the subset curve is the density of the selected features, under the total', () => {
        const { plot, points, partialOf, div } = mount(density(H));
        const chosen = [0, 3, 7, 12];
        plot.setSelection(chosen);
        const values = lengths();
        const mapY = internals(plot).mapY;
        for (const point of points()) {
            const expected = d3.sum(chosen, i => kernel((point.x - values[i]) / H)) / (values.length * H);
            expect(expected).toBeLessThanOrEqual(point.value + 1e-15);
            const partial = partialOf(point);
            if (expected === 0) expect(partial).toBeNull();
            else expect(Number(partial!.getAttribute('cy'))).toBeCloseTo(mapY(expected), 6);
        }
        expect(div.querySelector('.autkPartialArea')).not.toBeNull();
    });

    test('inverse direction: selecting points covers each feature by the part of its kernel mass', () => {
        const { plot, points, rowId } = mount(density(H));
        const all = points().map(rowId);
        // The whole curve covers every feature fully.
        for (const share of plot.provenance.featureShares(all)) {
            expect(share.selectedUnits / share.totalUnits).toBeCloseTo(1, 10);
        }
        // Half the curve covers some features only in part: shares are continuous.
        const half = points().filter(p => p.x <= d3.median(lengths())!).map(rowId);
        const ratios = plot.provenance.featureShares(half).map(s => s.selectedUnits / s.totalUnits);
        expect(ratios.some(r => r > 0.01 && r < 0.99)).toBe(true);
        expect(ratios.every(r => r > 0 && r <= 1 + 1e-12)).toBe(true);
    });

    test('a share is the exact part of the kernel mass in the selection, not a count of points', () => {
        const { plot, points, rowId } = mount(density(H));
        const values = lengths();
        const threshold = d3.median(values)!;
        const half = points().filter(p => p.x <= threshold);
        const mass = (feature: number, rows: DensityPointRow[]) => d3.sum(rows, p => kernel((p.x - values[feature]) / H));
        for (const share of plot.provenance.featureShares(half.map(rowId))) {
            const expected = mass(share.feature, half) / mass(share.feature, points());
            expect(share.selectedUnits / share.totalUnits).toBeCloseTo(expected, 10);
        }
    });

    test('a click sends fractional shares that a scatterplot paints as partial discs', () => {
        const source = mount(density(H));
        const target = mount({ type: 'scatterplot', collection: regions(), attributes: { axis: ['shape_area', 'shape_leng'] } });
        const emitted: PlotEventData[] = [];
        source.plot.events.on(next.PlotEvent.CLICK, data => { emitted.push(data); target.plot.setSelection(data.selection, data.shares); });

        const marks = Array.from(source.div.querySelectorAll('.autkMark'));
        marks.find(m => (m as unknown as { __data__: DensityPointRow }).__data__.autkIds.length > 0)!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const shares = emitted[0].shares as FeatureShare[];
        expect(shares.length).toBeGreaterThan(0);
        expect(shares.every(s => s.selectedUnits < s.totalUnits)).toBe(true);
        for (const share of shares) {
            const disc = target.div.querySelectorAll('.autkPartial')[shares.indexOf(share)];
            expect(disc).toBeDefined();
        }
        const radii = Array.from(target.div.querySelectorAll('.autkPartial')).map(d => Number(d.getAttribute('r')));
        expect(radii.every(r => r > 0 && r < 5)).toBe(true);
    });
});

describe('violin plot', () => {
    test('one violin per land use; each strip is as wide as the density there', () => {
        const { plot, points, div } = mount(violin());
        const groups = new Set(landuses());
        expect(new Set(points().map(p => p.group))).toEqual(groups);
        const perDensity = internals(plot).widthPerDensity;
        for (const strip of Array.from(div.querySelectorAll('.autkMark'))) {
            const point = (strip as unknown as { __data__: DensityPointRow }).__data__;
            expect(Number(strip.getAttribute('width'))).toBeCloseTo(2 * point.value * perDensity, 6);
        }
    });

    test('segregated view: the inner violin is the density of the selected features of each land use', () => {
        const { plot, points, partialOf } = mount(violin());
        const point = points().find(p => p.autkIds.length >= 3)!;
        plot.setSelection([point.autkIds[0]]);
        const partial = partialOf(point)!;
        const contribution = plot.provenance.contribution(plot.instance['rowIdOf'](point) as string, new Set([point.autkIds[0]]));
        const perDensity = internals(plot).widthPerDensity;
        expect(Number(partial.getAttribute('width'))).toBeCloseTo(2 * contribution.value! * perDensity, 6);
        expect(contribution.value!).toBeLessThan(point.value);
    });

    test('a group column is required', () => {
        expect(() => mount({ ...violin(), attributes: { axis: ['shape_leng'] } })).toThrow(/group/);
    });
});
