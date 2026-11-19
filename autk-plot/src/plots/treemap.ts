/**
 * @fileoverview Treemap of a hierarchy of categories.
 *
 * Reads the nodes of a `hierarchy` transform as nested rectangles with area proportional to the
 * reduced value; group frames are context (`autkContext`). Only additive reducers (count, sum) are
 * accepted. A selection elsewhere draws a centered inner rectangle whose area is the selected
 * fraction of the leaf.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'treemap',
 *   collection: geojson,
 *   attributes: { axis: ['category', 'group'] },
 *   transform: { preset: 'hierarchy' },
 *   labels: { title: 'Features by category and group' }
 * });
 */

import * as d3 from 'd3';

import type { HierarchyNodeRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import { treeOf } from './hierarchy-tree';
import type { TreeDatum } from './hierarchy-tree';
import type { PlotDefinition } from './registered';

/** Height of a group label band in pixels. */
const LABEL_BAND = 14;

const nodeOf = (row: AutkDatum) => row as unknown as HierarchyNodeRow;

/** Leaf rectangles of an additive `hierarchy` transform, one per deepest node. */
export const treemap: PlotDefinition = {
    name: 'treemap',
    label: 'Treemap',
    transforms: ['hierarchy'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    topK: false,
    design: { rect: { rule: 'area' } },

    draw({ group, rows, width, height }) {
        const nodes = rows.map(nodeOf);
        const depth = d3.max(nodes, r => r.level + 1) ?? 1;
        // Groups leave room on top for their label.
        const root = d3.treemap<TreeDatum>()
            .size([width, height])
            .paddingOuter(2)
            .paddingTop(node => (node.depth > 0 && node.depth < depth ? LABEL_BAND : 2))
            .paddingInner(2)
            .round(true)(treeOf(nodes));
        const boxes = new Map(root.descendants().filter(node => node.data.row).map(node => [node.data.row as object, node]));
        const box = (row: AutkDatum) => boxes.get(row)!;
        const drawn = rows.filter(row => boxes.has(row));
        const leaves = drawn.filter(row => nodeOf(row).level === depth - 1);
        const groups = drawn.filter(row => nodeOf(row).level < depth - 1);

        // Group frames and labels: context, never clicked.
        group.selectAll('rect.autkContext')
            .data(groups)
            .join('rect')
            .attr('class', 'autk-treemap-group autkContext')
            .attr('x', row => box(row).x0).attr('y', row => box(row).y0)
            .attr('width', row => box(row).x1 - box(row).x0)
            .attr('height', row => box(row).y1 - box(row).y0)
            .style('fill', '#f6f8fa')
            .style('stroke', '#d0d7de')
            .style('pointer-events', 'none');
        group.selectAll('text.autk-treemap-group-label')
            .data(groups.filter(row => box(row).x1 - box(row).x0 > 30))
            .join('text')
            .attr('class', 'autk-treemap-group-label')
            .attr('x', row => box(row).x0 + 4)
            .attr('y', row => box(row).y0 + LABEL_BAND - 4)
            .style('font-size', '10px')
            .style('font-weight', '600')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(row => `${nodeOf(row).label} (${d3.format('~s')(nodeOf(row).value)})`);

        group.selectAll('rect.autkMark')
            .data(leaves)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => box(row).x0).attr('y', row => box(row).y0)
            .attr('width', row => Math.max(0, box(row).x1 - box(row).x0))
            .attr('height', row => Math.max(0, box(row).y1 - box(row).y0))
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${nodeOf(row).path.join(' · ')}: ${d3.format('~s')(nodeOf(row).value)}`);

        group.selectAll('text.autk-treemap-label')
            .data(leaves.filter(row => box(row).x1 - box(row).x0 > 34 && box(row).y1 - box(row).y0 > 14))
            .join('text')
            .attr('class', 'autk-treemap-label')
            .attr('x', row => box(row).x0 + 3)
            .attr('y', row => box(row).y0 + 11)
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(row => nodeOf(row).label);
    },
};
