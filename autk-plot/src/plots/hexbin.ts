/**
 * @fileoverview Hexbin plot of two numeric attributes.
 *
 * Reads the hexagons of a `binning-hex` transform, which bins the features in the plot's own
 * drawing area, so hexagons are regular at any size. Hexagons are gray by default so the
 * provenance color stands out. A selection elsewhere shows an inner hexagon of the selected area
 * for count and sum, a half-size one colored by the subset value for avg, min, and max.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'hexbin',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', 'shape_leng'] },
 *   transform: { preset: 'binning-hex', options: { radius: 16 } }
 * });
 */

import * as d3 from 'd3';

import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import { PlotStyle } from '../plot-style';
import { shapeOutput } from '../transforms';
import type { BinningHexRow } from '../transforms';

import type { PlotDefinition } from './registered';

/**
 * Closed path of a pointy-top hexagon, with line commands only, so brushes
 * and the segregated view can measure it.
 */
function hexagonPath(r: number, cx: number, cy: number): string {
    const corners = d3.range(6).map(k => {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
    });
    return `M${corners.join('L')}Z`;
}

/** Hexagons of a `binning-hex` transform, colored by their reduced value. */
export const hexbin: PlotDefinition = {
    name: 'hexbin',
    label: 'Hexbin',
    transforms: ['binning-hex'],
    requiresTransform: true,
    topK: false,
    defaults: { colorMapInterpolator: ColorMapInterpolator.SEQ_GREYS },
    transformOptions: area => area,
    // Light to medium tones of the scheme, under the provenance color.
    colorDomain: PlotStyle.softSequentialDomain,
    design: { shape: { rule: 'glyph' } },

    draw({ group, rows, width, height, transform, format, axisX, axisY }) {
        const grid = shapeOutput(transform, 'binning-hex')
            ?? { extent: { x: [0, 1] as [number, number], y: [0, 1] as [number, number] }, radius: 14 };
        // Axes over the extent the transform mapped to pixels, inset by the radius.
        const x = d3.scaleLinear(grid.extent.x, [grid.radius, width - grid.radius]);
        const y = d3.scaleLinear(grid.extent.y, [height - grid.radius, grid.radius]);
        axisX(d3.axisBottom(x).ticks(6).tickFormat(format(0, '~s')));
        axisY(d3.axisLeft(y).ticks(5).tickFormat(format(1, '~s')));

        group.selectAll('path.autkMark')
            .data(rows as unknown as BinningHexRow[])
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', row => hexagonPath(grid.radius, row.cx, row.cy))
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('cursor', 'pointer')
            .selectAll('title').data(row => [row]).join('title')
            .text(row => `${row.label}\nn = ${row.count}, value = ${d3.format('~s')(row.value)}`);
    },
};
