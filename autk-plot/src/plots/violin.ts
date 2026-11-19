/**
 * @fileoverview Violin plot of the density of a numeric attribute per category.
 *
 * Reads the grid points of a `density` transform, mirrored around each category's center and drawn
 * as thin horizontal strips as wide as the density there (a point no feature reaches has no
 * strip). Selecting strips covers each feature by the part of its kernel mass inside them. A
 * selection elsewhere narrows each strip about its center to the density of the selected features.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'violin',
 *   collection: geojson,
 *   attributes: { axis: ['category', 'shape_area'] },
 *   transform: { preset: 'density' },
 *   labels: { axis: ['category', 'area'], title: 'Area by category' }
 * });
 */

import * as d3 from 'd3';

import type { DensityPointRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Overlap between neighboring strips, in pixels, so anti-aliasing leaves no seams. */
const SEAM = 0.5;

const pointOf = (row: AutkDatum) => row as unknown as DensityPointRow;

/** Strips of a `density` transform, one per grid point of each category. */
export const violin: PlotDefinition = {
    name: 'violin',
    label: 'Violin',
    transforms: ['density'],
    requiresTransform: true,
    topK: false,
    defaults: { tickFormats: ['', '~s'] },
    validate: config => {
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length < 2) {
            throw new Error('Violin requires a group and a numeric column.');
        }
    },
    design: { rect: { rule: 'length', axis: 'x', anchor: 'center' } },

    draw({ group, rows, width, height, axisX, axisY, format }) {
        const points = rows.map(pointOf);
        const groups = Array.from(new Set(points.map(p => p.group)));
        // Categories across, values up; all violins share one density scale.
        const x = d3.scaleBand(groups, [0, width]).padding(0.15);
        const [lo, hi] = d3.extent(points, p => p.x) as [number | undefined, number | undefined];
        const y = d3.scaleLinear([lo ?? 0, hi ?? 1], [height, 0]);
        const widthPerDensity = (x.bandwidth() / 2) / (d3.max(points, p => p.value) || 1);

        axisX(d3.axisBottom(x).tickSizeOuter(0));
        axisY(d3.axisLeft(y).ticks(5).tickSizeInner(-width).tickFormat(format(1, '~s')));

        // Strips: each grid point covers half the way to its neighbors.
        const strips = new Map<AutkDatum, { cx: number; half: number; y0: number; y1: number }>();
        for (const name of groups) {
            const curve = rows.filter(row => pointOf(row).group === name);
            const cx = (x(name) ?? 0) + x.bandwidth() / 2;
            curve.forEach((row, k) => {
                const p = pointOf(row);
                const above = curve[k + 1] ? pointOf(curve[k + 1]).x : p.x + (p.x - (curve[k - 1] ? pointOf(curve[k - 1]).x : p.x));
                const below = curve[k - 1] ? pointOf(curve[k - 1]).x : p.x - (above - p.x);
                strips.set(row, { cx, half: p.value * widthPerDensity, y0: y((p.x + above) / 2), y1: y((p.x + below) / 2) });
            });
        }
        const strip = (row: AutkDatum) => strips.get(row)!;

        group.selectAll('rect.autkMark')
            .data(rows.filter(row => pointOf(row).value > 0))
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => strip(row).cx - strip(row).half)
            .attr('width', row => 2 * strip(row).half)
            .attr('y', row => strip(row).y0 - SEAM / 2)
            .attr('height', row => Math.max(0.5, strip(row).y1 - strip(row).y0) + SEAM)
            .style('cursor', 'pointer')
            .append('title')
            .text(row => {
                const n = pointOf(row).autkIds.length;
                return `${pointOf(row).label}: ${n} ${n === 1 ? 'feature' : 'features'} within one bandwidth`;
            });
    },
};
