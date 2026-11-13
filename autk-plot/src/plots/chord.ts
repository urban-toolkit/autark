/**
 * @fileoverview Chord diagram of the co-occurrence of two categorical attributes.
 *
 * Reads the nodes and links of a two-column `flows` transform: the categories of the first column
 * are arcs on the left half of the circle, those of the second on the right half, and each pair
 * that occurs together is a ribbon between their arcs. Only additive reducers (count, sum) are
 * accepted. A selection elsewhere keeps the leading share of each arc and of both ribbon ends.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'chord',
 *   collection: geojson,
 *   attributes: { axis: ['category', 'group'] },
 *   transform: { preset: 'flows' },
 *   labels: { title: 'Category × group' }
 * });
 */

import * as d3 from 'd3';

import type { FlowLinkRow, FlowNodeRow, FlowRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Thickness of a category arc in pixels. */
const ARC_WIDTH = 10;
/** Angle between arcs of the same half, in radians. */
const PAD_ANGLE = 0.03;
/** Empty angle at the top and bottom of the circle, between the halves, in radians. */
const POLE_GAP = 0.12;
/** Fill opacity of ribbons that are not highlighted. */
const RIBBON_OPACITY = 0.45;

/** Angular range in radians, clockwise from 12 o'clock. */
type Range = { start: number; end: number };

const flowOf = (row: AutkDatum) => row as unknown as FlowRow;

/** Arcs and ribbons of an additive two-column `flows` transform, one per node and per link. */
export const chord: PlotDefinition = {
    name: 'chord',
    label: 'Chord',
    transforms: ['flows'],
    requiresTransform: true,
    reducers: ['count', 'sum'],
    topK: false,
    validate: config => {
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length !== 2) {
            throw new Error('Chord requires exactly two categorical columns.');
        }
    },
    markStyle: (row, highlighted) => ({ 'fill-opacity': flowOf(row).kind === 'link' && !highlighted ? RIBBON_OPACITY : 1 }),
    design: { sector: { rule: 'angle', mode: 'sweep' }, shape: { rule: 'band', mode: 'ribbon' } },

    draw({ group, rows, width, height }) {
        const nodes = rows.filter(row => flowOf(row).kind === 'node');
        const links = rows.filter(row => flowOf(row).kind === 'link');
        const node = (row: AutkDatum) => row as unknown as FlowNodeRow;
        const link = (row: AutkDatum) => row as unknown as FlowLinkRow;
        // Room around the circle for the arc labels.
        const inner = Math.max(10, Math.min(width, height) / 2 - ARC_WIDTH - 30);

        // Second column top to bottom on the right; first column bottom to top on the left.
        const columns = [0, 1].map(column => nodes.filter(row => node(row).column === column));
        const scale = d3.min(columns, column => {
            const total = d3.sum(column, row => Math.max(0, node(row).value));
            const room = Math.PI - 2 * POLE_GAP - PAD_ANGLE * Math.max(0, column.length - 1);
            return total > 0 ? Math.max(0, room) / total : Infinity;
        }) ?? 0;
        const k = Number.isFinite(scale) ? scale : 0;
        const arcs = new Map<AutkDatum, Range>();
        const byKey = new Map(nodes.map(row => [node(row).key, row]));
        columns.forEach((column, index) => {
            let angle = (index === 1 ? 0 : Math.PI) + POLE_GAP;
            for (const row of column) {
                const span = Math.max(0, node(row).value) * k;
                arcs.set(row, { start: angle, end: angle + span });
                angle += span + PAD_ANGLE;
            }
        });

        // Each ribbon takes a sub-range of both arcs, ordered by the position of its other end.
        const rangeOf = (key: string) => arcs.get(byKey.get(key)!)!;
        const middle = (r: Range) => (r.start + r.end) / 2;
        const used = new Map<string, number>();
        const take = (key: string, span: number): Range => {
            const start = rangeOf(key).start + (used.get(key) ?? 0);
            used.set(key, (used.get(key) ?? 0) + span);
            return { start, end: start + span };
        };
        const bySource = [...links].sort((a, b) => middle(rangeOf(link(a).source)) - middle(rangeOf(link(b).source))
            || middle(rangeOf(link(b).target)) - middle(rangeOf(link(a).target)));
        const sources = new Map(bySource.map(row => [row, take(link(row).source, Math.max(0, link(row).value) * k)]));
        const ribbons = new Map<AutkDatum, { source: Range; target: Range }>();
        const byTarget = [...links].sort((a, b) => middle(rangeOf(link(a).target)) - middle(rangeOf(link(b).target))
            || middle(rangeOf(link(b).source)) - middle(rangeOf(link(a).source)));
        for (const row of byTarget) ribbons.set(row, { source: sources.get(row)!, target: take(link(row).target, Math.max(0, link(row).value) * k) });

        const arc = (r: Range) => d3.arc()({ startAngle: r.start, endAngle: r.end, innerRadius: inner, outerRadius: inner + ARC_WIDTH }) ?? '';
        const ribbon = d3.ribbon<unknown, { startAngle: number; endAngle: number; radius: number }>();
        const ribbonPath = (r: { source: Range; target: Range }) => (ribbon({
            source: { startAngle: r.source.start, endAngle: r.source.end, radius: inner },
            target: { startAngle: r.target.start, endAngle: r.target.end, radius: inner },
        }) as unknown as string) ?? '';
        const title = (row: AutkDatum) => {
            const flow = flowOf(row);
            return `${flow.label}\n${d3.format('~s')(flow.value)} (${flow.count} ${flow.count === 1 ? 'feature' : 'features'})`;
        };

        const center = group.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
        // Ribbons under arcs.
        center.selectAll('path.autkMark')
            .data([...links, ...nodes])
            .join('path')
            .attr('class', 'autkMark')
            .attr('d', row => (flowOf(row).kind === 'link' ? ribbonPath(ribbons.get(row)!) : arc(arcs.get(row)!)))
            .style('stroke', row => (flowOf(row).kind === 'node' ? '#2f2f2f' : 'none'))
            .style('stroke-width', 0.5)
            .style('cursor', 'pointer')
            .append('title')
            .text(title);

        // Radial labels outside the circle: each reads outward from its arc, so neighbors never overlap.
        const labelRadius = inner + ARC_WIDTH + 4;
        const labelAngle = (row: AutkDatum) => middle(arcs.get(row)!);
        center.selectAll('text.autk-chord-label')
            .data(nodes.filter(row => arcs.get(row)!.end - arcs.get(row)!.start > 0.02))
            .join('text')
            .attr('class', 'autk-chord-label')
            .attr('transform', row => {
                const degrees = labelAngle(row) * 180 / Math.PI;
                return `rotate(${degrees - 90}) translate(${labelRadius}, 0)${degrees > 180 ? ' rotate(180)' : ''}`;
            })
            .attr('dy', '0.35em')
            .attr('text-anchor', row => (labelAngle(row) > Math.PI ? 'end' : 'start'))
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(row => node(row).label);
    },
};
