/**
 * @fileoverview Sunburst chart of a hierarchy of categories.
 *
 * Reads the nodes of a `hierarchy` transform, one ring per level around an empty center, each
 * segment with an angle proportional to its reduced value. Every level is a mark. Children must
 * add up to their parent, so only additive reducers (count, sum) are accepted. A selection
 * elsewhere fills the inner part of each segment with the selected fraction of its area.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'sunburst',
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

/** Radius of the empty center, as a fraction of the chart radius. */
const HOLE = 0.18;

const nodeOf = (row: AutkDatum) => row as unknown as HierarchyNodeRow;

/** Ring segments of an additive `hierarchy` transform, one per node. */
export const sunburst: PlotDefinition = {
    name: 'sunburst',
    label: 'Sunburst',
    transforms: ['hierarchy'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    topK: false,
    design: { sector: { rule: 'angle', mode: 'radial' } },

    draw({ group, rows, width, height }) {
        const depth = d3.max(rows, row => nodeOf(row).level + 1) ?? 1;
        // The root is level 0 of the partition and is not drawn.
        const radius = Math.min(width, height) / 2;
        const root = d3.partition<TreeDatum>().size([2 * Math.PI, depth + 1])(treeOf(rows.map(nodeOf)));
        const ring = (level: number) => radius * HOLE + ((level - 1) / depth) * radius * (1 - HOLE);
        const nodes = new Map(root.descendants().filter(node => node.data.row).map(node => [node.data.row as object, node]));
        const span = (row: AutkDatum) => {
            const node = nodes.get(row)!;
            return { startAngle: node.x0, endAngle: node.x1, innerRadius: ring(node.y0), outerRadius: ring(node.y1) };
        };
        const arc = d3.arc<ReturnType<typeof span>>();
        const drawn = rows.filter(row => nodes.has(row));

        const center = group.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
        center.selectAll('path.autkMark')
            .data(drawn)
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', row => arc(span(row)))
            .style('stroke', '#ffffff')
            .style('stroke-width', 1)
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${nodeOf(row).path.join(' · ')}: ${d3.format('~s')(nodeOf(row).value)}`);

        // Labels of segments wide and deep enough; they never intercept clicks.
        const fits = (s: ReturnType<typeof span>) => (s.endAngle - s.startAngle) * (s.innerRadius + s.outerRadius) / 2 > 34 && s.outerRadius - s.innerRadius > 12;
        center.selectAll('text.autk-sunburst-label')
            .data(drawn.filter(row => fits(span(row))))
            .join('text')
            .attr('class', 'autk-sunburst-label')
            .attr('transform', row => {
                const s = span(row);
                const [angle, middle] = [(s.startAngle + s.endAngle) / 2, (s.innerRadius + s.outerRadius) / 2];
                return `translate(${Math.sin(angle) * middle}, ${-Math.cos(angle) * middle})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(row => nodeOf(row).label);
    },
};
