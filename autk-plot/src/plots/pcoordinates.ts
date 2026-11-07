/**
 * @fileoverview Parallel coordinates of several attributes per feature.
 *
 * One vertical axis per attribute (linear for numbers, points for categories) and one polyline
 * per row, a feature unless a transform gives other rows. Each axis is a brush area of its own, and clicking an
 * axis name colors the lines by that attribute. A selection from an aggregating view draws the
 * leading share of each line.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'parallel-coordinates',
 *   collection: geojson,
 *   attributes: { axis: ['height', 'type', 'value'] },
 *   labels: { axis: ['Height', 'Type', 'Value'], title: 'Multivariate Exploration' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Scale of an axis: linear for numbers, points for categories. */
type AxisScale = { numeric: true; scale: d3.ScaleLinear<number, number> } | { numeric: false; scale: d3.ScalePoint<string> };

/** Polylines of the attributes in `axis`, one per feature. */
export const parallelCoordinates: PlotDefinition = {
    name: 'parallel-coordinates',
    label: 'Parallel coordinates',
    color: 'stroke',
    topK: false,
    defaults: { tickFormats: ['~s', '~s'] },
    markStyle: (_row, highlighted) => ({ opacity: highlighted ? 1 : 0.7, 'stroke-width': highlighted ? 3 : 2 }),
    design: { stroke: { rule: 'trace' } },

    draw({ svg, group, rows, fields, value, width, height, margins, format, axisLabels, colorAttribute, colorBy }) {
        // A scale per axis: linear when every value is a number, points otherwise.
        const scales = new Map<string, AxisScale>(fields.map((field, index): [string, AxisScale] => {
            const values = rows.map(row => value(row, index)).filter(v => v !== null && v !== undefined);
            if (values.every(v => !isNaN(Number(v)))) {
                const extent = d3.extent(rows, row => Number(value(row, index)) || 0) as [number, number];
                return [field, { numeric: true, scale: d3.scaleLinear(extent, [height, 0]) }];
            }
            const categories = Array.from(new Set(rows.map(row => String(value(row, index)))));
            return [field, { numeric: false, scale: d3.scalePoint(categories, [height, 0]).padding(0.5) }];
        }));
        const x = d3.scalePoint(fields, [0, width]).padding(0.1);
        const yOf = (row: AutkDatum, field: string, index: number) => {
            const axis = scales.get(field)!;
            return axis.numeric ? axis.scale(Number(value(row, index)) || 0) : axis.scale(String(value(row, index))) ?? 0;
        };
        const line = d3.line<[number, number]>();

        group.selectAll('path.autkMark')
            .data(rows)
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', row => line(fields.map((field, index) => [x(field) ?? 0, yOf(row, field, index)])) ?? '')
            .style('fill', 'none')
            .append('title')
            .text(row => fields.map((field, index) => {
                const v = value(row, index);
                return `${axisLabels[index] ?? field}: ${scales.get(field)!.numeric ? d3.format('~s')(Number(v) || 0) : String(v)}`;
            }).join('\n'));

        // One axis per attribute, each its own brush area.
        const axes = svg.selectAll<SVGGElement, string>('g.autk-pcoords-axis')
            .data(fields)
            .join('g')
            .attr('class', 'autk-pcoords-axis autkBrush')
            .attr('autkBrushId', field => field)
            .attr('transform', field => `translate(${margins.left + (x(field) ?? 0)}, ${margins.top})`);
        axes.each(function (field) {
            const axis = scales.get(field)!;
            const g = d3.select<SVGGElement, string>(this);
            if (axis.numeric) g.call(d3.axisLeft(axis.scale).ticks(5).tickFormat(v => format(0, '~s')(Number(v))));
            else g.call(d3.axisLeft(axis.scale));
        });

        // Axis names over the brush areas; a click colors the lines by that attribute.
        let colored = colorAttribute;
        const names = svg.append('g')
            .attr('class', 'autkAxisLabels')
            .attr('transform', `translate(${margins.left}, ${margins.top})`)
            .selectAll('text.axis-label')
            .data(fields)
            .join('text')
            .attr('class', 'axis-label')
            .attr('text-anchor', 'middle')
            .attr('x', field => x(field) ?? 0)
            .attr('y', -9)
            .style('font-weight', '600')
            .style('cursor', 'pointer')
            .text((field, index) => axisLabels[index] ?? field);
        const showColored = () => names
            .style('fill', field => (field === colored ? '#cc3300' : '#000'))
            .style('text-decoration', field => (field === colored ? 'underline' : 'none'));
        names.on('click', (_event, field) => {
            colored = colored === field ? undefined : field;
            colorBy(colored);
            showColored();
        });
        showColored();
    },
};
