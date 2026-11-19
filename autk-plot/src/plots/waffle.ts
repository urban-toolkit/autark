/**
 * @fileoverview Waffle chart of the features of each group, one square each.
 *
 * Reads the groups of a counting `category-value` transform (such as `binning-1d`) as blocks of squares. Every square of a
 * group binds the group row, so a group is one mark made of many elements; each square names its
 * feature (`data-autk-feature`), so the part of a group produced by a selection is exactly its
 * selected squares.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'waffle',
 *   collection: geojson,
 *   attributes: { axis: ['category', '@transform'] },
 *   transform: { preset: 'binning-1d' },
 *   labels: { title: 'Features by category' }
 * });
 */

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Squares per line of a group block. */
const COLUMNS = 10;
/** Gap between squares, as a fraction of the cell size. */
const GAP = 0.15;

/** One square: a feature inside the block of its group. */
type Square = { row: AutkDatum; feature: number; column: number; line: number };

/** Squares of a counting `category-value` transform (such as `binning-1d`), one per feature of each group. */
export const waffle: PlotDefinition = {
    name: 'waffle',
    label: 'Waffle',
    transforms: ['binning-1d', 'category-value'],
    requiresTransform: true,
    reducers: ['count'],
    topK: false,
    design: { rect: { rule: 'units' } },

    draw({ group, rows, width, height, value }) {
        // One block per group, in data order, a blank line between blocks.
        const squares: Square[] = [];
        const blocks: { row: AutkDatum; line: number; count: number }[] = [];
        let line = 0;
        for (const row of rows) {
            const features = [...(row.autkIds ?? [])].sort((a, b) => a - b);
            blocks.push({ row, line, count: features.length });
            features.forEach((feature, index) => {
                squares.push({ row, feature, column: index % COLUMNS, line: line + Math.floor(index / COLUMNS) });
            });
            line += Math.max(1, Math.ceil(features.length / COLUMNS)) + 1;
        }
        const labelWidth = Math.min(width * 0.35, 120);
        const cell = Math.max(1, Math.min((width - labelWidth) / COLUMNS, height / Math.max(1, line - 1)));
        const gridX = labelWidth + (width - labelWidth - cell * COLUMNS) / 2;
        const size = cell * (1 - GAP);

        group.selectAll('text.autk-waffle-label')
            .data(blocks)
            .join('text')
            .attr('class', 'autk-waffle-label')
            .attr('x', gridX - 8)
            .attr('y', block => (block.line + 0.5) * cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('font-size', '11px')
            .style('fill', '#24292f')
            .text(block => `${value(block.row, 0)} (${block.count})`);

        group.selectAll('rect.autkMark')
            .data(squares.map(square => square.row))
            .join('rect')
            .attr('class', 'autkMark')
            .attr('data-autk-feature', (_row, i) => squares[i].feature)
            .attr('x', (_row, i) => gridX + squares[i].column * cell)
            .attr('y', (_row, i) => squares[i].line * cell)
            .attr('width', size)
            .attr('height', size)
            .attr('rx', size * 0.15)
            .style('cursor', 'pointer')
            .append('title')
            .text((row, i) => `${value(row, 0)}: feature ${squares[i].feature}`);
    },
};
