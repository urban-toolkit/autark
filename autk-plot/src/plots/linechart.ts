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
import type { BrushExtent } from '../types-events';

import { PlotBaseInteractive } from '../plot-base-interactive';

import type { ExecutedPlotTransform } from '../transforms';

/**
 * Line plot that aggregates feature-level series data into a single line, or into
 * one line per group when the reduce-series transform groups features (`options.by`).
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends PlotBaseInteractive {
    /**
     * Creates a line plot instance and renders the initial state.
     *
     * @param config Linechart configuration.
     * @throws If no transform is configured or if the preset is unsupported.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }

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

    /** Scales of the latest render, from rank (x) and value (y) to pixels. */
    protected mapX?: d3.ScaleLinear<number, number>;
    protected mapY?: d3.ScaleLinear<number, number>;

    /**
     * The brushed box in data units. Points sit at their rank among the buckets, so x is a (fractional) rank, and `xBucket` gives
     * the raw bucket key at each end, the nearest bucket inside the plot.
     */
    protected override brushExtent([x0, y0, x1, y1]: [number, number, number, number], axes: 'x' | 'y' | 'xy'): BrushExtent | undefined {
        if (!this.mapX || !this.mapY) { return undefined; }
        const rows = this._data as Array<{ x: number; bucket?: string }>;
        const last = Math.max(0, (d3.max(rows, row => row.x) ?? 0));
        const keyAt = (rank: number): string | undefined => rows.find(row => row.x === Math.min(last, Math.max(0, Math.round(rank))))?.bucket;
        const [a, b] = [this.mapX.invert(x0), this.mapX.invert(x1)].sort((p, q) => p - q);
        const keys = [keyAt(a), keyAt(b)];
        return {
            ...(axes !== 'y' ? { x: [a, b] as [number, number] } : {}),
            ...(axes !== 'y' && keys[0] !== undefined && keys[1] !== undefined ? { xBucket: keys as [string, string] } : {}),
            ...(axes !== 'x' ? { y: [this.mapY.invert(y1), this.mapY.invert(y0)] as [number, number] } : {}),
        };
    }

    /** Runs the overlay callback again, for when the page's own state changed but the data did not. */
    public override refreshOverlay(): void {
        this.drawOverlay();
    }

    private drawOverlay(): void {
        const layer = d3.select(this._div).select<SVGGElement>('.autkOverlay').node();
        if (!this._overlay || !layer || !this.mapX || !this.mapY) { return; }
        layer.replaceChildren();
        const rows = this._data as Array<{ x: number; bucket?: string }>;
        const sorted = rows.filter(row => row.bucket !== undefined).sort((p, q) => p.x - q.x);
        const mapX = this.mapX, mapY = this.mapY;
        this._overlay({
            layer,
            width: this._width - this._margins.left - this._margins.right,
            height: this._height - this._margins.top - this._margins.bottom,
            x: v => mapX(v),
            y: v => mapY(v),
            rankOf: key => sorted.find(row => (row.bucket as string) >= key)?.x ?? (d3.max(rows, row => row.x) ?? 0) + 1,
        });
    }

    /**
     * Normalizes temporal transform output into the rendered line-series schema.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns Render rows shaped as `{ x, label, y, autkIds }` for line rendering.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform) {
        const resolved = super.resolveTransformResult(result);
        if (result.preset !== 'binning-events' && result.preset !== 'reduce-series') {
            return resolved;
        }

        // Every group (series) shares one x axis: a bucket's x is its place among all the buckets, in order.
        const buckets = [...new Set(result.rows.map(item => item.bucket))].sort((a, b) => this.compareBuckets(a, b));
        const place = new Map(buckets.map((bucket, idx) => [bucket, idx]));
        // Timestamp buckets get short labels: the date for a span of days, the date and hour for a shorter one.
        const times = buckets.map(bucket => this.bucketTime(bucket));
        const isTime = buckets.length > 0 && /^\d{4}-\d{2}-\d{2}/.test(buckets[0]) && times.every(date => Number.isFinite(date.getTime()));
        const spanDays = isTime ? (times[times.length - 1].getTime() - times[0].getTime()) / 86400000 : 0;
        const timeLabel = isTime ? d3.utcFormat(spanDays > 4 ? '%b %-d' : '%b %-d %Hh') : null;
        const grouped = result.preset === 'reduce-series' && result.rows.some(item => item.group !== undefined);
        const rows = [...result.rows]
            .sort((a, b) => place.get(a.bucket)! - place.get(b.bucket)!)
            .map(item => ({
                x: place.get(item.bucket)!,
                bucket: item.bucket,
                label: timeLabel ? timeLabel(this.bucketTime(item.bucket)) : this.formatBucketLabel(item.bucket),
                y: item.value,
                autkIds: item.autkIds,
                ...('group' in item && item.group !== undefined ? { group: item.group } : {}),
            }));

        return {
            rows,
            axisAttributes: ['label', 'y'],
            ...(grouped ? { colorAttribute: 'group' } : {}),
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
        const seriesData = this._data as Array<{ x: number; label: string; y: number; autkIds: number[]; group?: string }>;
        // One line per group; without groups, one line for everything.
        const lines = d3.group(seriesData, (item) => item.group ?? '');
        const innerW = this._width - this._margins.left - this._margins.right;
        const innerH = this._height - this._margins.top - this._margins.bottom;

        const svg = d3
            .select(this._div)
            .selectAll('svg.autk-plot')
            .data([0])
            .join('svg')
            .attr('class', 'autk-plot')
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
                .selectAll<SVGTextElement, string>('.plot-title')
                .data([this._title])
                .join('text')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + innerW / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text((d) => d);
        }

        // ---- Scales
        const n = Math.max(d3.max(seriesData, (item) => item.x + 1) ?? 1, 1);
        const allY = seriesData.map((item) => item.y);
        const yMin = allY.length > 0 ? Math.min(...allY) : 0;
        const yMax = allY.length > 0 ? Math.max(...allY) : 50;
        const yPad = (yMax - yMin) * 0.1 || 1;

        const xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
        const yScale = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([innerH, 0]);
        this.mapX = xScale;
        this.mapY = yScale;

        // ---- Axes
        // Ticks only where a bucket is: with two or three buckets, d3 would also place ticks halfway between them.
        const xAxis = d3.axisBottom(xScale)
            .tickValues(xScale.ticks(Math.min(n, 12)).filter(Number.isInteger))
            .tickFormat((d) => seriesData.find((item) => item.x === +d)?.label ?? this.tickFormat(0)(d));

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.x.axis')
            .data([0])
            .join('g')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');
        xAxisSelection.call(xAxis);
        xAxisSelection.selectAll<SVGTextElement, unknown>('.tick text')
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
            .tickFormat(this.tickFormat(1));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.y.axis')
            .data([0])
            .join('g')
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

        // ---- Overlay (page-drawn marks behind the lines)
        svg
            .selectAll('.autkOverlay')
            .data([0])
            .join('g')
            .attr('class', 'autkOverlay')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('pointer-events', 'none');
        this.drawOverlay();

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

        // A group's line takes the group's color (as `attributes.color` and `categoryColors` give it to the group's marks).
        const lineColor = (group: string) => (group === '' ? '#4472c4' : this.getMarkColor({ group }));
        cGroup
            .selectAll<SVGPathElement, [string, Array<{ x: number; y: number }>]>('.autk-line')
            .data([...lines])
            .join('path')
            .attr('class', 'autk-line')
            .attr('fill', 'none')
            .attr('stroke', ([group]) => lineColor(group))
            .attr('stroke-width', 1.5)
            .attr('d', ([, points]) => lineGen(points));

        // ---- Dots (marks)
        cGroup
            .selectAll('.autkMark')
            .data(seriesData)
            .join('circle')
            .attr('class', 'autkMark')
            .attr('cx', (d) => xScale(d.x))
            .attr('cy', (d) => yScale(d.y))
            .attr('r', 5)
            .style('fill', d => this.getMarkColor(d))
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
     * A bucket reads as it is written (2020, not 2.02k), unless the configuration's
     * tickFormats give the x axis a format, which then writes a numeric bucket.
     *
     * @param bucket Raw bucket label from the transform result.
     * @returns Display label used on the x axis.
     */
    private formatBucketLabel(bucket: string): string {
        const numericBucket = Number(bucket);
        if (this.hasTickFormat(0) && Number.isFinite(numericBucket) && String(numericBucket) === bucket) {
            return this.tickFormat(0)(numericBucket);
        }
        return bucket;
    }

    /**
     * Reads a timestamp bucket key as the date and time written in it, whatever the page's time zone: a key with no
     * zone is taken as UTC (binning-events writes its keys in UTC, "2024-03-05 14:00"), so its label, written in UTC,
     * shows the day and hour of the key.
     *
     * @param bucket Raw bucket key from the transform result.
     * @returns The key's instant; an invalid date when the key is not a timestamp.
     */
    private bucketTime(bucket: string): Date {
        const iso = bucket.replace(' ', 'T');
        const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
        return new Date(iso.includes('T') && !zoned ? `${iso}Z` : iso);
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
