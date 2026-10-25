/**
 * @fileoverview Violin plot: one mirrored density per category.
 *
 * Provides a D3-based violin plot with the following features:
 * - **One violin per category**: The kernel density of the numeric attribute
 *   (`axis[1]`) within each category (`axis[0]`), mirrored around the
 *   category's center, values on the vertical axis
 * - **Strip marks**: Each violin is drawn as thin horizontal strips, one per
 *   grid point, as wide as the density there; strips are the marks
 * - **Fractional coverage**: Selecting strips covers each feature by the part
 *   of its kernel mass inside them, sent as fractional shares
 * - **Segregated view**: A selection from another view draws an inner violin
 *   with the density of the selected features alone, inside the whole violin
 * - **Transform required**: Data must be built with the `density` preset over
 *   a group and a numeric column
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'violin',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'shape_area'] },
 *   transform: { preset: 'density' },
 *   labels: { axis: ['land use', 'area'], title: 'Area by land use' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';

import type { DensityPointRow } from '../transforms';

/** Overlap between neighboring strips, in pixels, so anti-aliasing leaves no seams. */
const SEAM = 0.5;

/** Box of a strip: center and half-width in x, top and bottom in y, in pixels. */
type Strip = { cx: number; half: number; y0: number; y1: number };

/**
 * Violin plot of the `density` preset over a group and a numeric column.
 */
export class Violin extends PlotBaseInteractive {

    /** Laid-out strip of each rendered point. */
    protected strips: Map<object, Strip> = new Map();
    /** Half-width of a violin per unit of density, in pixels. */
    protected widthPerDensity = 0;

    /**
     * Creates a violin plot and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `density` transform over two columns.
     * @throws If the transform is missing, is not `density`, or has no group column.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { config.tickFormats = ['', '~s']; }
        if (!config.transform || config.transform.preset !== 'density') {
            throw new Error('Violin requires a density transform preset.');
        }
        if ((config.attributes?.axis ?? []).filter(a => a !== '@transform').length < 2) {
            throw new Error('Violin requires a group and a numeric column.');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders the title, axes, and violin strips.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const points = this._data as unknown as DensityPointRow[];
        const groups = Array.from(new Set(points.map(p => p.group)));

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

        // ---- Scales: categories across, values up; all violins share one density scale
        const mapX = d3.scaleBand().domain(groups).range([0, width]).padding(0.15);
        const [lo, hi] = d3.extent(points, p => p.x) as [number | undefined, number | undefined];
        const mapY = d3.scaleLinear().domain([lo ?? 0, hi ?? 1]).range([height, 0]);
        this.widthPerDensity = (mapX.bandwidth() / 2) / (d3.max(points, p => p.value) || 1);

        // ---- Axes
        const xAxis = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxis.call(d3.axisBottom(mapX).tickSizeOuter(0));
        xAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('fill', '#000')
            .text(d => d);

        const yAxis = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        yAxis.call(d3.axisLeft(mapY).ticks(5).tickSizeInner(-width).tickFormat(d3.format(this._tickFormats[1] || '~s')));
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

        // ---- Strips: each grid point covers half the way to its neighbors
        this.strips = new Map();
        for (const group of groups) {
            const curve = points.filter(p => p.group === group);
            const cx = (mapX(group) ?? 0) + mapX.bandwidth() / 2;
            curve.forEach((p, k) => {
                const above = curve[k + 1]?.x ?? p.x + (p.x - (curve[k - 1]?.x ?? p.x));
                const below = curve[k - 1]?.x ?? p.x - (above - p.x);
                this.strips.set(p, { cx, half: p.value * this.widthPerDensity, y0: mapY((p.x + above) / 2), y1: mapY((p.x + below) / 2) });
            });
        }

        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        // Points with zero density have no strip and are not drawn.
        const stripOf = (p: DensityPointRow) => this.strips.get(p)!;
        cGroup.selectAll<SVGRectElement, DensityPointRow>('.autkMark')
            .data(points.filter(p => p.value > 0)).join('rect')
            .attr('class', 'autkMark')
            .attr('x', p => stripOf(p).cx - stripOf(p).half)
            .attr('width', p => 2 * stripOf(p).half)
            .attr('y', p => stripOf(p).y0 - SEAM / 2)
            .attr('height', p => Math.max(0.5, stripOf(p).y1 - stripOf(p).y0) + SEAM)
            .style('fill', p => this.getMarkColor(p))
            .style('cursor', 'pointer')
            .selectAll('title').data(p => [p]).join('title')
            .text(p => `${p.label}: ${p.autkIds.length} ${p.autkIds.length === 1 ? 'feature' : 'features'} within one bandwidth`);

        this.configureSignalListeners();
    }

    /**
     * Strips reduce real-weighted contributions of many features, so they show partial contributions.
     *
     * @returns Always `true`; the violin requires the `density` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws an inner violin: each strip as wide as the density of the selected
     * features alone at that point, centered like the whole strip.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const parts = this.segregatedParts().filter(p => this.strips.has(p.datum as object) && (p.part.value ?? 0) > 0);
        const stripOf = (p: SegregatedPart) => this.strips.get(p.datum as object)!;
        const halfOf = (p: SegregatedPart) => (p.part.value ?? 0) * this.widthPerDensity;

        group.selectAll<SVGRectElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join('rect')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('x', p => stripOf(p).cx - halfOf(p))
            .attr('width', p => 2 * halfOf(p))
            .attr('y', p => stripOf(p).y0 - SEAM / 2)
            .attr('height', p => Math.max(0.5, stripOf(p).y1 - stripOf(p).y0) + SEAM)
            .style('fill', this.highlightColor)
            .style('pointer-events', 'none');
    }
}
