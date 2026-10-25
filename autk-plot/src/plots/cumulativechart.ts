/**
 * @fileoverview ECDF and Pareto charts: accumulated shares of a whole.
 *
 * Both read the `cumulative` preset, where point `k` accumulates the bars
 * `0…k` (a prefix relation, `N:N`):
 * - **ECDF**: the empirical cumulative distribution of a numeric column, a
 *   step line with one point per value (or bin); point marks
 * - **Pareto**: bars of a categorical column, largest first, with the
 *   cumulative share as a line over them; bars and points are marks
 * - **Segregated view**: A selection from another view draws the accumulated
 *   share of the selected features alone, as a second line under the total,
 *   and fills the selected part of each Pareto bar
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'ecdf',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area'] },
 *   transform: { preset: 'cumulative' },
 *   labels: { axis: ['area', 'share of regions'], title: 'Distribution of areas' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import type { ResolvedPlotTransform } from '../plot-base-data';
import { PlotStyle } from '../plot-style';
import { markId } from '../provenance';

import type { CumulativeRow, ExecutedPlotTransform } from '../transforms';

/** Radius of a cumulative point mark in pixels. */
const POINT_RADIUS = 3.5;

/** Point of a cumulative line in pixels. */
type LinePoint = [number, number];

/**
 * ECDF or Pareto chart of the `cumulative` preset.
 */
export class Cumulativechart extends PlotBaseInteractive {

    /** Chart kind. */
    protected kind: 'ecdf' | 'pareto';
    /** Sum of all bars, the value of the last point. */
    protected total = 0;
    /** Position in pixels of each rendered row: bar rectangles and point centers. */
    protected positions: Map<object, { x: number; y: number; width: number; height: number }> = new Map();
    /** Vertical scale of the cumulative share, `[0, 1]`. */
    protected mapShare = d3.scaleLinear();

    /**
     * Creates an ECDF or Pareto chart and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `cumulative` transform.
     * @param kind `'ecdf'` (numeric column, ascending) or `'pareto'` (largest bar first).
     * @throws If the transform is missing or is not `cumulative`, or its order does not fit the kind.
     */
    constructor(config: PlotConfig, kind: 'ecdf' | 'pareto' = 'ecdf') {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { config.tickFormats = ['~s', '~s']; }
        if (!config.transform || config.transform.preset !== 'cumulative') {
            throw new Error('ECDF and Pareto charts require a cumulative transform preset.');
        }
        const order = config.transform.options?.order ?? (kind === 'pareto' ? 'value' : 'key');
        if (kind === 'ecdf' && order !== 'key') {
            throw new Error("ECDF accumulates values in ascending order (order: 'key').");
        }
        config.transform = { ...config.transform, options: { ...config.transform.options, order } };

        super(config);
        this.kind = kind;
        this.draw();
    }

