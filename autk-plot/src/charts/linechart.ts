import * as d3 from 'd3';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { BaseChart } from '../base-chart';
import type { AutkDatum, ChartConfig, ChartTransformConfig } from '../api';
import { executeTransform } from '../transforms/execute-transform';

/**
 * Configuration for the linechart implementation.
 *
 * Attributes are interpreted as:
 * 1) timeseries path
 */
export type LinechartConfig = {
    div: HTMLElement;
    collection: FeatureCollection<Geometry, GeoJsonProperties>;
    /** Attribute paths (nested dot-notation), where [0] is the timeseries path in legacy mode. */
    attributes?: [string, string?, string?];
    transform?: ChartTransformConfig;
    labels?: { axis?: [string, string]; title?: string };
    tickFormats?: [string, string]; // [x-axis format, y-axis format]
    width?: number;
    height?: number;
    margins?: { left: number; right: number; top: number; bottom: number };
    startYear?: number;
};

/**
 * Line chart that aggregates feature-level timeseries into a single series.
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends BaseChart {
    private _startYear: number;
    private _seriesData: Array<{ x: number; label: string; y: number; autkIds: number[] }> = [];
    private _transformConfig?: ChartTransformConfig;

    /**
     * Creates a line chart instance and renders the initial state.
     * @param config Linechart configuration.
     */
    constructor(config: LinechartConfig) {
        const attributes = (config.attributes ?? []).reduce<string[]>((acc, attr) => {
            if (typeof attr === 'string') {
                acc.push(attr);
            }
            return acc;
        }, []);
        const labels = config.transform
            ? Linechart.applyTransformLabelDefaults(config.labels, config.transform)
            : config.labels;

        const chartConfig: ChartConfig = {
            div: config.div,
            collection: config.collection,
            attributes,
            transform: config.transform,
            labels: {
                axis: [labels?.axis?.[0] ?? 'Year', labels?.axis?.[1] ?? 'Value'],
                title: labels?.title ?? '',
            },
            tickFormats: config.tickFormats ? [...config.tickFormats] : ['.0f', '.1f'],
            width: config.width ?? 600,
            height: config.height ?? 280,
            margins: config.margins ?? { left: 52, right: 20, top: 42, bottom: 44 },
            events: [],
        };

        super(chartConfig);

        this._startYear = config.startYear ?? 0;
        this._transformConfig = config.transform;

        this.draw();
    }

    protected override computeTransform(): void {
        const selected = new Set(this.selection);
        const allRows = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
        const sourceRows = this.selection.length === 0
            ? allRows
            : allRows.filter((row) => this.getDatumAutkIds(row).some((id) => selected.has(id)));

        if (this._transformConfig) {
            const transformed = executeTransform(sourceRows, this._transformConfig);
            if (transformed.preset === 'histogram') {
                throw new Error('Linechart does not support the histogram transform preset.');
            }

            const reducedSeries = [...transformed.rows].sort((a, b) => this.compareBuckets(a.bucket, b.bucket));
            this._seriesData = reducedSeries.map((item, idx) => ({
                x: idx,
                label: this.formatBucketLabel(item.bucket),
                y: item.value,
                autkIds: item.autkIds,
            }));
            return;
        }

        const reducedSeries = this.getLegacyTimeseriesRows(sourceRows);
        this._seriesData = reducedSeries.map((item, idx) => ({
            x: idx,
            label: this.formatBucketLabel(item.bucket),
            y: item.value,
            autkIds: item.autkIds,
        }));
    }

    /** Recomputes series rows and redraws the chart. */
    public updateChartSelection(): void {
        this.draw();
    }

    /**
     * Draws the aggregated line for all rows or the currently selected subset.
     */
    public render(): void {
        const innerW = this._width  - this._margins.left - this._margins.right;
        const innerH = this._height - this._margins.top  - this._margins.bottom;

        // ── SVG shell (create once, clear contents each redraw) ──────────────
        const container = d3.select(this._div);
        let svg = container.select<SVGSVGElement>('#linechart');
        if (svg.empty()) {
            svg = container
                .append('svg')
                .attr('id', 'linechart')
                .attr('width', this._width)
                .attr('height', this._height);
        }
        svg.selectAll('*').remove();

        // ── Scales ──────────────────────────────────────────────────────────
        const n = Math.max(this._seriesData.length, 1);

        const allY = this._seriesData.map((item) => item.y);
        const yMin = allY.length > 0 ? Math.min(...allY) : 0;
        const yMax = allY.length > 0 ? Math.max(...allY) : 50;
        const yPad = (yMax - yMin) * 0.1 || 1;

        const xScale = d3.scaleLinear().domain([0, n - 1]).range([0, innerW]);
        const yScale = d3.scaleLinear()
            .domain([yMin - yPad, yMax + yPad])
            .range([innerH, 0]);

        const g = svg
            .append('g')
            .attr('transform', `translate(${this._margins.left},${this._margins.top})`);

        // ── Title ────────────────────────────────────────────────────────────
        if (this._title) {
            svg.append('text')
                .attr('x', this._margins.left + innerW / 2)
                .attr('y', Math.max(this._margins.top * 0.65, 13))
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .style('font-weight', '600')
                .style('font-family', 'system-ui, sans-serif')
                .text(this._title);
        }

        // ── Grid lines ───────────────────────────────────────────────────────
        const gridG = g.append('g').attr('class', 'grid');
        gridG.call(
            d3.axisLeft(yScale)
                .tickSize(-innerW)
                .tickFormat(() => '')
        );
        gridG.selectAll('line').style('stroke', '#e0e0e0');
        gridG.select('.domain').remove();

        // ── X axis ───────────────────────────────────────────────────────────
        const xAxisG = g.append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(
                d3.axisBottom(xScale)
                    .ticks(Math.min(n, 12))
                    .tickFormat(d => this._seriesData[+d]?.label ?? d3.format(this._tickFormats[0])(this._startYear + +d))
            );
        xAxisG.selectAll<SVGTextElement, unknown>('text')
            .style('font-size', '11px')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.4em')
            .attr('dy', '0.4em');

        // X label.
        xAxisG.append('text')
            .attr('x', innerW / 2)
            .attr('y', this._margins.bottom - 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('font-family', 'system-ui, sans-serif')
            .style('fill', '#555')
            .text(this._axis[0]);

        // ── Y axis ───────────────────────────────────────────────────────────
        g.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(this._tickFormats[1])))
            .selectAll<SVGTextElement, unknown>('text')
            .style('font-size', '11px');

        // Y label.
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left + 14)
            .attr('x', -innerH / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('font-family', 'system-ui, sans-serif')
            .style('fill', '#555')
            .text(this._axis[1]);

        // ── Empty state — no data yet ─────────────────────────────────────
        if (this._seriesData.length === 0) {
            g.append('text')
                .attr('x', innerW / 2)
                .attr('y', innerH / 2)
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .style('fill', '#aaa')
                .style('font-family', 'system-ui, sans-serif')
                .text('No timeseries data for the current selection');
            return;
        }

        // ── Aggregated timeseries ─────────────────────────────────────────
        const lineGen = d3.line<{ x: number; y: number; autkIds: number[] }>()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y));

        g.append('path')
            .datum(this._seriesData)
            .attr('fill', 'none')
            .attr('stroke', '#4472c4')
            .attr('stroke-width', 1.5)
            .attr('d', lineGen);

        g.selectAll('.agg-dot')
            .data(this._seriesData)
            .join('circle')
            .attr('class', 'agg-dot')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.y))
            .attr('r', 3)
            .attr('fill', '#4472c4');
    }

    private getLegacyTimeseriesRows(rows: AutkDatum[]) {
        const reducedSeries = executeTransform(rows, {
            preset: 'timeseries',
            attributes: {
                series: this._attributes[0],
            },
            options: {
                reducer: 'avg',
            },
        });

        if (reducedSeries.preset === 'histogram') {
            return [];
        }

        return [...reducedSeries.rows].sort((a, b) => this.compareBuckets(a.bucket, b.bucket));
    }

    private formatBucketLabel(bucket: string): string {
        const numericBucket = Number(bucket);
        if (this._startYear > 0 && Number.isFinite(numericBucket) && String(numericBucket) === bucket) {
            return String(this._startYear + numericBucket);
        }

        return bucket;
    }

    private static applyTransformLabelDefaults(
        labels: LinechartConfig['labels'],
        transform: ChartTransformConfig
    ): NonNullable<LinechartConfig['labels']> {
        const axis = labels?.axis ?? [transform.preset === 'timeseries' ? 'time' : 'bucket', 'value'];
        const title = labels?.title ?? (transform.preset === 'timeseries' ? 'Timeseries' : 'Temporal events');

        return { axis, title };
    }

    private compareBuckets(a: string, b: string): number {
        const dateA = new Date(a);
        const dateB = new Date(b);
        const validDateA = Number.isFinite(dateA.getTime());
        const validDateB = Number.isFinite(dateB.getTime());

        if (validDateA && validDateB) {
            return dateA.getTime() - dateB.getTime();
        }

        const numA = Number(a);
        const numB = Number(b);
        const validNumA = Number.isFinite(numA);
        const validNumB = Number.isFinite(numB);

        if (validNumA && validNumB) {
            return numA - numB;
        }

        return a.localeCompare(b);
    }
}
