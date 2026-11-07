/**
 * @fileoverview Box plot of the distribution of a numeric attribute per category.
 *
 * Reads the summaries of a `box-stats` transform: quartile box, median line, Tukey whiskers, and
 * outlier dots. Order statistics are produced by specific features, not by all of them, so a
 * selection elsewhere is not a part of a box: each selected feature is drawn as a dot at its own
 * value (the `members` design), and its tooltip names its role in the summary.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'boxplot',
 *   collection: geojson,
 *   attributes: { axis: ['category', 'shape_area'] },
 *   transform: { preset: 'box-stats' },
 *   labels: { axis: ['category', 'area'], title: 'Area by category' }
 * });
 */

import * as d3 from 'd3';

import type { BoxStatsRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

const statsOf = (row: AutkDatum) => row as unknown as BoxStatsRow;

/** Role of a feature in the summary of its box. */
function roleOf(row: BoxStatsRow, feature: number, value: number): 'median' | 'outlier' | 'box' | 'whisker' {
    if (row.medianIds.includes(feature)) return 'median';
    if (row.outlierIds.includes(feature)) return 'outlier';
    return value >= row.q1 && value <= row.q3 ? 'box' : 'whisker';
}

/** Boxes of a `box-stats` transform, one per category. */
export const boxplot: PlotDefinition = {
    name: 'boxplot',
    label: 'Boxplot',
    transforms: ['box-stats'],
    requiresTransform: true,
    topK: false,
    defaults: { tickFormats: ['', '~s'] },

    draw({ group, rows, width, height, axisX, axisY, format }) {
        const boxes = rows.map(statsOf);
        const values = boxes.flatMap(r => [r.whiskerLow, r.whiskerHigh, ...r.outliers]);
        const [lo, hi] = d3.extent(values) as [number | undefined, number | undefined];
        const pad = ((hi ?? 1) - (lo ?? 0)) * 0.05 || 1;
        const x = d3.scaleBand(boxes.map(r => r.category), [0, width]).padding(0.35);
        const y = d3.scaleLinear([(lo ?? 0) - pad, (hi ?? 1) + pad], [height, 0]).nice();
        const band = x.bandwidth();
        const center = (r: BoxStatsRow) => (x(r.category) ?? 0) + band / 2;

        axisX(d3.axisBottom(x).tickSizeOuter(0));
        axisY(d3.axisLeft(y).ticks(5).tickSizeInner(-width).tickFormat(format(1, '~s')));

        // Whiskers and caps under the boxes.
        group.selectAll('line.autk-box-whisker')
            .data(boxes)
            .join('line')
            .attr('class', 'autk-box-whisker')
            .attr('x1', center).attr('x2', center)
            .attr('y1', r => y(r.whiskerLow)).attr('y2', r => y(r.whiskerHigh))
            .style('stroke', '#57606a');
        group.selectAll('path.autk-box-caps')
            .data(boxes)
            .join('path')
            .attr('class', 'autk-box-caps')
            .attr('d', r => {
                const [x0, x1] = [center(r) - band / 4, center(r) + band / 4];
                return `M${x0},${y(r.whiskerLow)}H${x1}M${x0},${y(r.whiskerHigh)}H${x1}`;
            })
            .style('stroke', '#57606a');

        group.selectAll('rect.autkMark')
            .data(rows)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => x(statsOf(row).category) ?? 0)
            .attr('width', band)
            .attr('y', row => y(statsOf(row).q3))
            .attr('height', row => Math.max(1, y(statsOf(row).q1) - y(statsOf(row).q3)))
            .style('stroke', '#2f2f2f')
            .style('cursor', 'pointer')
            .append('title')
            .text(row => {
                const r = statsOf(row);
                return `${r.category}\nn = ${r.count}\nmedian = ${d3.format('~s')(r.median)} (features ${r.medianIds.join(', ')})`
                    + `\nQ1 = ${d3.format('~s')(r.q1)}, Q3 = ${d3.format('~s')(r.q3)}\noutliers: ${r.outlierIds.length}`;
            });

        // Median lines and outliers over the boxes; they never intercept clicks.
        group.selectAll('line.autk-box-median')
            .data(boxes)
            .join('line')
            .attr('class', 'autk-box-median')
            .attr('x1', r => x(r.category) ?? 0).attr('x2', r => (x(r.category) ?? 0) + band)
            .attr('y1', r => y(r.median)).attr('y2', r => y(r.median))
            .style('stroke', '#24292f')
            .style('stroke-width', 2)
            .style('pointer-events', 'none');
        group.selectAll('circle.autk-box-outlier')
            .data(boxes.flatMap(row => row.outliers.map(value => ({ row, value }))))
            .join('circle')
            .attr('class', 'autk-box-outlier')
            .attr('cx', d => center(d.row)).attr('cy', d => y(d.value))
            .attr('r', 3)
            .style('fill', 'none')
            .style('stroke', '#57606a')
            .style('pointer-events', 'none');

        // Box edges are the quartiles on the value scale: a selected feature is a dot at its value.
        const [a, k] = [y(0), y(1) - y(0)];
        return { design: { rect: { rule: 'members', axis: 'y', scale: { a, k, fields: ['q1', 'q3'] } } } };
    },

    // The automatic dots, over the median lines, each naming the role of its feature.
    drawPart({ group, parts, drawAuto }) {
        drawAuto();
        const boxes = new Map(parts.map(part => [part.mark, statsOf(part.datum)]));
        group.selectAll<SVGCircleElement, unknown>('.autkPartial[data-autk-feature]')
            .raise()
            .each(function () {
                const row = boxes.get(this.getAttribute('data-autk-provenance') ?? '');
                if (!row) return;
                const role = roleOf(row, Number(this.getAttribute('data-autk-feature')), Number(this.getAttribute('data-autk-value')));
                this.setAttribute('data-autk-role', role);
                const title = this.querySelector('title');
                if (title) title.textContent += ` (${role})`;
            });
    },
};
