/**
 * @fileoverview Scatter plot of two numeric attributes.
 *
 * Each point is one row: a feature, unless a transform gives other rows. Clicks and brushes select
 * the features of the points.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'scatterplot',
 *   collection: geojson,
 *   attributes: { axis: ['population', 'income'] },
 *   labels: { axis: ['Population', 'Income'], title: 'Population vs Income' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotDrawContext } from './registered';

/** Radius of a point mark in pixels. */
const POINT_RADIUS = 5;

/** Points of two numeric attributes (`axis[0]` on x, `axis[1]` on y). */
export const scatterplot: PlotDefinition = {
    name: 'scatterplot',
    label: 'Scatterplot',
    topK: false,
    defaults: { tickFormats: ['~s', '~s'] },
    validate: config => {
        if ((config.attributes?.axis?.length ?? 0) < 2) throw new Error('Scatterplot requires two dimensions.');
    },
    // A point is one feature: its part is the share of that feature, shown as
    // an inner disc of that area, never as a value.
    design: { point: { rule: 'glyph' } },

    draw(context) {
        const { group, rows, value } = context;
        const [x, y] = gridAxes(context);

        group.selectAll('circle.autkMark')
            .data(rows)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', row => x(Number(value(row, 0)) || 0))
            .attr('cy', row => y(Number(value(row, 1)) || 0))
            .attr('r', POINT_RADIUS)
            .append('title')
            .text(pointTitle(context, 2));
    },
};

/**
 * Tooltip of a point: the label and value of each of its first fields, one per line.
 * Shared by the scatter plot and the bubble chart.
 *
 * @param context Drawing context of the plot.
 * @param count Number of fields shown.
 * @returns The tooltip text of a row.
 */
export function pointTitle(context: PlotDrawContext, count: number): (row: AutkDatum) => string {
    const { fields, value, axisLabels } = context;
    return row => fields.slice(0, count).map((field, i) => `${axisLabels[i] ?? field}: ${d3.format('~s')(Number(value(row, i)) || 0)}`).join('\n');
}

/**
 * Linear scales of `axis[0]` and `axis[1]` over the rows, drawn as axes with light grid lines.
 * Shared by the scatter plot and the bubble chart.
 *
 * @param context Draw context of the plot.
 * @returns The x and y scales.
 */
export function gridAxes(context: PlotDrawContext): [d3.ScaleLinear<number, number>, d3.ScaleLinear<number, number>] {
    const { rows, value, width, height, format, axisX, axisY } = context;
    // Rows with no number on an axis (such as the cells of binning-2d) would all sit at zero.
    for (const index of [0, 1]) {
        if (rows.length > 0 && !rows.some(row => Number.isFinite(Number(value(row, index))) && value(row, index) !== '')) {
            throw new Error(`Points need numbers on both axes: field ${index + 1} has none in these rows.`);
        }
    }
    const extent = (index: number) => d3.extent(rows, (row: AutkDatum) => Number(value(row, index)) || 0) as [number, number];
    const x = d3.scaleLinear(extent(0), [0, width]);
    const y = d3.scaleLinear(extent(1), [height, 0]);

    axisX(d3.axisBottom(x).tickSizeInner(-height).tickFormat(format(0)));
    axisY(d3.axisLeft(y).tickSizeInner(-width).tickFormat(format(1)));
    return [x, y];
}
