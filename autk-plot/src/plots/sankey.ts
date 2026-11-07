/**
 * @fileoverview Sankey plot for flows of features across categorical columns.
 *
 * Provides a D3-based Sankey diagram with the following features:
 * - **Layered layout**: One column of stacked nodes per categorical attribute, sized by value
 * - **Links as marks**: Bands between consecutive columns can be clicked, like nodes
 * - **Exact provenance**: Links lead back only to the features that walked them (via segments)
 * - **Transform required**: Data must be built via the `flows` transform preset
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'sankey',
 *   collection: geojson,
 *   attributes: { axis: ['ntatype', 'landuse', 'cdta2020'] },
 *   transform: { preset: 'flows' },
 *   labels: { title: 'NTA type → land use → district' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';

import type { FlowLinkRow, FlowNodeRow, FlowRow } from '../transforms';

/** Width of a node rectangle in pixels. */
const NODE_WIDTH = 12;
/** Vertical gap between nodes of a column in pixels. */
const NODE_PADDING = 8;
/** Fill opacity of links that are not highlighted. */
const LINK_OPACITY = 0.45;

/** Laid-out geometry of a node or a link. */
type FlowBox =
    | { kind: 'node'; x0: number; x1: number; y0: number; y1: number }
    | { kind: 'link'; sx: number; sy: number; tx: number; ty: number; width: number };

/**
 * Draws the band of a link between two vertical edges.
 *
 * @param sx Source x (right edge of the source node).
 * @param sy Top y of the band at the source.
 * @param tx Target x (left edge of the target node).
 * @param ty Top y of the band at the target.
 * @param width Band thickness.
 * @returns SVG path of a closed, smoothly curved band.
 */