    /**
     * Keeps the grand total for the shares.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns The default resolution of the base class.
     * @throws If an ECDF reads a non-numeric column.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        if (result.preset === 'cumulative') {
            if (this.kind === 'ecdf' && !result.numeric && result.rows.length > 0) {
                throw new Error('ECDF requires a numeric column.');
            }
            this.total = result.total;
        }
        return super.resolveTransformResult(result);
    }

    /**
     * Renders the title, axes, Pareto bars, and the cumulative line with its points.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as CumulativeRow[];
        const bars = rows.filter(r => r.kind === 'bar');
        const points = rows.filter(r => r.kind === 'point');

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

        // ---- Scales and positions
        this.mapShare = d3.scaleLinear().domain([0, 1]).range([height, 0]);
        this.positions = new Map();
        let xAxis: d3.Axis<d3.NumberValue> | d3.Axis<string>;
        let mapCount: d3.ScaleLinear<number, number> | undefined;
        if (this.kind === 'ecdf') {
            const [lo, hi] = d3.extent(points, p => p.upper ?? 0) as [number | undefined, number | undefined];
            const mapX = d3.scaleLinear().domain([lo ?? 0, hi ?? 1]).range([0, width]);
            points.forEach(p => this.positions.set(p, { x: mapX(p.upper ?? 0), y: this.mapShare(p.share), width: 0, height: 0 }));
            xAxis = d3.axisBottom(mapX).ticks(6).tickFormat(d3.format(this._tickFormats[0] || '~s'));
        } else {
            const mapX = d3.scaleBand().domain(bars.map(b => b.label)).range([0, width]).padding(0.25);
            mapCount = d3.scaleLinear().domain([0, Math.max(1, d3.max(bars, b => b.value) ?? 0)]).range([height, 0]).nice();
            const count = mapCount;
            bars.forEach(b => this.positions.set(b, {
                x: mapX(b.label) ?? 0, y: count(b.value), width: mapX.bandwidth(), height: height - count(b.value),
            }));
            points.forEach(p => this.positions.set(p, {
                x: (mapX(p.label) ?? 0) + mapX.bandwidth() / 2, y: this.mapShare(p.share), width: 0, height: 0,
            }));
            xAxis = d3.axisBottom(mapX).tickSizeOuter(0);
        }

        // ---- Axes: categories or values below, counts left (Pareto), shares right (Pareto) or left (ECDF)
        const xAxisSelection = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxisSelection.call(xAxis as d3.Axis<string>);
        xAxisSelection.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 12)
            .style('fill', '#000')
            .text(d => d);

        const percent = d3.format('.0%');
        const leftAxis = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        if (mapCount) {
            // Counts take whole ticks only.
            const whole = bars.every(b => Number.isInteger(b.value));
            const ticks = whole ? Math.max(1, Math.min(5, Math.ceil(mapCount.domain()[1]))) : 5;
            leftAxis.call(d3.axisLeft(mapCount).ticks(ticks).tickSizeInner(-width).tickFormat(d3.format(this._tickFormats[1] || '~s')));
        } else {
            leftAxis.call(d3.axisLeft(this.mapShare).ticks(5).tickSizeInner(-width).tickFormat(percent));
        }
        leftAxis.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');
        leftAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1] ?? '']).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', 0)
            .style('fill', '#000')
            .text(d => d);
        svg.selectAll<SVGGElement, unknown>('#axisShare').data(mapCount ? [0] : []).join('g')
            .attr('id', 'axisShare').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left + width}, ${this._margins.top})`)
            .call(d3.axisRight(this.mapShare).ticks(5).tickFormat(percent));

        // ---- Marks
        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        const posOf = (r: CumulativeRow) => this.positions.get(r)!;
        cGroup.selectAll<SVGPathElement, LinePoint[]>('.autk-cumulative-line')
            .data([this.linePoints(points.map(p => [posOf(p).x, posOf(p).y]))]).join('path')
            .attr('class', 'autk-cumulative-line')
            .attr('d', line => this.linePath(line))
            .style('fill', 'none')
            .style('stroke', PlotStyle.default)
            .style('stroke-width', 1.5)
            .style('pointer-events', 'none');

        const marks = [...(this.kind === 'pareto' ? bars : []), ...points];
        cGroup.selectAll<SVGElement, CumulativeRow>('.autkMark')
            .data(marks, r => `${r.kind}:${r.index}`)
            .join(enter => enter.append(r => document.createElementNS('http://www.w3.org/2000/svg', r.kind === 'bar' ? 'rect' : 'circle')))
            .attr('class', 'autkMark')
            .each((r, i, nodes) => {
                const node = d3.select(nodes[i]);
                const pos = posOf(r);
                if (r.kind === 'bar') {
                    node.attr('x', pos.x).attr('y', pos.y).attr('width', pos.width).attr('height', Math.max(0, pos.height))
                        .style('stroke', '#ffffff');
                } else {
                    node.attr('cx', pos.x).attr('cy', pos.y).attr('r', POINT_RADIUS);
                }
            })
            .style('fill', r => this.getMarkColor(r))
            .style('cursor', 'pointer')
            .selectAll('title').data(r => [r]).join('title')
            .text(r => r.kind === 'bar'
                ? `${r.label}: ${d3.format('~s')(r.value)} (${percent(r.share)})`
                : `up to ${r.label}: ${d3.format('~s')(r.value)} (${percent(r.share)})`);

        // Bars, then the line, then points.
        cGroup.selectAll('.autk-cumulative-line').raise();
        cGroup.selectAll<SVGElement, CumulativeRow>('.autkMark').filter(r => r.kind === 'point').raise();
        this.configureSignalListeners();
    }

    /**
     * Bars and points aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the chart requires the `cumulative` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the accumulated share of the selected features as a second line
     * under the total, with highlighted points where they add units, and
     * fills the selected part of each Pareto bar from its base.
     *
     * The subset share at point `k` is the selected part of the total up to
     * `k`, so the subset line ends at the selected share of the whole.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || this.positions.size === 0) return;

        const parts = this.segregatedParts().filter(p => this.positions.has(p.datum as object));
        const rowOf = (p: SegregatedPart) => p.datum as unknown as CumulativeRow;
        const shareOf = (p: SegregatedPart) => this.total > 0 ? (p.part.value ?? 0) / this.total : 0;
        const byMark = new Map(parts.map(p => [p.mark, p]));

        const points = (this._data as unknown as CumulativeRow[]).filter(r => r.kind === 'point');
        const line: LinePoint[] = parts.length === 0 ? [] : this.linePoints(points.map(row => {
            const rowId = this.rowIdOf(row);
            const part = rowId ? byMark.get(markId(rowId)) : undefined;
            return [this.positions.get(row)!.x, this.mapShare(part ? shareOf(part) : 0)];
        }));

        group.selectAll<SVGPathElement, LinePoint[]>('.autkPartialLine')
            .data(line.length > 0 ? [line] : [])
            .join(enter => enter.insert('path', '.autkMark'))
            .attr('class', 'autkPartialLine')
            .attr('d', l => this.linePath(l))
            .style('fill', 'none')
            .style('stroke', this.highlightColor)
            .style('stroke-width', 2.5)
            .style('pointer-events', 'none');

        const posOf = (p: SegregatedPart) => this.positions.get(p.datum as object)!;
        group.selectAll<SVGElement, SegregatedPart>('.autkPartial')
            .data(parts, p => p.mark)
            .join(enter => enter.append(p => document.createElementNS('http://www.w3.org/2000/svg', rowOf(p).kind === 'bar' ? 'rect' : 'circle')))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .each((p, i, nodes) => {
                const node = d3.select(nodes[i]);
                const pos = posOf(p);
                if (rowOf(p).kind === 'bar') {
                    node.attr('x', pos.x).attr('width', pos.width)
                        .attr('y', pos.y + pos.height * (1 - p.fraction)).attr('height', Math.max(0, pos.height * p.fraction))
                        .style('stroke', '#ffffff');
                } else {
                    node.attr('cx', pos.x).attr('cy', this.mapShare(shareOf(p))).attr('r', POINT_RADIUS - 0.5)
                        .style('stroke', PlotStyle.provenanceStroke);
                }
            })
            .style('fill', this.highlightColor)
            .style('pointer-events', 'none');

        // Bars and their parts, the lines, then points on top.
        group.selectAll('.autk-cumulative-line').raise();
        group.selectAll('.autkPartialLine').raise();
        group.selectAll<SVGElement, CumulativeRow>('.autkMark').filter(r => r.kind === 'point').raise();
        group.selectAll<SVGElement, SegregatedPart>('.autkPartial').filter(p => rowOf(p).kind === 'point').raise();
    }

    /** ECDF lines start at zero just before the first value; Pareto lines start at the first bar. */
    private linePoints(points: LinePoint[]): LinePoint[] {
        if (this.kind !== 'ecdf' || points.length === 0) return points;
        return [[points[0][0], this.mapShare(0)], ...points];
    }

    /** Step line for the ECDF (right-continuous), straight segments for the Pareto line. */
    private linePath(points: LinePoint[]): string {
        return d3.line().curve(this.kind === 'ecdf' ? d3.curveStepAfter : d3.curveLinear)(points) ?? '';
    }
}
