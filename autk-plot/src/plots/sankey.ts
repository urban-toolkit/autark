/**
 * @fileoverview Sankey diagram of the flows of features through ordered categorical columns.
 *
 * Reads the nodes and links of a `flows` transform: one column of stacked nodes per attribute and
 * a band for each link between consecutive columns. Links lead back only to the features that
 * walked them. Node heights equal the sum of their link widths, so only additive reducers (count,
 * sum) are accepted. A selection elsewhere narrows each link and fills each node from its top.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'sankey',
 *   collection: geojson,
 *   attributes: { axis: ['type', 'category', 'group'] },
 *   transform: { preset: 'flows' },
 *   labels: { title: 'Type → category → group' }
 * });
 */

import * as d3 from 'd3';

import type { FlowLinkRow, FlowNodeRow, FlowRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Width of a node rectangle in pixels. */
const NODE_WIDTH = 12;
/** Vertical gap between nodes of a column in pixels. */
const NODE_PADDING = 8;
/** Fill opacity of links that are not highlighted. */
const LINK_OPACITY = 0.45;

const flowOf = (row: AutkDatum) => row as unknown as FlowRow;

/** Band of a link between two vertical edges: a closed, smoothly curved path. */
function bandPath(sx: number, sy: number, tx: number, ty: number, width: number): string {
    const mx = (sx + tx) / 2;
    return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`
        + `L${tx},${ty + width}C${mx},${ty + width} ${mx},${sy + width} ${sx},${sy + width}Z`;
}

/** Nodes and links of an additive `flows` transform, one mark each. */
export const sankey: PlotDefinition = {
    name: 'sankey',
    label: 'Sankey',
    transforms: ['flows'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    topK: false,
    markStyle: (row, highlighted) => ({ 'fill-opacity': flowOf(row).kind === 'link' && !highlighted ? LINK_OPACITY : 1 }),
    design: { rect: { rule: 'length', axis: 'y', anchor: 'start' }, shape: { rule: 'band', mode: 'flow' } },

    draw({ group, rows, width, height }) {
        const nodes = rows.filter(row => flowOf(row).kind === 'node');
        const links = rows.filter(row => flowOf(row).kind === 'link');
        const node = (row: AutkDatum) => row as unknown as FlowNodeRow;
        const link = (row: AutkDatum) => row as unknown as FlowLinkRow;

        // Node heights share one scale, chosen so the fullest column fits.
        const columns = d3.groups(nodes, row => node(row).column).sort((a, b) => a[0] - b[0]);
        const lastColumn = columns.length > 0 ? columns[columns.length - 1][0] : 0;
        const scale = d3.min(columns, ([, column]) => {
            const total = d3.sum(column, row => Math.max(0, node(row).value));
            return total > 0 ? (height - NODE_PADDING * (column.length - 1)) / total : Infinity;
        }) ?? 1;
        const k = Number.isFinite(scale) ? Math.max(0, scale) : 1;

        const boxes = new Map<AutkDatum, { x0: number; x1: number; y0: number; y1: number }>();
        const byKey = new Map<string, AutkDatum>();
        for (const [index, column] of columns) {
            const x0 = lastColumn === 0 ? 0 : index * (width - NODE_WIDTH) / lastColumn;
            let y = 0;
            for (const row of column) {
                const h = Math.max(0, node(row).value) * k;
                boxes.set(row, { x0, x1: x0 + NODE_WIDTH, y0: y, y1: y + h });
                byKey.set(node(row).key, row);
                y += h + NODE_PADDING;
            }
        }

        // Links leave and enter nodes ordered by the position of their other end, which reduces crossings.
        const boxOf = (key: string) => boxes.get(byKey.get(key)!)!;
        const outOffset = new Map<string, number>();
        const inOffset = new Map<string, number>();
        const bands = new Map<AutkDatum, string>();
        for (const row of [...links].sort((a, b) => boxOf(link(a).source).y0 - boxOf(link(b).source).y0 || boxOf(link(a).target).y0 - boxOf(link(b).target).y0)) {
            const { source, target, value } = link(row);
            const w = Math.max(0, value) * k;
            const sy = boxOf(source).y0 + (outOffset.get(source) ?? 0);
            const ty = boxOf(target).y0 + (inOffset.get(target) ?? 0);
            outOffset.set(source, (outOffset.get(source) ?? 0) + w);
            inOffset.set(target, (inOffset.get(target) ?? 0) + w);
            bands.set(row, bandPath(boxOf(source).x1, sy, boxOf(target).x0, ty, w));
        }

        const title = (row: AutkDatum) => {
            const flow = flowOf(row);
            return `${flow.label}\n${d3.format('~s')(flow.value)} (${flow.count} ${flow.count === 1 ? 'feature' : 'features'})`;
        };

        // Links under nodes.
        group.selectAll('path.autkMark')
            .data(links)
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', row => bands.get(row)!)
            .style('stroke', 'none')
            .style('cursor', 'pointer')
            .append('title')
            .text(title);
        group.selectAll('rect.autkMark')
            .data(nodes)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => boxes.get(row)!.x0)
            .attr('y', row => boxes.get(row)!.y0)
            .attr('width', NODE_WIDTH)
            .attr('height', row => Math.max(1, boxes.get(row)!.y1 - boxes.get(row)!.y0))
            .style('stroke', '#2f2f2f')
            .style('cursor', 'pointer')
            .append('title')
            .text(title);

        // Node labels beside their node (left of the last column); they never intercept clicks.
        group.selectAll('text.autk-sankey-label')
            .data(nodes)
            .join('text')
            .attr('class', 'autk-sankey-label')
            .attr('x', row => (node(row).column === lastColumn ? boxes.get(row)!.x0 - 4 : boxes.get(row)!.x1 + 4))
            .attr('y', row => (boxes.get(row)!.y0 + boxes.get(row)!.y1) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', row => (node(row).column === lastColumn ? 'end' : 'start'))
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(row => node(row).label);
    },
};
