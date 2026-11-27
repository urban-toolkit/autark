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

import type { HighlightRule, MarkKind } from './partial-design';
import type { PlotDefinition, PlotDrawContext, PlotSeries } from './registered';

/** Parses ISO-style buckets with no explicit time zone as UTC. */
function bucketTime(key: string): number {
    const iso = key.replace(' ', 'T');
    const unzoned = /^\d{4}-\d{2}-\d{2}T/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
    return Date.parse(unzoned ? `${iso}Z` : iso);
}

/** Orders buckets as dates, then as numbers, then as text. */
function compareBuckets(a: string, b: string): number {
    const [dateA, dateB] = [bucketTime(a), bucketTime(b)];
    if (Number.isFinite(dateA) && Number.isFinite(dateB)) return dateA - dateB;
    const [numA, numB] = [Number(a), Number(b)];
    if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
    return a.localeCompare(b);
}

/** Labels of a series transform: time and value, or bucket and value for events. */
function seriesLabels(config: PlotConfig): Partial<PlotConfig> {
    const series = config.transform?.preset === 'reduce-series';
    return { labels: { axis: series ? ['time', 'value'] : ['bucket', 'value'], title: series ? 'Series' : 'Events over time' } };
}

/** Draws the points and the line, and under them the area when `filled`. */
function drawSeries(context: PlotDrawContext, filled: boolean): { highlight: Partial<Record<MarkKind, HighlightRule>>; series: PlotSeries[] } {
    const { group, width, height, value, format, hasFormat, axisX, axisY, partRange, xTickLabel, scaleDomain, visibleRows } = context;
    const bucket = (row: AutkDatum) => String(value(row, 0));
    const amount = (row: AutkDatum) => Number(value(row, 1));
    const xDomain = scaleDomain?.('x', 'categorical');
    const yDomain = scaleDomain?.('y', 'numeric');
    const order = new Map(xDomain?.map((key, i) => [key, i]));
    const rows = (xDomain ? visibleRows?.(row => order.has(bucket(row))) ?? context.rows : context.rows).slice()
        .sort((a, b) => xDomain ? order.get(bucket(a))! - order.get(bucket(b))! : compareBuckets(bucket(a), bucket(b)));
    const index = new Map(rows.map((row, i) => [row, xDomain ? order.get(bucket(row))! : i]));
    const positionOf = (row: AutkDatum) => index.get(row)!;
    // A bucket is written as it is ("2020"), or with the x format the configuration gives, when it reads as a number.
    const label = (key: string) => {
        const n = Number(key);
        return hasFormat(0) && Number.isFinite(n) && String(n) === key ? format(0)(n) : key;
    };

    // Parts lie between 0 and their bucket (count, sum), or anywhere in the reduced values (avg, min, max).
    const values = context.rows.map(amount);
    if (partRange) values.push(...(partRange.additive ? [0] : partRange.extent));
    const [low, high] = values.length > 0 ? [Math.min(...values), Math.max(...values)] : [0, 50];
    const pad = (high - low) * 0.1 || 1;
    const keys = xDomain ?? rows.map(bucket);
    const x = d3.scaleLinear([0, Math.max(keys.length, 1) - 1], [0, width]);
    const y = d3.scaleLinear(yDomain ?? [partRange?.additive && low >= 0 ? 0 : low - pad, high + pad], [height, 0]);

    // Format labels without changing bucket keys or point positions.
    const times = xTickLabel ? [] : keys.map(key => /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(key) ? bucketTime(key) : NaN);
    const isTemporal = times.length > 0 && times.every(Number.isFinite);
    const shortSpan = isTemporal && d3.max(times)! - d3.min(times)! <= 4 * 86_400_000;
    const dateLabel = d3.utcFormat('%b %-d');
    const hourLabel = d3.utcFormat('%b %-d %Hh');
    const labels = keys.map((key, i) => {
        if (xTickLabel) return xTickLabel(key);
        if (!isTemporal) return label(key);
        return (shortSpan && key.length > 10 ? hourLabel : dateLabel)(new Date(times[i]));
    });
    // Custom labels choose positions explicitly; otherwise sample only real bucket ranks.
    const buckets = xTickLabel || xDomain ? keys.map((_, i) => i).filter(i => labels[i] !== '')
        : x.ticks(Math.min(Math.max(keys.length, 1), 12)).filter(Number.isInteger);
    axisX(d3.axisBottom(x).tickValues(buckets).tickFormat(i => labels[+i] ?? String(i)))
        .selectAll('.tick text')
        .style('font-size', '11px')
        .attr('transform', 'rotate(-45)')
        .attr('text-anchor', 'end')
        .attr('dx', '-0.4em')
        .attr('dy', '0.4em');
    // The rank scale positions the marks, but the brush exposes the original keys.
    context.setBrushScale?.('x', d3.scalePoint(keys, [0, width]));
    axisY(d3.axisLeft(y).ticks(5).tickSizeInner(-width).tickFormat(format(1)));

    const series: PlotSeries[] = [];
    if (filled) {
        // Manual domains clip the path at the plot boundary instead of moving its vertices.
        const areaY = yDomain ? y : y.copy().clamp(true);
        const areaOf = (v: (row: AutkDatum) => number | null) => d3.area<AutkDatum>()
            .x(row => x(positionOf(row)))
            .y0(areaY(0))
            .y1(row => areaY(v(row) ?? 0))(rows);
        const area = group.append('path')
            .datum(rows)
            .attr('class', 'autk-area')
            .attr('d', areaOf(amount))
            // A gray area lets the parts stand out.
            .style('fill', PlotStyle.default)
            .style('fill-opacity', 0.35)
            .style('pointer-events', 'none');
        const node = area.node();
        if (!node) throw new Error('SVG element could not be created.');
        series.push({ element: node, rows, path: areaOf });
    }

    const lineOf = (v: (row: AutkDatum) => number | null) => d3.line<AutkDatum>()
        .defined(row => v(row) !== null)
        .x(row => x(positionOf(row)))
        .y(row => y(v(row)!))(rows);
    const line = group.append('path')
        .datum(rows)
        .attr('class', 'autk-line')
        .attr('fill', 'none')
        .attr('stroke', PlotStyle.default)
        .attr('stroke-width', 1.5)
        .attr('d', lineOf(amount));
    const node = line.node();
    if (!node) throw new Error('SVG element could not be created.');
    series.push({ element: node, rows, path: lineOf });

    group.selectAll('circle.autkMark')
        .data(rows)
        .join('circle')
        .attr('class', 'autkMark')
        .attr('cx', row => x(positionOf(row)))
        .attr('cy', row => y(amount(row)))
        .attr('r', 5)
        .append('title')
        .text(row => `${label(bucket(row))}: ${d3.format('~s')(amount(row))}`);

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
    return { highlight: { point: { mode: 'subset', channel: 'position', axis: 'y', baseline: y(0) } }, series };
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
