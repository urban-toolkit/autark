/**
 * @fileoverview Line and area charts of event buckets or reduced series.
 *
 * Reads the buckets of a `binning-events`, `reduce-series`, or registered `series` transform, in
 * bucket order (dates, numbers, then text), one point each, joined by a line. A selection
 * elsewhere moves each point to the value of the selected subset and redraws the line (and the
 * area, for count and sum); for avg, min, and max a bucket without selected units is a gap.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'month', reducer: 'sum', value: 'cases' } },
 *   labels: { axis: ['month', 'cases'], title: 'Monthly Cases' }
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';
import { PlotStyle } from '../plot-style';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotDrawContext, PlotSeries } from './registered';

/** Orders buckets as dates, then as numbers, then as text. */
function compareBuckets(a: string, b: string): number {
    const [dateA, dateB] = [new Date(a).getTime(), new Date(b).getTime()];
    if (Number.isFinite(dateA) && Number.isFinite(dateB)) return dateA - dateB;
    const [numA, numB] = [Number(a), Number(b)];
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
    return a.localeCompare(b);
}

/** Labels of a series transform: time and value, or bucket and value for events. */
function seriesLabels(config: PlotConfig): Partial<PlotConfig> {
    const series = config.transform?.preset === 'reduce-series';
    return { tickFormats: ['~s', '~s'], labels: { axis: series ? ['time', 'value'] : ['bucket', 'value'], title: series ? 'Series' : 'Events over time' } };
}

/** Draws the points and the line, and under them the area when `filled`. */
function drawSeries(context: PlotDrawContext, filled: boolean): { design: PlotDefinition['design']; series: PlotSeries[] } {
    const { group, width, height, value, format, axisX, axisY, partRange } = context;
    const bucket = (row: AutkDatum) => String(value(row, 0));
    const amount = (row: AutkDatum) => Number(value(row, 1));
    const rows = context.rows.slice().sort((a, b) => compareBuckets(bucket(a), bucket(b)));
    const index = new Map(rows.map((row, i) => [row, i]));
    // Numeric buckets take the x format; other labels are kept as they are.
    const label = (row: AutkDatum) => {
        const n = Number(bucket(row));
        return Number.isFinite(n) && String(n) === bucket(row) ? format(0)(n) : bucket(row);
    };

    // Parts lie between 0 and their bucket (count, sum), or anywhere in the reduced values (avg, min, max).
    const values = rows.map(amount);
    if (partRange) values.push(...(partRange.additive ? [0] : partRange.extent));
    const [low, high] = values.length > 0 ? [Math.min(...values), Math.max(...values)] : [0, 50];
    const pad = (high - low) * 0.1 || 1;
    const x = d3.scaleLinear([0, Math.max(rows.length, 1) - 1], [0, width]);
    const y = d3.scaleLinear([partRange?.additive && low >= 0 ? 0 : low - pad, high + pad], [height, 0]);

    axisX(d3.axisBottom(x).ticks(Math.min(Math.max(rows.length, 1), 12)).tickFormat(i => (rows[+i] ? label(rows[+i]) : format(0)(+i))))
        .selectAll('.tick text')
        .style('font-size', '11px')
        .attr('transform', 'rotate(-45)')
        .attr('text-anchor', 'end')
        .attr('dx', '-0.4em')
        .attr('dy', '0.4em');
    axisY(d3.axisLeft(y).ticks(5).tickSizeInner(-width).tickFormat(format(1)));

    const series: PlotSeries[] = [];
    if (filled) {
        // The area reaches 0, or the bottom of the plot when 0 is below the axis.
        const clamped = y.copy().clamp(true);
        const [bottom, top] = y.domain();
        const base = clamped(Math.min(Math.max(0, bottom), top));
        const areaOf = (v: (row: AutkDatum) => number | null) => d3.area<AutkDatum>()
            .x(row => x(index.get(row)!))
            .y0(base)
            .y1(row => clamped(v(row) ?? 0))(rows);
        const area = group.append('path')
            .datum(rows)
            .attr('class', 'autk-area')
            .attr('d', areaOf(amount))
            // A gray area lets the parts stand out.
            .style('fill', PlotStyle.default)
            .style('fill-opacity', 0.35)
            .style('pointer-events', 'none');
        series.push({ element: area.node()!, rows, path: areaOf });
    }

    const lineOf = (v: (row: AutkDatum) => number | null) => d3.line<AutkDatum>()
        .defined(row => v(row) !== null)
        .x(row => x(index.get(row)!))
        .y(row => y(v(row)!))(rows);
    const line = group.append('path')
        .datum(rows)
        .attr('class', 'autk-line')
        .attr('fill', 'none')
        .attr('stroke', PlotStyle.default)
        .attr('stroke-width', 1.5)
        .attr('d', lineOf(amount));
    series.push({ element: line.node()!, rows, path: lineOf });

    group.selectAll('circle.autkMark')
        .data(rows)
        .join('circle')
        .attr('class', 'autkMark')
        .attr('cx', row => x(index.get(row)!))
        .attr('cy', row => y(amount(row)))
        .attr('r', 5)
        .append('title')
        .text(row => `${label(row)}: ${d3.format('~s')(amount(row))}`);

    group.selectAll('text.autk-empty')
        .data(rows.length === 0 ? ['No series data available'] : [])
        .join('text')
        .attr('class', 'autk-empty')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#aaa')
        .text(d => d);

    // A point's value is its height above 0: the part of a bucket sits at the subset value.
    return { design: { point: { rule: 'position', axis: 'y', baseline: y(0) } }, series };
}

/** Points of a series transform, one per bucket, joined by a line. */
export const linechart: PlotDefinition = {
    name: 'linechart',
    label: 'Linechart',
    transforms: ['reduce-series', 'binning-events', 'series'],
    requiresTransform: true,
    topK: false,
    defaults: seriesLabels,
    draw: context => drawSeries(context, false),
};

/** Points of the line chart, with the region under the line filled. */
export const areachart: PlotDefinition = {
    ...linechart,
    name: 'areachart',
    label: 'Area chart',
    draw: context => drawSeries(context, true),
};
