/**
 * @fileoverview Pie and donut charts of the shares of a whole.
 *
 * Reads the groups of a `binning-1d` transform, one slice each, starting at 12 o'clock in data
 * order. Slices must add up to the whole, so only additive reducers (count, sum) are accepted. A
 * selection elsewhere shows an inner slice of the selected area, growing from the hole outward.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'donut',
 *   collection: geojson,
 *   attributes: { axis: ['category', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 *   labels: { title: 'Features by category' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotDrawContext } from './registered';

/** Minimum slice angle, in radians, for its label to be drawn inside it. */
const MIN_LABEL_ANGLE = 0.3;

/** Draws the slices, with a hole of `innerRatio` times the outer radius. */
function drawPie({ group, rows, width, height, value }: PlotDrawContext, innerRatio: number): void {
    const amount = (row: AutkDatum) => Math.max(0, Number(value(row, 1)) || 0);
    const arcs = new Map(d3.pie<AutkDatum>().sort(null).value(amount)(rows).map(arc => [arc.data, arc]));
    const outer = Math.max(1, Math.min(width, height) / 2 - 2);
    const arc = d3.arc<d3.PieArcDatum<AutkDatum>>().innerRadius(outer * innerRatio).outerRadius(outer);
    const middle = outer * (innerRatio > 0 ? (1 + innerRatio) / 2 : 0.6);
    const labelArc = d3.arc<d3.PieArcDatum<AutkDatum>>().innerRadius(middle).outerRadius(middle);

    const center = group.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    center.selectAll('path.autkMark')
        .data(rows)
        .join('path')
        .attr('class', 'autkMark')
        .attr('d', row => arc(arcs.get(row)!))
        .style('stroke', '#ffffff')
        .style('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .append('title')
        .text(row => `${value(row, 0)}: ${d3.format('~s')(amount(row))}`);

    // Labels inside slices wide enough to hold them; they never intercept clicks.
    center.selectAll('text.autk-pie-label')
        .data(rows.filter(row => arcs.get(row)!.endAngle - arcs.get(row)!.startAngle >= MIN_LABEL_ANGLE))
        .join('text')
        .attr('class', 'autk-pie-label')
        .attr('transform', row => `translate(${labelArc.centroid(arcs.get(row)!)})`)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '11px')
        .style('fill', '#24292f')
        .style('pointer-events', 'none')
        .text(row => String(value(row, 0)));
}

/** Slices of an additive `binning-1d` transform, one per group. */
export const piechart: PlotDefinition = {
    name: 'pie',
    label: 'Pie chart',
    transforms: ['binning-1d', 'category-value'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    // The part of a slice is the inner slice of the selected area.
    design: { sector: { rule: 'angle', mode: 'radial' } },
    draw: context => drawPie(context, 0),
};

/** Slices of the pie chart around a hole of 55% of its radius. */
export const donutchart: PlotDefinition = {
    ...piechart,
    name: 'donut',
    label: 'Donut chart',
    draw: context => drawPie(context, 0.55),
};
