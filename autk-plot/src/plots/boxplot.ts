/**
 * @fileoverview Box plot for comparing numeric distributions across categories.
 *
 * Provides a D3-based box plot with the following features:
 * - **Distribution summary**: Quartile box, median line, Tukey whiskers, and outlier dots per category
 * - **Selection and linked views**: Clicking a box selects all source features of its category
 * - **Segregated view**: Features selected elsewhere appear as dots at their own values inside
 *   the box, since order statistics cannot be split into parts
 * - **Transform required**: Data must be summarized via the `box-stats` transform preset
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'boxplot',
 *   collection: geojson,
 *   attributes: { axis: ['landuse', 'shape_area'] },
 *   transform: { preset: 'box-stats' },
 *   labels: { axis: ['land use', 'area'], title: 'Area by land use' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import { featureId } from '../provenance';

import type { BoxStatsRow } from '../transforms';

/** Dot of the segregated view: one selected source feature at its value. */
type SelectedDot = {
    /** Box row the feature belongs to. */
    row: BoxStatsRow;
    /** Mark id of the box. */
    mark: string;
    /** Source feature index. */
    feature: number;
    /** Value of the feature. */
    value: number;
    /** Role of the feature in the box summary. */
    role: 'median' | 'outlier' | 'box' | 'whisker';
};

/**
 * Box plot of one numeric column grouped by one categorical column.
 */
export class Boxplot extends PlotBaseInteractive {

    /** Band scale mapping categories to pixel positions. */
    protected mapX!: d3.ScaleBand<string>;
    /** Linear scale mapping values to pixel coordinates. */
    protected mapY!: d3.ScaleLinear<number, number>;

