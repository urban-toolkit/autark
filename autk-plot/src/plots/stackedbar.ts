/**
 * @fileoverview Stacked bar chart of a two-level hierarchy.
 *
 * Reads the nodes of a `hierarchy` transform: one bar per group (`axis[0]`), one segment per
 * subgroup (`axis[1]`) in gray shades with a legend; each group is its category on the x axis
 * (`autkContext`). Only additive reducers (count, sum) are accepted. A selection elsewhere fills
 * the part of each segment it produced from the segment's base.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'stackedbar',
 *   collection: geojson,
 *   attributes: { axis: ['group', 'category'] },
 *   transform: { preset: 'hierarchy' },
 *   labels: { axis: ['group', 'features'], title: 'Category by group' }
 * });
 */

import * as d3 from 'd3';

import { PlotStyle } from '../plot-style';
import type { HierarchyNodeRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

const nodeOf = (row: AutkDatum) => row as unknown as HierarchyNodeRow;

/** Subgroup labels in legend order, and the gray shade of each. */
function subgroupShades(rows: AutkDatum[]): { subgroups: string[]; shade: (subgroup: string) => string } {
    const subgroups = Array.from(new Set(rows.map(nodeOf).filter(r => r.level === 1).map(r => r.label))).sort((a, b) => a.localeCompare(b));
    return { subgroups, shade: PlotStyle.shades(subgroups) };
}

/** Segments of an additive two-column `hierarchy` transform, one per subgroup of each group. */
export const stackedbar: PlotDefinition = {
    name: 'stackedbar',
    label: 'Stacked bar chart',
    transforms: ['hierarchy'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    topK: false,
    defaults: { tickFormats: ['', '~s'] },
    validate: config => {
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length !== 2) {
            throw new Error('Stacked bar chart requires two columns: group and subgroup.');
        }
    },
    baseColor: rows => {
        const { shade } = subgroupShades(rows);
        return row => shade(nodeOf(row).label);
    },
    design: { rect: { rule: 'length', axis: 'y', anchor: 'end' } },

    draw({ group, rows, width, height, axisX, axisY, format, tickCount, legend }) {
        const groups = rows.filter(row => nodeOf(row).level === 0);
        const leaves = rows.filter(row => nodeOf(row).level === 1);
        const { subgroups, shade } = subgroupShades(rows);
        const x = d3.scaleBand(groups.map(row => nodeOf(row).label), [0, width]).padding(0.2);
        const y = d3.scaleLinear([0, Math.max(1, d3.max(groups, row => nodeOf(row).value) ?? 0)], [height, 0]).nice();

        // Each group is drawn as its category on the x axis.
        const groupOf = new Map(groups.map(row => [nodeOf(row).label, row]));
        const rotate = groups.length > 6;
        const ticks = axisX(d3.axisBottom(x).tickSizeOuter(0)).selectAll<SVGGElement, string>('.tick');
        ticks.datum(label => groupOf.get(label)!).classed('autkContext', true);
        ticks.select('text')
            .style('text-anchor', rotate ? 'end' : 'middle')
            .attr('dx', rotate ? '-0.6em' : null)
            .attr('dy', rotate ? '0.15em' : '0.71em')
            .attr('transform', rotate ? 'rotate(-45)' : null);
        // Counts take whole ticks only.
        axisY(d3.axisLeft(y).ticks(tickCount(y.domain()[1], leaves.map(row => nodeOf(row).value), 5)).tickSizeInner(-width).tickFormat(format(1, '~s')));

        // Legend of subgroup shades, above the bars.
        legend(subgroups, shade, 'row');

        // Segments stacked from the base, in legend order.
        const boxes = new Map<AutkDatum, { x: number; y: number; height: number }>();
        for (const bar of groups) {
            let base = 0;
            const segments = leaves.filter(row => nodeOf(row).parent === nodeOf(bar).key)
                .sort((a, b) => subgroups.indexOf(nodeOf(a).label) - subgroups.indexOf(nodeOf(b).label));
            for (const row of segments) {
                const top = base + nodeOf(row).value;
                boxes.set(row, { x: x(nodeOf(bar).label) ?? 0, y: y(top), height: y(base) - y(top) });
                base = top;
            }
        }

        group.selectAll('rect.autkMark')
            .data(leaves.filter(row => boxes.has(row)))
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => boxes.get(row)!.x)
            .attr('width', x.bandwidth())
            .attr('y', row => boxes.get(row)!.y)
            .attr('height', row => Math.max(0, boxes.get(row)!.height))
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${nodeOf(row).path.join(' · ')}: ${d3.format('~s')(nodeOf(row).value)}`);
    },
};
