/**
 * @fileoverview Treemap of a hierarchy of categories.
 *
 * Provides a D3-based treemap with the following features:
 * - **Nested rectangles**: Each top-level group is a framed, labeled area that
 *   contains its subgroups, with area proportional to the reduced value
 * - **Leaf marks**: The deepest rectangles are the interactive marks
 * - **Segregated view**: A selection from another view fills a centered inner
 *   rectangle whose area is the selected fraction of the leaf
 * - **Transform required**: Data must be built with the `hierarchy` preset and
 *   an additive reducer (count or sum), so areas add up
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'treemap',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'cdta2020'] },
 *   transform: { preset: 'hierarchy' },
 *   labels: { title: 'Regions by land use and district' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';

import type { HierarchyNodeRow } from '../transforms';

import { treeOf } from './hierarchy-tree';
import type { TreeDatum } from './hierarchy-tree';

/** Height of a group label band in pixels. */
const LABEL_BAND = 14;

/** Rectangle of a laid-out node. */
type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Treemap of the `hierarchy` preset, leaves as marks.
 */
export class Treemap extends PlotBaseInteractive {

    /** Laid-out rectangle of each row. */
    protected boxes: Map<object, Box> = new Map();

    /**
     * Creates a treemap and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `hierarchy` transform with an additive reducer.
     * @throws If the transform is missing, is not `hierarchy`, or is not additive.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (!config.transform || config.transform.preset !== 'hierarchy') {
            throw new Error('Treemap requires a hierarchy transform preset.');
        }
        const reducer = config.transform.options?.reducer ?? 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Treemap requires an additive reducer (count or sum).');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, group frames with labels, and leaf rectangles.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as HierarchyNodeRow[];
        const depth = d3.max(rows, r => r.level + 1) ?? 1;

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

        // ---- Layout: groups leave room on top for their label
        const root = d3.treemap<TreeDatum>()
            .size([width, height])
            .paddingOuter(2)
            .paddingTop(node => node.depth > 0 && node.depth < depth ? LABEL_BAND : 2)
            .paddingInner(2)
            .round(true)(treeOf(rows));
        this.boxes = new Map();
        root.descendants().forEach(node => {
            if (node.data.row) this.boxes.set(node.data.row, { x0: node.x0, y0: node.y0, x1: node.x1, y1: node.y1 });
        });

        const leaves = rows.filter(r => r.level === depth - 1 && this.boxes.has(r));
        const groups = rows.filter(r => r.level < depth - 1 && this.boxes.has(r));
        const boxOf = (r: HierarchyNodeRow) => this.boxes.get(r)!;

        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        // Group frames and labels (never intercept clicks)
        cGroup.selectAll<SVGRectElement, HierarchyNodeRow>('.autk-treemap-group')
            .data(groups).join('rect')
            .attr('class', 'autk-treemap-group')
            .attr('x', r => boxOf(r).x0).attr('y', r => boxOf(r).y0)
            .attr('width', r => boxOf(r).x1 - boxOf(r).x0)
            .attr('height', r => boxOf(r).y1 - boxOf(r).y0)
            .style('fill', '#f6f8fa')
            .style('stroke', '#d0d7de')
            .style('pointer-events', 'none');
        cGroup.selectAll<SVGTextElement, HierarchyNodeRow>('.autk-treemap-group-label')
            .data(groups.filter(r => boxOf(r).x1 - boxOf(r).x0 > 30)).join('text')
            .attr('class', 'autk-treemap-group-label')
            .attr('x', r => boxOf(r).x0 + 4)
            .attr('y', r => boxOf(r).y0 + LABEL_BAND - 4)
            .style('font-size', '10px')
            .style('font-weight', '600')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(r => `${r.label} (${d3.format('~s')(r.value)})`);

        cGroup.selectAll<SVGRectElement, HierarchyNodeRow>('.autkMark')
            .data(leaves).join('rect')
            .attr('class', 'autkMark')
            .attr('x', r => boxOf(r).x0).attr('y', r => boxOf(r).y0)
            .attr('width', r => Math.max(0, boxOf(r).x1 - boxOf(r).x0))
            .attr('height', r => Math.max(0, boxOf(r).y1 - boxOf(r).y0))
            .style('fill', r => this.getMarkColor(r))
            .style('cursor', 'pointer')
            .selectAll('title').data(r => [r]).join('title')
            .text(r => `${r.path.join(' · ')}: ${d3.format('~s')(r.value)}`);

        cGroup.selectAll<SVGTextElement, HierarchyNodeRow>('.autk-treemap-label')
            .data(leaves.filter(r => boxOf(r).x1 - boxOf(r).x0 > 34 && boxOf(r).y1 - boxOf(r).y0 > 14)).join('text')
            .attr('class', 'autk-treemap-label')
            .attr('x', r => boxOf(r).x0 + 3)
            .attr('y', r => boxOf(r).y0 + 11)
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(r => r.label);

        this.configureSignalListeners();
    }

    /**
     * Leaves aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the treemap requires an additive `hierarchy` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws a centered inner rectangle whose area is the selected fraction of
     * the leaf, keeping its aspect ratio.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const depth = d3.max(this._data as unknown as HierarchyNodeRow[], r => r.level + 1) ?? 1;
        const parts = this.segregatedParts()
            .filter(p => (p.datum as unknown as HierarchyNodeRow).level === depth - 1 && this.boxes.has(p.datum as object));
        const boxOf = (p: SegregatedPart) => this.boxes.get(p.datum as object)!;
        const scale = (p: SegregatedPart) => Math.sqrt(p.fraction);

        group.selectAll<SVGRectElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join(enter => enter.insert('rect', '.autk-treemap-label'))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('x', p => boxOf(p).x0 + (boxOf(p).x1 - boxOf(p).x0) * (1 - scale(p)) / 2)
            .attr('y', p => boxOf(p).y0 + (boxOf(p).y1 - boxOf(p).y0) * (1 - scale(p)) / 2)
            .attr('width', p => (boxOf(p).x1 - boxOf(p).x0) * scale(p))
            .attr('height', p => (boxOf(p).y1 - boxOf(p).y0) * scale(p))
            .style('fill', this.highlightColor)
            .style('pointer-events', 'none');
    }
}
