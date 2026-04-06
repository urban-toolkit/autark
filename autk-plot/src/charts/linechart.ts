import * as d3 from 'd3';
import { ChartBase } from '../chart-base';
import type { AutkDatum, ChartConfig } from '../api';
import { run } from '../transforms';
import { ChartEvent } from '../events-types';



/**
 * Line chart that aggregates feature-level timeseries into a single series.
 *
 * Rendering rows are generated through shared transform presets and each point
 * preserves provenance via `autkIds`.
 */
export class Linechart extends ChartBase {

    private _startYear: number;
    private _seriesData: Array<{ x: number; label: string; y: number; autkIds: number[] }> = [];

    /**
     * Creates a line chart instance and renders the initial state.
     * @param config Linechart configuration.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.BRUSH_Y]; }
        if (config.tickFormats === undefined) { config.tickFormats = ['~s', '~s']; }
        if (!config.attributes) {
            config.attributes = [];
        } else {
            config.attributes = config.attributes.filter((attr) => typeof attr === 'string');
        }
        if (!config.transform) {
            config.transform = {
                preset: 'timeseries',
                attributes: {
                    series: config.attributes[0] ?? '',
                    timestamp: 'timestamp',
                    value: 'value',
                },
                options: { reducer: 'avg' },
            };
            const axis = config.labels?.axis ?? [config.transform.preset === 'timeseries' ? 'time' : 'bucket', 'value'];
            const title = config.labels?.title ?? (config.transform.preset === 'timeseries' ? 'Timeseries' : 'Temporal events');
            config.labels = { axis, title };
        }

        super(config);

        this._startYear = config.startYear ?? 0;

        this.draw();
    }

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
        };

        const selected = new Set(this.selection);
        const allRows = this._sourceFeatures.map((f, idx) => ({
            ...(f.properties ?? {}),
            autkIds: [idx],
        })) as AutkDatum[];
        const sourceRows = this.selection.length === 0
            ? allRows
            : allRows.filter((row) => (row.autkIds ?? []).some((id) => selected.has(id)));

        if (!this._transformConfig) {
            throw new Error('Linechart requires a transform configuration.');
        }

        const transformed = run(sourceRows, this._transformConfig);
        if (transformed.preset === 'histogram') {
            throw new Error('Linechart does not support the histogram transform preset.');
        }

        const reducedSeries = [...transformed.rows].sort((a, b) => compareBuckets(a.bucket, b.bucket));
        this._seriesData = reducedSeries.map((item, idx) => ({
            x: idx,
            label: formatBucketLabel(item.bucket),
            y: item.value,
            autkIds: item.autkIds,
        }));
    }

    /**
     * Draws the aggregated line for all rows or the currently selected subset.
     */
    public render(): void {
        const innerW = this._width  - this._margins.left - this._margins.right;
        const innerH = this._height - this._margins.top  - this._margins.bottom;

        // ---- SVG shell
        const svg = d3
            .select(this._div)
            .selectAll<SVGSVGElement, number>('#plot')
            .data([0])
            .join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

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
}
