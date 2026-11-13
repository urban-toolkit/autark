/**
 * @fileoverview ECDF and Pareto charts of the accumulated shares of a whole.
 *
 * Both read a `cumulative` transform, where point `k` accumulates the bars `0…k` (`N:N`). The
 * ECDF draws a numeric column as a step line with one point per value (or bin); the Pareto chart
 * draws the bars of a categorical column, largest first, under the line of their accumulated
 * share. A selection elsewhere fills each bar from its base and moves each point to the share of
 * the selected features alone, so the redrawn line ends at the selected share of the whole.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'ecdf',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area'] },
 *   transform: { preset: 'cumulative' },
 *   labels: { axis: ['area', 'share of features'], title: 'Distribution of areas' }
 * });
 */

import * as d3 from 'd3';

import { PlotStyle } from '../plot-style';
import { shapeOutput } from '../transforms';
import type { CumulativeRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotDrawContext, PlotSeries } from './registered';

/** Radius of a cumulative point mark in pixels. */
const POINT_RADIUS = 3.5;

const rowOf = (row: AutkDatum) => row as unknown as CumulativeRow;
const percent = d3.format('.0%');

/** Order of the accumulation: ascending values for an ECDF, largest bar first for a Pareto chart. */
const orderOf = (kind: 'ecdf' | 'pareto', options: Record<string, unknown> | undefined) => (options?.order as string | undefined) ?? (kind === 'pareto' ? 'value' : 'key');