function bandPath(sx: number, sy: number, tx: number, ty: number, width: number): string {
    const mx = (sx + tx) / 2;
    return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`
        + `L${tx},${ty + width}C${mx},${ty + width} ${mx},${sy + width} ${sx},${sy + width}Z`;
}

/**
 * Sankey diagram of feature flows through ordered categorical columns.
 *
 * Requires the `flows` transform with an additive reducer (`count` or `sum`),
 * so that node heights equal the sum of their link widths.
 */
export class Sankey extends PlotBaseInteractive {

    /** Laid-out geometry of each rendered row. */
    protected layout: Map<object, FlowBox> = new Map();

    /**
     * Creates a Sankey instance and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `flows` transform preset.
     * @throws If the transform is missing, is not `flows`, or uses a non-additive reducer.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }

        if (!config.transform || config.transform.preset !== 'flows') {
            throw new Error('Sankey requires a flows transform preset.');
        }
        const reducer = config.transform.options?.reducer ?? 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Sankey requires an additive reducer (count or sum).');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, link bands, node rectangles, and node labels.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        if (!svg.node()) throw new Error('SVG element could not be created.');

        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title
        svg.selectAll<SVGTextElement, string>('#plotTitle')
            .data(this._title ? [this._title] : []).join('text')
            .attr('id', 'plotTitle')
            .attr('class', 'plot-title')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);

        this.layoutFlows(width, height);
        const rows = this._data as FlowRow[];
        const nodes = rows.filter((r): r is FlowNodeRow => r.kind === 'node');
        const links = rows.filter((r): r is FlowLinkRow => r.kind === 'link');

        // ---- Marks: links under nodes
        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        const marks = cGroup.selectAll<SVGElement, FlowRow>('.autkMark')
            .data([...links, ...nodes] as FlowRow[], d => d.key)
            .join(enter => enter.append(d => document.createElementNS('http://www.w3.org/2000/svg', d.kind === 'link' ? 'path' : 'rect')))
            .attr('class', 'autkMark')
            .style('cursor', 'pointer')
            .each((d, i, groups) => {
                const node = d3.select(groups[i]);
                const box = this.layout.get(d)!;
                if (box.kind === 'link') {
                    node.attr('d', bandPath(box.sx, box.sy, box.tx, box.ty, box.width)).style('stroke', 'none');
                } else {
                    node.attr('x', box.x0).attr('y', box.y0)
                        .attr('width', box.x1 - box.x0).attr('height', Math.max(1, box.y1 - box.y0))
                        .style('stroke', '#2f2f2f');
                }
            });
        marks.selectAll('title').data(d => [d]).join('title')
            .text(d => `${d.label}\n${d.value} (${d.count} ${d.count === 1 ? 'feature' : 'features'})`);

        // ---- Node labels (never intercept clicks)
        const lastColumn = d3.max(nodes, n => n.column) ?? 0;
        cGroup.selectAll<SVGTextElement, FlowNodeRow>('.autk-sankey-label')
            .data(nodes, d => d.key).join('text')
            .attr('class', 'autk-sankey-label')
            .attr('x', d => {
                const box = this.layout.get(d) as Extract<FlowBox, { kind: 'node' }>;
                return d.column === lastColumn ? box.x0 - 4 : box.x1 + 4;
            })
            .attr('y', d => {
                const box = this.layout.get(d) as Extract<FlowBox, { kind: 'node' }>;
                return (box.y0 + box.y1) / 2;
            })
            .attr('dy', '0.35em')
            .attr('text-anchor', d => d.column === lastColumn ? 'end' : 'start')
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(d => d.label);

        this.applyMarkStyles(marks as unknown as d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>);
        this.configureSignalListeners();
    }

    /**
     * Stacks nodes per column and routes link bands between them.
     *
     * Node heights share one scale, chosen so the fullest column fits. Links
     * leave and enter nodes ordered by the position of their other end, which
     * reduces crossings.
     *
     * @param width Drawing width in pixels.
     * @param height Drawing height in pixels.
     */
    protected layoutFlows(width: number, height: number): void {
        const rows = this._data as FlowRow[];
        const nodes = rows.filter((r): r is FlowNodeRow => r.kind === 'node');
        const links = rows.filter((r): r is FlowLinkRow => r.kind === 'link');
        const columns = d3.groups(nodes, n => n.column).sort((a, b) => a[0] - b[0]);
        const lastColumn = columns.length > 0 ? columns[columns.length - 1][0] : 0;

        const scale = d3.min(columns, ([, column]) => {
            const total = d3.sum(column, n => Math.max(0, n.value));
            return total > 0 ? (height - NODE_PADDING * (column.length - 1)) / total : Infinity;
        }) ?? 1;
        const k = Number.isFinite(scale) ? Math.max(0, scale) : 1;

        this.layout = new Map();
        const byKey = new Map<string, FlowNodeRow>();
        for (const [columnIndex, column] of columns) {
            const x0 = lastColumn === 0 ? 0 : columnIndex * (width - NODE_WIDTH) / lastColumn;
            let y = 0;
            for (const node of column) {
                const h = Math.max(0, node.value) * k;
                this.layout.set(node, { kind: 'node', x0, x1: x0 + NODE_WIDTH, y0: y, y1: y + h });
                byKey.set(node.key, node);
                y += h + NODE_PADDING;
            }
        }

        const nodeBox = (key: string) => this.layout.get(byKey.get(key)!) as Extract<FlowBox, { kind: 'node' }>;
        const outOffset = new Map<string, number>();
        const inOffset = new Map<string, number>();
        const ordered = [...links].sort((a, b) =>
            nodeBox(a.source).y0 - nodeBox(b.source).y0 || nodeBox(a.target).y0 - nodeBox(b.target).y0);

        for (const link of ordered) {
            const source = nodeBox(link.source);
            const target = nodeBox(link.target);
            const w = Math.max(0, link.value) * k;
            const sy = source.y0 + (outOffset.get(link.source) ?? 0);
            const ty = target.y0 + (inOffset.get(link.target) ?? 0);
            outOffset.set(link.source, (outOffset.get(link.source) ?? 0) + w);
            inOffset.set(link.target, (inOffset.get(link.target) ?? 0) + w);
            this.layout.set(link, { kind: 'link', sx: source.x1, sy, tx: target.x0, ty, width: w });
        }
    }

    /**
     * Colors nodes with the shared mark color and links translucently unless highlighted.
     *
     * @param svgs Selection containing the node and link marks.
     */
    protected override applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        svgs.style('fill', (d: unknown) => this.getMarkColor(d))
            .style('fill-opacity', (d: unknown) => {
                const isLink = (d as FlowRow).kind === 'link';
                return isLink && !this.isMarkHighlighted(d) ? LINK_OPACITY : 1;
            });
    }

    /**
     * Links and nodes aggregate many features, so they show partial contributions.
     *
     * @returns Always `true`.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the selected part of each mark: a thinner band along the top of a
     * link, and the top fraction of a node.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const parts = this.segregatedParts().filter(p => this.layout.has(p.datum as object));
        const boxOf = (p: SegregatedPart) => this.layout.get(p.datum as object)!;
        const ordered = [
            ...parts.filter(p => boxOf(p).kind === 'link'),
            ...parts.filter(p => boxOf(p).kind === 'node'),
        ];

        const partials = group.selectAll<SVGElement, SegregatedPart>('.autkPartial')
            .data(ordered, p => p.mark)
            .join(enter => enter.append(p => document.createElementNS('http://www.w3.org/2000/svg', boxOf(p).kind === 'link' ? 'path' : 'rect')))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .each((p, i, groups) => {
                const node = d3.select(groups[i]);
                const box = boxOf(p);
                if (box.kind === 'link') {
                    node.attr('d', bandPath(box.sx, box.sy, box.tx, box.ty, box.width * p.fraction));
                } else {
                    // Like every other part, the node part keeps the outline of its mark.
                    node.attr('x', box.x0).attr('y', box.y0)
                        .attr('width', box.x1 - box.x0)
                        .attr('height', (box.y1 - box.y0) * p.fraction)
                        .style('stroke', '#2f2f2f');
                }
            })
            .style('fill', this.highlightColor)
            .style('fill-opacity', 0.9)
            .style('pointer-events', 'none');

        // Layers: links, link parts, nodes (with their border), node parts, labels.
        group.selectAll<SVGElement, FlowRow>('.autkMark').filter(d => d.kind === 'node').raise();
        partials.filter(p => boxOf(p).kind === 'node').raise();
        group.selectAll('.autk-sankey-label').raise();
    }
}
