/**
 * @fileoverview Bubble chart of three numeric attributes.
 *
 * A scatter plot whose bubble area is proportional to the size attribute. Larger bubbles are
 * drawn first so smaller ones stay visible and clickable. Selection and the partial view are
 * those of the scatter plot.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'bubble',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', 'shape_leng', 'events_count'] },
 *   labels: { axis: ['area', 'perimeter', 'events'], title: 'Features' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';
import { gridAxes, pointTitle, scatterplot } from './scatterplot';

/** Radius range of the bubbles, in pixels. */
const RADIUS_RANGE: [number, number] = [2, 16];

/** Points of three numeric attributes (`axis[0]` on x, `axis[1]` on y, `axis[2]` as area). */
export const bubblechart: PlotDefinition = {
    ...scatterplot,
    name: 'bubble',
    label: 'Bubble chart',
    validate: config => {
        if ((config.attributes?.axis?.length ?? 0) < 3) throw new Error('Bubble chart requires x, y, and size attributes.');
    },

    draw(context) {
        const { group, rows, value } = context;
        const [x, y] = gridAxes(context);

        const sizes = rows.map(row => Number(value(row, 2))).filter(v => Number.isFinite(v) && v >= 0);
        const size = d3.scaleSqrt([0, d3.max(sizes) || 1], RADIUS_RANGE);
        const radius = (row: AutkDatum) => {
            const v = Number(value(row, 2));
            return Number.isFinite(v) && v >= 0 ? size(v) : RADIUS_RANGE[0];
        };

        group.selectAll('circle.autkMark')
            .data(rows)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', row => x(Number(value(row, 0)) || 0))
            .attr('cy', row => y(Number(value(row, 1)) || 0))
            .attr('r', radius)
            .style('fill-opacity', 0.8)
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .sort((a, b) => radius(b) - radius(a))
            .append('title')
            .text(pointTitle(context, 3));
    },
};
