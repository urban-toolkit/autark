/**
 * @fileoverview Line chart visualization for temporal and timeseries data.
 *
 * Provides a D3-based line chart implementation with the following features:
 * - **Single-series rendering**: Aggregates feature-level timeseries or temporal buckets into a unified line
 * - **Flexible bucket labeling**: Supports numeric, date, and custom bucket labels, with optional start year offset
 * - **Selection and linked views**: Uses source feature ids for brush interactions and linked selection across components
 * - **Transform support**: Accepts temporal or timeseries transform presets for flexible aggregation
 *
 * @example
 * // Basic line chart with timeseries transform
 * const plot = new AutkChart(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   transform: {
 *     preset: 'timeseries',
 *     attributes: { value: 'population' }
 *   },
 *   labels: { axis: ['year', 'population'], title: 'Population Over Time' },
 *   startYear: 2000
 * });
 *
 * @example
 * // Line chart with temporal aggregation and brush interaction
 * const plot = new AutkChart(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   transform: {
 *     preset: 'temporal',
 *     attributes: { value: 'cases', time: 'date' },
 *     resolution: 'month',
 *     reducer: 'sum'
 *   },
 *   events: [ChartEvent.BRUSH_Y],
 *   labels: { axis: ['month', 'cases'], title: 'Monthly Cases' }
 * });
 */
import * as d3 from 'd3';

import type { AutkDatum, ChartConfig } from '../api';

import { ChartBase } from '../chart-base';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../events-types';

import { run } from '../transforms';

import type { ExecutedTemporalTransform, ExecutedTimeseriesTransform } from '../transforms';

/**
 * Line chart that aggregates feature-level timeseries into a single series.
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends ChartBase {

    /** Optional year offset added to numeric bucket indices when formatting x-axis tick labels. */
    private _startYear: number;
    /** Computed render data for the current selection: one entry per time bucket. */
    private _seriesData: Array<{ x: number; label: string; y: number; autkIds: number[] }> = [];

    /**
     * Creates a line chart instance and renders the initial state.
     * @param config Linechart configuration.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.BRUSH_Y]; }
        if (config.tickFormats === undefined) { 
            config.tickFormats = ['~s', '~s']; 
        }

        if (!config.transform) {
            throw new Error('Linechart requires a transform configuration.');
        }
        if (config.transform.preset !== 'timeseries' && config.transform.preset !== 'temporal') {
            throw new Error('Linechart only supports timeseries and temporal transform presets.');
        }
        else {
            const axis = config.labels?.axis ?? (config.transform.preset === 'timeseries' ? ['time', 'value'] : ['bucket', 'value']);
            const title = config.labels?.title ?? (config.transform.preset === 'timeseries' ? 'Timeseries' : 'Temporal events');
            config.labels = { axis, title };
        }

        super(config);

        this._startYear = config.startYear ?? 0;

        this.draw();
    }

    /**
     * Computes the transformed series data for the line chart based on the current selection and transform config.
     *
     * Handles bucket label formatting, sorting, and aggregation for both temporal and timeseries presets.
     * Updates the internal _seriesData array used for rendering.
     */
    protected override computeTransform(): void {
        const formatBucketLabel = (bucket: string): string => {
            const numericBucket = Number(bucket);
            if (this._startYear > 0 && Number.isFinite(numericBucket) && String(numericBucket) === bucket) {
                return d3.format(this._tickFormats[0])(this._startYear + numericBucket);
            }
            if (Number.isFinite(numericBucket) && String(numericBucket) === bucket) {
                return d3.format(this._tickFormats[0])(numericBucket);
            }
            return bucket;
        };

        const compareBuckets = (a: string, b: string): number => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            const validDateA = Number.isFinite(dateA.getTime());
            const validDateB = Number.isFinite(dateB.getTime());
            if (validDateA && validDateB) { return dateA.getTime() - dateB.getTime(); }
            const numA = Number(a);
            const numB = Number(b);
            if (Number.isFinite(numA) && Number.isFinite(numB)) { return numA - numB; }
            return a.localeCompare(b);
        };

        const selected = new Set(this.selection);
        const allRows = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
        const sourceRows = this.selection.length === 0
            ? allRows
            : allRows.filter((row) => (row.autkIds ?? []).some((id) => selected.has(id)));

        const transformed = run(sourceRows, this._transformConfig!) as ExecutedTemporalTransform | ExecutedTimeseriesTransform;
        const reducedSeries = [...transformed.rows].sort((a, b) => compareBuckets(a.bucket, b.bucket));
        this._seriesData = reducedSeries.map((item, idx) => ({
            x: idx,
            label: formatBucketLabel(item.bucket),
            y: item.value,
            autkIds: item.autkIds,
        }));
    }

    /**
     * Renders the line chart, including axes, line path, dot marks, and empty state message.
     *
     * Synchronizes the SVG DOM with the current series data and attaches interaction listeners.
     *
     * @returns Promise resolved when SVG nodes are synchronized.
     */
    public async render(): Promise<void> {
        const innerW = this._width - this._margins.left - this._margins.right;
        const innerH = this._height - this._margins.top - this._margins.bottom;

        const svg = d3
            .select(this._div)
            .selectAll('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .style('width', `${this._width}`)
            .style('height', `${this._height || '500px'}`)
            .style('visibility', 'visible');

        const node = svg.node();
        if (!svg || !node) {
            throw new Error('SVG element could not be created.');
        }

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
        const n = Math.max(this._seriesData.length, 1);
        const allY = this._seriesData.map((item) => item.y);
        const yMin = allY.length > 0 ? Math.min(...allY) : 0;
        const yMax = allY.length > 0 ? Math.max(...allY) : 50;
        const yPad = (yMax - yMin) * 0.1 || 1;

        const xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
        const yScale = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([innerH, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(n, 12))
            .tickFormat((d) => this._seriesData[+d]?.label ?? d3.format(this._tickFormats[0])(this._startYear + +d));

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
            .data([this._axis[0]])
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
            .data([this._axis[1]])
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
            .data([this._seriesData])
            .join('path')
            .attr('class', 'autk-line')
            .attr('fill', 'none')
            .attr('stroke', '#4472c4')
            .attr('stroke-width', 1.5)
            .attr('d', lineGen);

        // ---- Dots (marks)
        cGroup
            .selectAll('.autkMark')
            .data(this._seriesData)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => xScale(d.x))
            .attr('cy', (d) => yScale(d.y))
            .attr('r', 3)
            .style('fill', ChartStyle.default)
            .style('visibility', 'inherit');

        // ---- Empty state
        cGroup
            .selectAll('.autk-empty')
            .data(this._seriesData.length === 0 ? ['No timeseries data for the current selection'] : [])
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
}
