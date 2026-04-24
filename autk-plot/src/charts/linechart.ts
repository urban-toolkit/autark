/**
 * @fileoverview Line chart visualization for event-based and series data.
 *
 * Provides a D3-based line chart implementation with the following features:
 * - **Single-series rendering**: Aggregates feature-level series points or event buckets into a unified line
 * - **Flexible bucket labeling**: Supports numeric, date, and custom bucket labels
 * - **Selection and linked views**: Uses source feature ids for brush interactions and linked selection across components
 * - **Transform support**: Accepts `binning-events` or `reduce-series` transform presets for flexible aggregation
 *
 * @example
 * // Basic line chart with reduce-series transform
 * const plot = new AutkChart(plotDiv, {
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
 * // Line chart with event binning and brush interaction
 * const plot = new AutkChart(plotDiv, {
 *   type: 'linechart',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: {
 *     preset: 'binning-events',
 *     options: { value: 'cases', timestamp: 'date', resolution: 'month', reducer: 'sum' }
 *   },
 *   events: [ChartEvent.BRUSH_Y],
 *   labels: { axis: ['month', 'cases'], title: 'Monthly Cases' }
 * });
 */
import * as d3 from 'd3';

import type { ChartConfig } from '../api';

import { ChartBaseInteractive } from '../chart-base-interactive';
import { ChartStyle } from '../chart-style';

import type { ExecutedChartTransform } from '../transforms';

/**
 * Line chart that aggregates feature-level series data into a single line.
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends ChartBaseInteractive {
    /**
     * Creates a line chart instance and renders the initial state.
     *
     * @param config Linechart configuration.
     * @throws If no transform is configured or if the preset is unsupported.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.tickFormats === undefined) { 
            config.tickFormats = ['~s', '~s']; 
        }

        if (!config.transform) {
            throw new Error('Linechart requires a transform configuration.');
        }
        if (config.transform.preset !== 'reduce-series' && config.transform.preset !== 'binning-events') {
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
    protected override resolveTransformResult(result: ExecutedChartTransform) {
        const resolved = super.resolveTransformResult(result);
        if (result.preset !== 'binning-events' && result.preset !== 'reduce-series') {
            return resolved;
        }

        const rows = [...result.rows]
            .sort((a, b) => this.compareBuckets(a.bucket, b.bucket))
            .map((item, idx) => ({
                x: idx,
                label: this.formatBucketLabel(item.bucket),
                y: item.value,
                autkIds: item.autkIds,
            }));

        return {
            rows,
            axisAttributes: ['label', 'y'],
        };
    }

    /**
     * Renders the line chart, including axes, line path, dot marks, and empty state message.
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
        const yMin = allY.length > 0 ? Math.min(...allY) : 0;
        const yMax = allY.length > 0 ? Math.max(...allY) : 50;
        const yPad = (yMax - yMin) * 0.1 || 1;

        const xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
        const yScale = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([innerH, 0]);

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
            .attr('stroke', '#4472c4')
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
            .style('fill', ChartStyle.default)
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
