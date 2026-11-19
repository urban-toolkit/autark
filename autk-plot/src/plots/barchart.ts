/**
 * @fileoverview Bar chart of a value per category or per bin.
 *
 * Reads label and value rows: the features as they are, or the bins of a `binning-1d` (or
 * `category-value`) transform. Each bar is a mark; a selection elsewhere fills each bar from its
 * base with the part the selection produces.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'barchart',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', '@transform'] },
 *   transform: { preset: 'binning-1d', options: { bins: 8 } },
 *   labels: { axis: ['area range', 'count'], title: 'Distribution' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Bars of a label (`axis[0]`) and a value (`axis[1]`). */
export const barchart: PlotDefinition = {
    name: 'barchart',
    label: 'Barchart',
    // A registered transform is read like binning-1d when it yields label and value rows.
    transforms: ['binning-1d', 'category-value'],
    defaults: config => ({
        tickFormats: ['~s', '~s'],
        ...(config.transform ? { labels: { axis: ['label', 'value'], title: 'Distribution' } } : {}),
    }),
    // Without a transform, each feature is a bar: it needs its label and its value.
    validate: config => {
        const fields = (config.attributes?.axis ?? []).filter(field => field !== '@transform');
        if (!config.transform && fields.length < 2) throw new Error('Barchart requires a label and a value (two fields) when it has no transform.');
    },
    // Bars grow from the bottom: the selected part is a slice from the base,
    // even when there are too few bars for the geometry to prove it.
    design: { rect: { rule: 'length', axis: 'y', anchor: 'end' } },

    draw({ group, rows, value, width, height, format, axisX, axisY, partRange, tickCount }) {
        const label = (row: AutkDatum) => String(value(row, 0));
        const amount = (row: AutkDatum) => Number(value(row, 1)) || 0;

        const x = d3.scaleBand(rows.map(label), [0, width]).padding(0.25);
        // An empty result (e.g. everything filtered out) keeps a finite [0, 1] axis.
        // A subset statistic (avg, min, max) may exceed every bar.
        const beyond = partRange && !partRange.additive ? partRange.extent[1] : 0;
        const y = d3.scaleLinear([0, Math.max(d3.max(rows, amount) ?? 0, 1, beyond)], [height, 0]);

        // Bin labels are numbers; category labels are kept as they are.
        const tick = format(0, '~s');
        axisX(d3.axisBottom(x).tickSizeOuter(0).tickFormat(d => {
            const text = String(d);
            return text.trim() !== '' && Number.isFinite(Number(text)) ? tick(Number(text)) : text;
        }))
            .selectAll('.tick text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '-.40em')
            .attr('transform', 'rotate(-90)');
        // A few counts get whole ticks, never "500m" of a feature.
        axisY(d3.axisLeft(y).ticks(tickCount(y.domain()[1], rows.map(amount), 10)).tickSizeInner(-width).tickFormat(format(1)));

        group.selectAll('rect.autkMark')
            .data(rows)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => x(label(row)) ?? 0)
            .attr('width', x.bandwidth())
            .attr('y', row => y(amount(row)))
            .attr('height', row => height - y(amount(row)))
            .style('stroke', '#2f2f2f')
            .append('title')
            .text(row => `${label(row)}: ${d3.format('~s')(amount(row))}`);
    },
};