/** Draws the bars (Pareto), the line, and the points of a cumulative transform. */
function drawCumulative(context: PlotDrawContext, kind: 'ecdf' | 'pareto'): { design: PlotDefinition['design']; series: PlotSeries[] } {
    const { group, rows, width, height, axisX, axisY, format, transform, tickCount } = context;
    const cumulative = shapeOutput(transform, 'cumulative');
    if (!cumulative) return { design: {}, series: [] };
    if (kind === 'ecdf' && !cumulative.numeric && rows.length > 0) throw new Error('ECDF requires a numeric column.');
    const total = cumulative.total;
    const bars = rows.filter(row => rowOf(row).kind === 'bar');
    const points = rows.filter(row => rowOf(row).kind === 'point');
    const share = d3.scaleLinear([0, 1], [height, 0]);

    // Point positions (and bar boxes): values or categories across.
    let xOf: (row: AutkDatum) => number;
    let count: d3.ScaleLinear<number, number> | undefined;
    let band: d3.ScaleBand<string> | undefined;
    if (kind === 'ecdf') {
        const [lo, hi] = d3.extent(points, row => rowOf(row).upper ?? 0) as [number | undefined, number | undefined];
        const x = d3.scaleLinear([lo ?? 0, hi ?? 1], [0, width]);
        xOf = row => x(rowOf(row).upper ?? 0);
        axisX(d3.axisBottom(x).ticks(6).tickFormat(format(0, '~s')));
        axisY(d3.axisLeft(share).ticks(5).tickSizeInner(-width).tickFormat(percent));
    } else {
        band = d3.scaleBand(bars.map(row => rowOf(row).label), [0, width]).padding(0.25);
        count = d3.scaleLinear([0, Math.max(1, d3.max(bars, row => rowOf(row).value) ?? 0)], [height, 0]).nice();
        const x = band;
        xOf = row => (x(rowOf(row).label) ?? 0) + x.bandwidth() / 2;
        axisX(d3.axisBottom(band).tickSizeOuter(0));
        // Counts take whole ticks only.
        axisY(d3.axisLeft(count).ticks(tickCount(count.domain()[1], bars.map(row => rowOf(row).value), 5)).tickSizeInner(-width).tickFormat(format(1, '~s')));
        // Shares on the right.
        group.append('g')
            .attr('id', 'axisShare')
            .attr('class', 'y axis')
            .attr('transform', `translate(${width}, 0)`)
            .call(d3.axisRight(share).ticks(5).tickFormat(percent));
    }

    if (band && count) {
        const [x, y] = [band, count];
        group.selectAll('rect.autkMark')
            .data(bars)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => x(rowOf(row).label) ?? 0)
            .attr('y', row => y(rowOf(row).value))
            .attr('width', x.bandwidth())
            .attr('height', row => Math.max(0, height - y(rowOf(row).value)))
            .style('stroke', '#ffffff')
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${rowOf(row).label}: ${d3.format('~s')(rowOf(row).value)} (${percent(rowOf(row).share)})`);
    }

    // In an ECDF, bar k is the step of the line at value k: drawn as context, it is that rise.
    if (kind === 'ecdf') {
        const pointAt = new Map(points.map(row => [rowOf(row).index, row]));
        const rise = (row: AutkDatum) => {
            const point = pointAt.get(rowOf(row).index);
            return point ? { x: xOf(point), top: rowOf(point).share, bottom: rowOf(point).share - rowOf(row).share } : null;
        };
        group.selectAll('line.autkContext')
            .data(bars.filter(row => rise(row)))
            .join('line')
            .attr('class', 'autk-ecdf-step autkContext')
            .attr('x1', row => rise(row)!.x).attr('x2', row => rise(row)!.x)
            .attr('y1', row => share(rise(row)!.bottom)).attr('y2', row => share(rise(row)!.top))
            .style('stroke', PlotStyle.default)
            .style('stroke-width', 1.5)
            .style('pointer-events', 'none');
    }

    // The ECDF steps up from 0 just before its first value; the Pareto line starts at the first bar.
    const lineOf = (v: (row: AutkDatum) => number | null) => {
        const line: [number, number][] = points.map(row => [xOf(row), share((v(row) ?? 0) / (total || 1))]);
        if (kind === 'ecdf' && line.length > 0) line.unshift([line[0][0], share(0)]);
        return d3.line().curve(kind === 'ecdf' ? d3.curveStepAfter : d3.curveLinear)(line);
    };
    const line = group.append('path')
        .datum(points)
        .attr('class', 'autk-cumulative-line')
        .attr('d', lineOf(row => rowOf(row).value))
        .style('fill', 'none')
        .style('stroke', PlotStyle.default)
        .style('stroke-width', 1.5)
        .style('pointer-events', 'none');

    group.selectAll('circle.autkMark')
        .data(points)
        .join('circle')
        .attr('class', 'autkMark')
        .attr('cx', xOf)
        .attr('cy', row => share(rowOf(row).share))
        .attr('r', POINT_RADIUS)
        .style('cursor', 'pointer')
        .append('title')
        .text(row => `up to ${rowOf(row).label}: ${d3.format('~s')(rowOf(row).value)} (${percent(rowOf(row).share)})`);

    return {
        design: { rect: { rule: 'length', axis: 'y', anchor: 'end' }, point: { rule: 'position', axis: 'y', baseline: share(0) } },
        series: [{ element: line.node()!, rows: points, path: lineOf }],
    };
}

/** Definition of the ECDF or Pareto chart. */
function cumulative(kind: 'ecdf' | 'pareto'): PlotDefinition {
    return {
        name: kind,
        label: kind === 'ecdf' ? 'ECDF' : 'Pareto chart',
        transforms: ['cumulative'],
        requiresTransform: true,
        topK: false,
        defaults: { tickFormats: ['~s', '~s'] },
        validate: config => {
            if (kind === 'ecdf' && orderOf(kind, config.transform?.options as Record<string, unknown>) !== 'key') {
                throw new Error("ECDF accumulates values in ascending order (order: 'key').");
            }
        },
        transformOptions: (_area, options) => ({ order: orderOf(kind, options) }),
        draw: context => drawCumulative(context, kind),
    };
}

/** Points of the accumulated share of a numeric column, one per value or bin. */
export const ecdf = cumulative('ecdf');

/** Bars of a categorical column, largest first, and points of their accumulated share. */
export const pareto = cumulative('pareto');
