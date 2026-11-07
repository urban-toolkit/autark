/**
 * @fileoverview Heat matrix of a numeric value over two categorical axes.
 *
 * Reads the (x, y) cells of a `binning-2d` transform, each colored by its reduced value
 * (`attributes.color: '@transform'`). Cells reduce many features, so a selection elsewhere shows
 * the part of each cell it produces: an inner square of the selected area for count and sum, a
 * half-size square colored by the subset value for avg, min, and max.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'heatmatrix',
 *   collection: geojson,
 *   attributes: { axis: ['day', 'hour'], color: '@transform' },
 *   transform: { preset: 'binning-2d', options: { reducer: 'sum', value: 'trips' } },
 *   labels: { axis: ['Day', 'Hour'], title: 'Activity Heatmap' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Labels of an axis in the order the transform gives them (`xOrder` / `yOrder`). */
function ordered(rows: AutkDatum[], label: (row: AutkDatum) => string, order: (row: AutkDatum) => number): string[] {
    const orders = new Map(rows.map(row => [label(row), order(row)]));
    return Array.from(orders.entries()).sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

/** Cells of a `binning-2d` transform, colored by their reduced value. */
export const heatmatrix: PlotDefinition = {
    name: 'heatmatrix',
    label: 'Heatmatrix',
    transforms: ['binning-2d'],
    requiresTransform: true,
    topK: false,
    // Cells have one size: the value is in the color, never in the geometry.
    design: { rect: { rule: 'glyph' } },

    draw({ group, rows, width, height, value, axisX, axisY }) {
        const xLabel = (row: AutkDatum) => String(value(row, 0));
        const yLabel = (row: AutkDatum) => String(value(row, 1));
        const x = d3.scaleBand(ordered(rows, xLabel, row => Number(row.xOrder)), [0, width]).padding(0.05);
        const y = d3.scaleBand(ordered(rows, yLabel, row => Number(row.yOrder)), [0, height]).padding(0.05);

        axisX(d3.axisBottom(x).tickSizeOuter(0))
            .selectAll('.tick text')
            .style('text-anchor', 'end')
            .attr('dx', '-0.6em')
            .attr('dy', '0.1em')
            .attr('transform', 'rotate(-45)');
        axisY(d3.axisLeft(y).tickSizeOuter(0));

        group.selectAll('rect.autkMark')
            .data(rows)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => x(xLabel(row)) ?? 0)
            .attr('y', row => y(yLabel(row)) ?? 0)
            .attr('width', x.bandwidth())
            .attr('height', y.bandwidth())
            .append('title')
            .text(row => `${xLabel(row)} · ${yLabel(row)}: ${d3.format('~s')(Number(row.value))}`);
    },
};
