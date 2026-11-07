/**
 * @fileoverview Radar chart of several measures per category.
 *
 * Reads the cells of a `fold` transform: one axis per measure and one polygon per category, in a
 * gray shade with a legend, with a vertex at each reduced value (the circle spans `[0, 1]`, or up
 * to the largest value when it is greater). A selection elsewhere moves each vertex toward the
 * center to the value of the selected subset and redraws the polygon through the moved vertices.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'radar',
 *   collection: geojson,
 *   attributes: { axis: ['category', 'shape_area', 'shape_leng'] },
 *   transform: { preset: 'fold' },
 *   labels: { title: 'Profile of each category' }
 * });
 */

import * as d3 from 'd3';

import { PlotStyle } from '../plot-style';
import { shapeOutput } from '../transforms';
import type { FoldCellRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition, PlotSeries } from './registered';

/** Radius of a vertex mark in pixels. */
const VERTEX_RADIUS = 4;

const cellOf = (row: AutkDatum) => row as unknown as FoldCellRow;

/** Categories in polygon order, and the gray shade of each. */
function categoryShades(rows: AutkDatum[]): { categories: string[]; shade: (category: string) => string } {
    const categories = Array.from(new Set(rows.map(row => cellOf(row).category)));
    return { categories, shade: PlotStyle.shades(categories) };
}

/** Vertices of a `fold` transform, one per category and measure. */
export const radar: PlotDefinition = {
    name: 'radar',
    label: 'Radar',
    transforms: ['fold'],
    requiresTransform: true,
    topK: false,
    baseColor: rows => {
        const { shade } = categoryShades(rows);
        return row => shade(cellOf(row).category);
    },
    // Values grow from the center: the part of a vertex is the same vertex nearer to it.
    design: { point: { rule: 'position', axis: 'radial' } },

    draw({ group, rows, width, height, transform, axisLabels, legend }) {
        const measures = shapeOutput(transform, 'fold')?.measures ?? [];
        const { categories, shade } = categoryShades(rows);
        // The scale comes from the rows, whatever transform gave them: values in [0, 1] (normalized) keep the unit circle.
        const maxValue = Math.max(1, d3.max(rows, row => cellOf(row).value) ?? 1);
        // Room around the circle for the measure names.
        const radius = Math.max(10, Math.min(width, height) / 2 - 22);
        const pointAt = (measure: number, value: number): [number, number] => {
            const angle = (2 * Math.PI * measure) / Math.max(1, measures.length);
            const r = (Math.max(0, value) / maxValue) * radius;
            return [Math.sin(angle) * r, -Math.cos(angle) * r];
        };

        // Legend of category shades, top left.
        legend(categories, shade, 'column');

        const center = group.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
        center.selectAll('circle.autk-radar-ring')
            .data([0.25, 0.5, 0.75, 1])
            .join('circle')
            .attr('class', 'autk-radar-ring')
            .attr('r', t => t * radius)
            .style('fill', 'none')
            .style('stroke', PlotStyle.grid);
        center.selectAll('line.autk-radar-axis')
            .data(measures)
            .join('line')
            .attr('class', 'autk-radar-axis')
            .attr('x2', (_m, i) => pointAt(i, maxValue)[0])
            .attr('y2', (_m, i) => pointAt(i, maxValue)[1])
            .style('stroke', '#d0d7de');
        // Each measure is named by its axis label (`labels.axis[1…]`), or by its column.
        center.selectAll('text.autk-radar-measure')
            .data(measures)
            .join('text')
            .attr('class', 'autk-radar-measure')
            .attr('x', (_m, i) => pointAt(i, maxValue * 1.12)[0])
            .attr('y', (_m, i) => pointAt(i, maxValue * 1.12)[1])
            .attr('dy', '0.35em')
            .attr('text-anchor', (_m, i) => {
                const x = pointAt(i, 1)[0];
                return Math.abs(x) < 1 ? 'middle' : x > 0 ? 'start' : 'end';
            })
            .style('font-size', '10px')
            .style('fill', '#57606a')
            .text((m, i) => axisLabels[i + 1] ?? m);

        // One polygon per category through its vertices, in measure order; it never intercepts clicks.
        const series: PlotSeries[] = categories.map(category => {
            const cells = rows.filter(row => cellOf(row).category === category).sort((a, b) => cellOf(a).measureIndex - cellOf(b).measureIndex);
            const polygonOf = (v: (row: AutkDatum) => number | null) => {
                const points = cells.filter(row => v(row) !== null).map(row => pointAt(cellOf(row).measureIndex, v(row)!));
                return points.length > 0 ? `M${points.map(p => p.join(',')).join('L')}Z` : null;
            };
            const polygon = center.append('path')
                .datum(cells)
                .attr('class', 'autk-radar-polygon')
                .attr('d', polygonOf(row => cellOf(row).value))
                .style('fill', shade(category))
                .style('fill-opacity', 0.15)
                .style('stroke', shade(category))
                .style('stroke-width', 1.5)
                .style('pointer-events', 'none');
            // A profile, not an area of parts: drawn for every reducer.
            return { element: polygon.node()!, rows: cells, path: polygonOf, area: false };
        });

        center.selectAll('circle.autkMark')
            .data(rows)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', row => pointAt(cellOf(row).measureIndex, cellOf(row).value)[0])
            .attr('cy', row => pointAt(cellOf(row).measureIndex, cellOf(row).value)[1])
            .attr('r', VERTEX_RADIUS)
            .style('stroke', '#ffffff')
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${cellOf(row).label}: ${d3.format('.2~f')(cellOf(row).value)}`);

        return { series };
    },
};