    /**
     * Creates a box plot instance and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `box-stats` transform preset.
     * @throws If the transform is missing or is not `box-stats`.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { config.tickFormats = ['', '~s']; }

        if (!config.transform || config.transform.preset !== 'box-stats') {
            throw new Error('Boxplot requires a box-stats transform preset.');
        }

        super(config);
        this.draw();
    }

    /**
     * Renders axes, boxes, medians, whiskers, and outliers.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as BoxStatsRow[];

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

        // ---- Scales
        const values = rows.flatMap(r => [r.whiskerLow, r.whiskerHigh, ...r.outliers]);
        const [lo, hi] = d3.extent(values) as [number, number];
        const pad = ((hi ?? 1) - (lo ?? 0)) * 0.05 || 1;
        this.mapX = d3.scaleBand().domain(rows.map(r => r.category)).range([0, width]).padding(0.35);
        this.mapY = d3.scaleLinear().domain([(lo ?? 0) - pad, (hi ?? 1) + pad]).range([height, 0]).nice();

        // ---- Axes
        const xAxis = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxis.call(d3.axisBottom(this.mapX).tickSizeOuter(0));
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
        yAxis.call(d3.axisLeft(this.mapY).ticks(5).tickSizeInner(-width).tickFormat(d3.format(this._tickFormats[1] || '~s')));
        yAxis.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');
        yAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('fill', '#000')
            .text(d => d);

        // ---- Marks group
        const cGroup = svg.selectAll('.autkMarksGroup').data([0]).join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        const band = this.mapX.bandwidth();
        const center = (r: BoxStatsRow) => (this.mapX(r.category) ?? 0) + band / 2;

        // Whiskers (drawn first, under the box)
        cGroup.selectAll<SVGLineElement, BoxStatsRow>('.autk-box-whisker')
            .data(rows).join('line')
            .attr('class', 'autk-box-whisker')
            .attr('x1', center).attr('x2', center)
            .attr('y1', r => this.mapY(r.whiskerLow)).attr('y2', r => this.mapY(r.whiskerHigh))
            .style('stroke', '#57606a');
        cGroup.selectAll<SVGPathElement, BoxStatsRow>('.autk-box-caps')
            .data(rows).join('path')
            .attr('class', 'autk-box-caps')
            .attr('d', r => {
                const x0 = center(r) - band / 4;
                const x1 = center(r) + band / 4;
                return `M${x0},${this.mapY(r.whiskerLow)}H${x1}M${x0},${this.mapY(r.whiskerHigh)}H${x1}`;
            })
            .style('stroke', '#57606a');

        // Boxes are the interactive marks
        cGroup.selectAll<SVGRectElement, BoxStatsRow>('.autkMark')
            .data(rows).join('rect')
            .attr('class', 'autkMark')
            .attr('x', r => this.mapX(r.category) ?? 0)
            .attr('width', band)
            .attr('y', r => this.mapY(r.q3))
            .attr('height', r => Math.max(1, this.mapY(r.q1) - this.mapY(r.q3)))
            .style('fill', d => this.getMarkColor(d))
            .style('stroke', '#2f2f2f')
            .style('cursor', 'pointer')
            .selectAll('title').data(r => [r]).join('title')
            .text(r => `${r.category}\nn = ${r.count}\nmedian = ${d3.format('~s')(r.median)} (features ${r.medianIds.join(', ')})`
                + `\nQ1 = ${d3.format('~s')(r.q1)}, Q3 = ${d3.format('~s')(r.q3)}\noutliers: ${r.outlierIds.length}`);

        // Median line and outliers (never intercept clicks)
        cGroup.selectAll<SVGLineElement, BoxStatsRow>('.autk-box-median')
            .data(rows).join('line')
            .attr('class', 'autk-box-median')
            .attr('x1', r => this.mapX(r.category) ?? 0).attr('x2', r => (this.mapX(r.category) ?? 0) + band)
            .attr('y1', r => this.mapY(r.median)).attr('y2', r => this.mapY(r.median))
            .style('stroke', '#24292f').style('stroke-width', 2)
            .style('pointer-events', 'none');
        cGroup.selectAll<SVGCircleElement, { row: BoxStatsRow; value: number }>('.autk-box-outlier')
            .data(rows.flatMap(row => row.outliers.map(value => ({ row, value })))).join('circle')
            .attr('class', 'autk-box-outlier')
            .attr('cx', d => center(d.row)).attr('cy', d => this.mapY(d.value))
            .attr('r', 3)
            .style('fill', 'none').style('stroke', '#57606a')
            .style('pointer-events', 'none');

        this.configureSignalListeners();
    }

    /**
     * Boxes aggregate many features, so they can show where selected features fall.
     *
     * @returns Always `true`.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws one dot per selected source feature at its own value inside its box.
     *
     * Order statistics are produced by specific features, not by all of them,
     * so the part of a box that "corresponds" to a selection is where those
     * features sit in the distribution. Dots are spread horizontally by a
     * deterministic offset; their tooltip names the feature's role.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || !this.mapX || !this.mapY) return;

        const dots: SelectedDot[] = [];
        const parts = this.segregatedParts();
        if (parts.length > 0) {
            const selected = new Set(this.selection.map(featureId));
            for (const part of parts) {
                const row = part.datum as unknown as BoxStatsRow;
                const rowId = this.rowIdOf(row);
                for (const unit of this._provenance.contributions) {
                    if (unit.target !== rowId || !selected.has(unit.source)) continue;
                    const feature = Number(unit.source.slice('feature:'.length));
                    const role = row.medianIds.includes(feature) ? 'median'
                        : row.outlierIds.includes(feature) ? 'outlier'
                        : unit.value >= row.q1 && unit.value <= row.q3 ? 'box' : 'whisker';
                    dots.push({ row, mark: part.mark, feature, value: unit.value, role });
                }
            }
        }

        const band = this.mapX.bandwidth();
        const offset = (feature: number) => ((feature * 0.618034) % 1 - 0.5) * band * 0.6;

        group.selectAll<SVGCircleElement, SelectedDot>('.autkPartial')
            .data(dots, d => `${d.mark}|${d.feature}`)
            .join('circle')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', d => d.mark)
            .attr('data-autk-feature', d => d.feature)
            .attr('data-autk-role', d => d.role)
            .attr('cx', d => (this.mapX(d.row.category) ?? 0) + band / 2 + offset(d.feature))
            .attr('cy', d => this.mapY(d.value))
            .attr('r', 3.5)
            .style('fill', this.highlightColor)
            .style('stroke', PlotStyle.provenanceStroke)
            .style('pointer-events', 'none')
            .selectAll('title').data(d => [d]).join('title')
            .text(d => `feature ${d.feature}: ${d3.format('~s')(d.value)} (${d.role})`);
    }
}
