/**
 * @fileoverview Line plot visualization for event-based and series data.
 *
 * Provides a D3-based line plot implementation with the following features:
 * - **Single-series rendering**: Aggregates feature-level series points or event buckets into a unified line
 * - **Flexible bucket labeling**: Supports numeric, date, and custom bucket labels
 * - **Selection and linked views**: Uses source feature ids for brush interactions and linked selection across components
 * - **Transform support**: Accepts `binning-events` or `reduce-series` transform presets for flexible aggregation
 *
 * @example
 * // Basic line plot with reduce-series transform
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   attributes: { axis: ['populationSeries', '@transform'] },
 *   transform: {
 *     preset: 'reduce-series',
 *     options: { timestamp: 'year', value: 'population', reducer: 'avg' }
 *   },
 *   labels: { axis: ['year', 'population'], title: 'Population Over Time' },
 * });
 *
 * @example
 * // Line plot with event binning and brush interaction
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: {
 *     preset: 'binning-events',
 *     options: { value: 'cases', timestamp: 'date', resolution: 'month', reducer: 'sum' }
 *   },
 *   events: [PlotEvent.BRUSH_Y],
 *   labels: { axis: ['month', 'cases'], title: 'Monthly Cases' }
 * });
 */
import * as d3 from 'd3';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import type { SegregatedPart } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import { markId } from '../provenance';
import { registeredTransform } from '../transforms/registry';

import type { ExecutedPlotTransform } from '../transforms';

/** Point of the selected-subset line of the segregated view. */
type PartialPoint = {
    /** Bucket position on the x scale. */
    x: number;
    /** Selected-subset value of the bucket, or `null` when it has no selected units. */
    y: number | null;
};

