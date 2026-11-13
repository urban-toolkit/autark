/**
 * @fileoverview Density chart of the kernel density estimate of a numeric attribute.
 *
 * Reads the grid points of a `density` transform, filled under a smooth curve, one curve per group
 * in gray shades. Each feature spreads its kernel over the points near its value, so a brushed
 * interval covers each feature by the part of its kernel mass inside it (fractional shares). A
 * selection elsewhere moves each point to the density of the selected features alone.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'density',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area'] },
 *   transform: { preset: 'density' },
 *   labels: { axis: ['area', 'density'], title: 'Distribution of areas' }
 * });
 */

import * as d3 from 'd3';

import { PlotStyle } from '../plot-style';
import type { DensityPointRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotSeries } from './registered';

/** Radius of a grid point mark in pixels. */
const POINT_RADIUS = 2.5;

const pointOf = (row: AutkDatum) => row as unknown as DensityPointRow;

/** Groups in curve order, and the gray shade of each. */
function groupShades(rows: AutkDatum[]): { groups: string[]; shade: (group: string) => string } {
    const groups = Array.from(new Set(rows.map(row => pointOf(row).group)));
    return { groups, shade: PlotStyle.shades(groups) };
}

/** Grid points of a `density` transform, one curve per group. */
export const densitychart: PlotDefinition = {
    name: 'density',
    label: 'Density chart',
    transforms: ['density'],
    requiresTransform: true,
    topK: false,
    defaults: { tickFormats: ['~s', ''] },
    baseColor: rows => {
        const { shade } = groupShades(rows);
        return row => shade(pointOf(row).group);
    },

    draw({ group, rows, width, height, axisX, axisY, format }) {
        const { groups, shade } = groupShades(rows);
        const [lo, hi] = d3.extent(rows, row => pointOf(row).x) as [number | undefined, number | undefined];
        const x = d3.scaleLinear([lo ?? 0, hi ?? 1], [0, width]);
        const y = d3.scaleLinear([0, (d3.max(rows, row => pointOf(row).value) || 1) * 1.05], [height, 0]);

        axisX(d3.axisBottom(x).ticks(6).tickFormat(format(0, '~s')));
        // Densities are relative: the y axis shows no numbers.
        const yAxis = axisY(d3.axisLeft(y).ticks(0).tickSizeOuter(0));
        if (!yAxis.select('.axis-label').text()) yAxis.select('.axis-label').text('density');

        // One curve per group, filled down to 0.
        const series: PlotSeries[] = groups.map(name => {
            const points = rows.filter(row => pointOf(row).group === name);
            const areaOf = (v: (row: AutkDatum) => number | null) => d3.area<AutkDatum>()
                .x(row => x(pointOf(row).x))
                .y0(y(0))
                .y1(row => y(v(row) ?? 0))
                .curve(d3.curveMonotoneX)(points);
            const curve = group.append('path')
                .datum(points)
                .attr('class', 'autk-density-curve')
                .attr('d', areaOf(row => pointOf(row).value))
                .style('fill', shade(name))
                .style('fill-opacity', 0.45)
                .style('stroke', shade(name))
                .style('stroke-width', 1.5)
                .style('pointer-events', 'none');
            return { element: curve.node()!, rows: points, path: areaOf };
        });

        group.selectAll('circle.autkMark')
            .data(rows)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', row => x(pointOf(row).x))
            .attr('cy', row => y(pointOf(row).value))
            .attr('r', POINT_RADIUS)
            .style('cursor', 'pointer')
            .append('title')
            .text(row => {
                const n = pointOf(row).autkIds.length;
                return `${pointOf(row).label}: ${n} ${n === 1 ? 'feature' : 'features'} within one bandwidth`;
            });

        return { design: { point: { rule: 'position', axis: 'y', baseline: y(0) } }, series };
    },
};
