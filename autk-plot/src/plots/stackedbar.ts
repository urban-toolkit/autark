/**
 * @fileoverview Stacked bar chart of a two-level hierarchy.
 *
 * Provides a D3-based bar chart of groups split into subgroups:
 * - **Stacked layout**: One bar per group, made of one segment per subgroup
 * - **Leaf marks**: Segments are the interactive marks; subgroups are
 *   told apart by grey shades, with a legend
 * - **Segregated view**: A selection from another view fills the part of each
 *   segment it produced, from the segment's base
 * - **Transform required**: Data must be built with the `hierarchy` preset over
 *   two columns (group, subgroup) and an additive reducer (count or sum)
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'stackedbar',
 *   collection: geojson,
 *   attributes: { axis: ['cdta2020', 'landuse'] },
 *   transform: { preset: 'hierarchy' },
 *   labels: { axis: ['district', 'regions'], title: 'Land use by district' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';

import type { HierarchyNodeRow } from '../transforms';

/** Laid-out box of a leaf: its rectangle in the drawing area. */
type LeafBox = { x: number; y: number; width: number; height: number };

/**
 * Stacked bars of groups (`axis[0]`) split into subgroups (`axis[1]`).
 */
export class Stackedbar extends PlotBaseInteractive {

    /** Laid-out box of each leaf row. */
    protected boxes: Map<object, LeafBox> = new Map();
    /** Subgroup labels, in legend order. */
    protected subgroups: string[] = [];

    /**
     * Creates a stacked bar chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a two-column `hierarchy` transform.
     * @throws If the transform is missing, is not `hierarchy`, has not two columns, or is not additive.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { config.tickFormats = ['', '~s']; }
        if (!config.transform || config.transform.preset !== 'hierarchy') {
            throw new Error('Stacked bars require a hierarchy transform preset.');
        }
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length !== 2) {
            throw new Error('Stacked bars require two columns: group and subgroup.');
        }
        const reducer = config.transform.options?.reducer ?? 'count';
        if (reducer !== 'count' && reducer !== 'sum') {
            throw new Error('Stacked bars require an additive reducer (count or sum).');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, legend, axes, and leaf bars.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as HierarchyNodeRow[];
        const groups = rows.filter(r => r.level === 0);
        const leaves = rows.filter(r => r.level === 1);
        this.subgroups = Array.from(new Set(leaves.map(l => l.label))).sort((a, b) => a.localeCompare(b));

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
            .attr('y', Math.max(this._margins.top * 0.35, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);

        // ---- Legend of subgroup shades, under the title
        const legend = svg.selectAll<SVGGElement, string>('.autk-bar-legend')
            .data(this.subgroups).join('g')
            .attr('class', 'autk-bar-legend')
            .attr('transform', (_s, i) => `translate(${this._margins.left + i * Math.min(110, width / Math.max(1, this.subgroups.length))}, ${Math.max(this._margins.top * 0.62, 18)})`);
        legend.selectAll('rect').data(s => [s]).join('rect')
            .attr('width', 10).attr('height', 10).attr('y', -9)
            .style('fill', s => this.shadeOf(s));
        legend.selectAll('text').data(s => [s]).join('text')
            .attr('x', 14)
            .style('font-size', '10px')
            .style('fill', '#24292f')
            .text(s => s);

        // ---- Scales
        const mapX = d3.scaleBand().domain(groups.map(g => g.label)).range([0, width]).padding(0.2);
        const mapY = d3.scaleLinear().domain([0, Math.max(1, d3.max(groups, g => g.value) ?? 0)]).range([height, 0]).nice();

        // ---- Axes
        const xAxis = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxis.call(d3.axisBottom(mapX).tickSizeOuter(0));
        xAxis.selectAll<SVGTextElement, unknown>('.tick text')
            .style('text-anchor', groups.length > 6 ? 'end' : 'middle')
            .attr('dx', groups.length > 6 ? '-0.6em' : null)
            .attr('dy', groups.length > 6 ? '0.15em' : '0.71em')
            .attr('transform', groups.length > 6 ? 'rotate(-45)' : null);
        xAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom - 4)
            .style('fill', '#000')
            .text(d => d);

        const yAxis = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        // Counts take whole ticks only.
        const whole = leaves.every(l => Number.isInteger(l.value));
        const ticks = whole ? Math.max(1, Math.min(5, Math.ceil(mapY.domain()[1]))) : 5;
        yAxis.call(d3.axisLeft(mapY).ticks(ticks).tickSizeInner(-width).tickFormat(d3.format(this._tickFormats[1] || '~s')));
        yAxis.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');
        yAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1] ?? '']).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', 0)
            .style('fill', '#000')
            .text(d => d);

        // ---- Leaf boxes
        this.boxes = new Map();
        for (const group of groups) {
            const x = mapX(group.label) ?? 0;
            let base = 0;
            for (const leaf of leaves.filter(l => l.parent === group.key)
                .sort((a, b) => this.subgroups.indexOf(a.label) - this.subgroups.indexOf(b.label))) {
                this.boxes.set(leaf, { x, width: mapX.bandwidth(), y: mapY(base + leaf.value), height: mapY(base) - mapY(base + leaf.value) });
                base += leaf.value;
            }
        }

        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGRectElement, HierarchyNodeRow>('.autkMark')
            .data(leaves.filter(l => this.boxes.has(l))).join('rect')
            .attr('class', 'autkMark')
            .attr('x', l => this.boxes.get(l)!.x)
            .attr('y', l => this.boxes.get(l)!.y)
            .attr('width', l => this.boxes.get(l)!.width)
            .attr('height', l => Math.max(0, this.boxes.get(l)!.height))
            .style('fill', l => this.getMarkColor(l))
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('cursor', 'pointer')
            .selectAll('title').data(l => [l]).join('title')
            .text(l => `${l.path.join(' · ')}: ${d3.format('~s')(l.value)}`);

        this.configureSignalListeners();
    }

    /**
     * Colors unselected leaves by the grey shade of their subgroup.
     *
     * @param d Bound datum of a leaf.
     * @returns The highlight color when selected, the subgroup shade otherwise.
     */
    protected override getMarkColor(d: unknown): string {
        if (this.isMarkHighlighted(d)) return this.highlightColor;
        return this.shadeOf((d as HierarchyNodeRow).label);
    }

    /**
     * Leaves aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the chart requires an additive `hierarchy` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Fills the selected fraction of each leaf bar, from its base.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const parts = this.segregatedParts().filter(p => this.boxes.has(p.datum as object));
        const boxOf = (p: SegregatedPart) => this.boxes.get(p.datum as object)!;

        group.selectAll<SVGRectElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join('rect')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('x', p => boxOf(p).x)
            .attr('width', p => boxOf(p).width)
            .attr('y', p => boxOf(p).y + boxOf(p).height * (1 - p.fraction))
            .attr('height', p => Math.max(0, boxOf(p).height * p.fraction))
            .style('fill', this.highlightColor)
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('pointer-events', 'none');
    }

    /** Grey shade of a subgroup. */
    private shadeOf(subgroup: string): string {
        return PlotStyle.shade(Math.max(0, this.subgroups.indexOf(subgroup)), this.subgroups.length);
    }
}