/**
 * Line plot that aggregates feature-level series data into a single line.
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends PlotBaseInteractive {
    /** Linear scale mapping bucket positions to pixel coordinates. */
    protected xScale!: d3.ScaleLinear<number, number>;
    /** Linear scale mapping bucket values to pixel coordinates. */
    protected yScale!: d3.ScaleLinear<number, number>;

    /**
     * Creates a line plot instance and renders the initial state.
     *
     * @param config Linechart configuration.
     * @throws If no transform is configured or if the preset is unsupported.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { 
            config.tickFormats = ['~s', '~s']; 
        }

        if (!config.transform) {
            throw new Error('Linechart requires a transform configuration.');
        }
        // A registered transform is read like binning-events when it yields bucket and value rows.
        const registered = config.transform.preset === 'registered' && registeredTransform(config.transform.name).shape === 'series';
        if (config.transform.preset !== 'reduce-series' && config.transform.preset !== 'binning-events' && !registered) {
            throw new Error('Linechart only supports reduce-series and binning-events transform presets.');
        }
        else {
            const axis = config.labels?.axis ?? (config.transform.preset === 'reduce-series' ? ['time', 'value'] : ['bucket', 'value']);
            const title = config.labels?.title ?? (config.transform.preset === 'reduce-series' ? 'Series' : 'Events over time');
            config.labels = { axis, title };
        }

        super(config);

        this.draw();
    }

    /**
     * Normalizes temporal transform output into the rendered line-series schema.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns Render rows shaped as `{ x, label, y, autkIds }` for line rendering.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform) {
        const resolved = super.resolveTransformResult(result);
        const series = result.preset === 'binning-events' || result.preset === 'reduce-series'
            || (result.preset === 'registered' && result.shape === 'series');
        if (!series) {
            return resolved;
        }

        const items = result.rows as unknown as Array<{ bucket: string; value: number; autkIds: number[] }>;
        const sorted = items
            .map((item, idx) => ({ item, rowId: result.provenance.rowIds[idx] }))
            .sort((a, b) => this.compareBuckets(a.item.bucket, b.item.bucket));
        const rows = sorted.map(({ item }, idx) => ({
            x: idx,
            label: this.formatBucketLabel(item.bucket),
            y: item.value,
            autkIds: item.autkIds,
        }));

        return {
            rows,
            axisAttributes: ['label', 'y'],
            rowIds: sorted.map(({ rowId }) => rowId),
        };
    }

    /**
     * Renders the line plot, including axes, line path, dot marks, and empty state message.
     *
     * Synchronizes the SVG DOM with the current series data and attaches interaction listeners.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const seriesData = this._data as Array<{ x: number; label: string; y: number; autkIds: number[] }>;
        const innerW = this._width - this._margins.left - this._margins.right;
        const innerH = this._height - this._margins.top - this._margins.bottom;

        const svg = d3
            .select(this._div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `${this._width}px`)
            .style('height', `${this._height}px`)
            .style('visibility', 'visible');

        const node = svg.node();
        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

        svg.attr('width', this._width).attr('height', this._height);

        // ---- Title (optional)
        if (this._title && this._title.length > 0) {
            svg
                .selectAll<SVGTextElement, string>('#plotTitle')
                .data([this._title])
                .join('text')
                .attr('id', 'plotTitle')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + innerW / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text((d) => d);
        }

        // ---- Scales
        const n = Math.max(seriesData.length, 1);
        const allY = seriesData.map((item) => item.y);
        // Segregated view: count and sum parts lie between 0 and the total, so the axis starts at 0.
        const reducer = this._provenance.reducer;
        const zeroBased = this.segregatedEnabled && (reducer === 'count' || reducer === 'sum');
        if (zeroBased) allY.push(0);
        const yMin = allY.length > 0 ? Math.min(...allY) : 0;
        const yMax = allY.length > 0 ? Math.max(...allY) : 50;
        const yPad = (yMax - yMin) * 0.1 || 1;

        const xScale = this.xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
        // With negative values the axis still extends below them; 0 is only the floor for non-negative data.
        const yLow = zeroBased && yMin >= 0 ? 0 : yMin - yPad;
        const yScale = this.yScale = d3.scaleLinear().domain([yLow, yMax + yPad]).range([innerH, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(n, 12))
            .tickFormat((d) => seriesData[+d]?.label ?? d3.format(this._tickFormats[0])(+d));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);
        xAxisSelection.selectAll<SVGTextElement, unknown>('text')
            .style('font-size', '11px')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.4em')
            .attr('dy', '0.4em');
        xAxisSelection
            .selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]])
            .join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', innerW)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text((d) => d);

        const yAxis = d3.axisLeft(yScale)
            .ticks(5)
            .tickSizeInner(-innerW)
            .tickFormat(d3.format(this._tickFormats[1]));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);
        yAxisSelection.selectAll<SVGLineElement, unknown>('.tick line').style('stroke', '#e0e0e0');
        yAxisSelection
            .selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1]])
            .join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('visibility', 'visible')
            .text((d) => d);

        // ---- Marks group
        const cGroup = svg
            .selectAll('.autkBrush')
            .data([0])
            .join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup
            .selectAll('.autkClear')
            .data([0])
            .join('rect')
            .attr('class', 'autkClear')
            .attr('width', innerW)
            .attr('height', innerH)
            .style('fill', 'white')
            .style('opacity', 0)
            .style('visibility', 'visible');

        // ---- Line path
        const lineGen = d3.line<{ x: number; y: number }>()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y));

        cGroup
            .selectAll<SVGPathElement, Array<{ x: number; y: number }>>('.autk-line')
            .data([seriesData])
            .join('path')
            .attr('class', 'autk-line')
            .attr('fill', 'none')
            // The line takes the mark color, so the line of the selection stands out.
            .attr('stroke', PlotStyle.default)
            .attr('stroke-width', 1.5)
            .attr('d', lineGen);

        // ---- Dots (marks)
        cGroup
            .selectAll('.autkMark')
            .data(seriesData)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => xScale(d.x))
            .attr('cy', (d) => yScale(d.y))
            .attr('r', 5)
            .style('fill', PlotStyle.default)
            .style('visibility', 'inherit');

        // ---- Empty state
        cGroup
            .selectAll('.autk-empty')
            .data(seriesData.length === 0 ? ['No series data available'] : [])
            .join('text')
            .attr('class', 'autk-empty')
            .attr('x', innerW / 2)
            .attr('y', innerH / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#aaa')
            .text((d) => d);

        this.configureSignalListeners();
    }

    /**
     * Buckets reduce units from many features, and one feature spreads units
     * over many buckets, so the line can show partial contributions.
     *
     * @returns Always `true`; the line plot requires an aggregating transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the line of the selected subset next to the total line.
     *
     * Each bucket of the subset line applies the bucket reducer to the units of
     * the selected features only. For count and sum, a bucket without selected
     * units is `0`, clamped to the bottom of the plot when `0` is outside the y
     * domain. For avg, min, and max it is a gap. Buckets with selected units
     * also get a highlighted dot.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || !this.xScale || !this.yScale) return;

        const parts = this.segregatedParts();
        const byMark = new Map(parts.map(p => [p.mark, p]));
        const additive = parts[0]?.part.additive ?? true;
        const rows = this._data as Array<{ x: number }>;

        const points: PartialPoint[] = parts.length === 0 ? [] : rows.map(row => {
            const rowId = this.rowIdOf(row);
            const part = rowId ? byMark.get(markId(rowId))?.part : undefined;
            return { x: row.x, y: part?.value ?? (additive ? 0 : null) };
        });

        const yClamped = this.yScale.copy().clamp(true);
        const line = d3.line<PartialPoint>()
            .defined(p => p.y !== null)
            .x(p => this.xScale(p.x))
            .y(p => yClamped(p.y ?? 0));

        group
            .selectAll<SVGPathElement, PartialPoint[]>('.autkPartialLine')
            .data(points.length > 0 ? [points] : [])
            .join('path')
            .attr('class', 'autkPartialLine')
            .attr('fill', 'none')
            .attr('stroke', this.highlightColor)
            .attr('stroke-width', 3)
            .attr('d', line)
            .style('pointer-events', 'none');

        group
            .selectAll<SVGCircleElement, SegregatedPart>('.autkPartial')
            .data(parts, (p) => p.mark)
            .join('circle')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', (p) => p.mark)
            .attr('data-autk-units', (p) => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('cx', (p) => this.xScale((p.datum as { x: number }).x))
            .attr('cy', (p) => yClamped(p.part.value ?? 0))
            .attr('r', 4)
            .style('fill', this.highlightColor)
            .style('stroke', PlotStyle.provenanceStroke)
            .style('pointer-events', 'none');
    }

    /**
     * Formats a bucket label for axis rendering.
     *
     * Numeric buckets are formatted using the configured x-axis tick format;
     * all other labels are returned unchanged.
     *
     * @param bucket Raw bucket label from the transform result.
     * @returns Display label used on the x axis.
     */
    private formatBucketLabel(bucket: string): string {
        const numericBucket = Number(bucket);
        if (Number.isFinite(numericBucket) && String(numericBucket) === bucket) {
            return d3.format(this._tickFormats[0])(numericBucket);
        }
        return bucket;
    }

    /**
     * Compares two bucket labels for stable temporal/numeric/string ordering.
     *
     * @param a First bucket label.
     * @param b Second bucket label.
     * @returns Negative when `a < b`, positive when `a > b`, or zero when equal.
     */
    private compareBuckets(a: string, b: string): number {
        const dateA = new Date(a);
        const dateB = new Date(b);
        const validDateA = Number.isFinite(dateA.getTime());
        const validDateB = Number.isFinite(dateB.getTime());
        if (validDateA && validDateB) { return dateA.getTime() - dateB.getTime(); }

        const numA = Number(a);
        const numB = Number(b);
        if (Number.isFinite(numA) && Number.isFinite(numB)) { return numA - numB; }

        return a.localeCompare(b);
    }
}
