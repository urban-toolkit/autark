import * as d3 from 'd3';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { valueAtPath } from 'autk-core';

import { BaseChart } from '../base-chart';
import type { ChartConfig } from '../api';

/**
 * Configuration for the linechart implementation.
 *
 * Attributes are interpreted as:
 * 1) timeseries array path
 * 2) optional regression angle path
 * 3) optional regression intercept path
 */
export type LinechartConfig = {
    div: HTMLElement;
    collection: FeatureCollection<Geometry, GeoJsonProperties>;
    /**
     * Attribute paths (nested dot-notation) in order:
     *   [0] timeseries array  (required)
     *   [1] regression angle in degrees — atan(slope)*180/π  (optional)
     *   [2] regression intercept                              (optional)
     */
    attributes: [string, string?, string?];
    labels?: { axis?: [string, string]; title?: string };
    tickFormats?: [string, string]; // [x-axis format, y-axis format]
    width?: number;
    height?: number;
    margins?: { left: number; right: number; top: number; bottom: number };
    startYear?: number;
};

/**
 * Line chart that shows a timeseries stored in a GeoJSON feature property,
 * optionally overlaid with an OLS regression line.
 *
 * Usage:
 *   const chart = new Linechart({ div, data: geojson, attributes: ['lst_timeseries', 'compute.angle', 'compute.intercept'], startYear: 2001 });
 *   chart.setSelection([42]);         // show feature 42
 *   chart.setSelection([]);           // clear to empty state
 */
export class Linechart extends BaseChart {
    private _startYear: number;

    /**
     * Creates a line chart instance and renders the initial state.
     * @param config Linechart configuration.
     */
    constructor(config: LinechartConfig) {
        const attributes = config.attributes.filter((attr): attr is string => typeof attr === 'string');

        const chartConfig: ChartConfig = {
            div: config.div,
            collection: config.collection,
            attributes,
            labels: {
                axis: [config.labels?.axis?.[0] ?? 'Year', config.labels?.axis?.[1] ?? 'Value'],
                title: config.labels?.title ?? '',
            },
            tickFormats: config.tickFormats ? [...config.tickFormats] : ['.0f', '.1f'],
            width: config.width ?? 600,
            height: config.height ?? 280,
            margins: config.margins ?? { left: 52, right: 20, top: 42, bottom: 44 },
            events: [],
        };

        super(chartConfig);

        this._startYear = config.startYear ?? 0;

        this.draw();
    }

    /** Re-renders line content based on current selected feature id. */
    public updateChartSelection(): void {
        this.render();
    }

    /**
     * Draws the chart for the selected feature, or empty state when selection is empty.
     */
    public render(): void {
        const featureId = this.selection.length > 0 ? this.selection[0] : null;
        const props = featureId !== null ? this.data[featureId] : null;

        const timeseries: number[] | null = props
            ? (valueAtPath(props, this._attributes[0]) as number[] | undefined) ?? null
            : null;

        const angleDeg: number | null =
            this._attributes[1] && props
                ? (valueAtPath(props, this._attributes[1]) as number | undefined) ?? null
                : null;

        const intercept: number | null =
            this._attributes[2] && props
                ? (valueAtPath(props, this._attributes[2]) as number | undefined) ?? null
                : null;

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
        const n = timeseries?.length ?? 24;

        const allY = timeseries ?? [];
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
                    .tickFormat(d => d3.format(this._tickFormats[0])(this._startYear + +d))
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

        // ── Legend ───────────────────────────────────────────────────────────
        const legendItems = [
            { color: '#4472c4', dash: '',    label: 'Observed LST' },
            { color: '#e04444', dash: '5,3', label: 'Regression'   },
        ];
        const legendX = innerW - 120;
        const legendBaseY = -this._margins.top * 0.2 + 6;
        legendItems.forEach((item, i) => {
            const ly = legendBaseY + i * 16;
            g.append('line')
                .attr('x1', legendX).attr('y1', ly)
                .attr('x2', legendX + 18).attr('y2', ly)
                .attr('stroke', item.color)
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', item.dash || null);
            g.append('text')
                .attr('x', legendX + 23).attr('y', ly + 4)
                .style('font-size', '10px')
                .style('font-family', 'system-ui, sans-serif')
                .text(item.label);
        });

        // ── Empty state — no data yet ─────────────────────────────────────
        if (!timeseries || timeseries.length === 0) {
            g.append('text')
                .attr('x', innerW / 2)
                .attr('y', innerH / 2)
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .style('fill', '#aaa')
                .style('font-family', 'system-ui, sans-serif')
                .text('Pick a road segment to see its LST timeseries');
            return;
        }

        // ── Observed timeseries ───────────────────────────────────────────
        const observed = timeseries.map((v, i) => ({ x: i, y: v }));
        const lineGen = d3.line<{ x: number; y: number }>()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y));

        g.append('path')
            .datum(observed)
            .attr('fill', 'none')
            .attr('stroke', '#4472c4')
            .attr('stroke-width', 1.5)
            .attr('d', lineGen);

        g.selectAll('.obs-dot')
            .data(observed)
            .join('circle')
            .attr('class', 'obs-dot')
            .attr('cx', d => xScale(d.x))
            .attr('cy', d => yScale(d.y))
            .attr('r', 3)
            .attr('fill', '#4472c4');

        // ── Regression line (only when both parameters are present) ────────
        if (angleDeg !== null && intercept !== null) {
            const slope = Math.tan(angleDeg * (Math.PI / 180));
            const regLine = [
                { x: 0,     y: intercept },
                { x: n - 1, y: intercept + slope * (n - 1) },
            ];
            g.append('path')
                .datum(regLine)
                .attr('fill', 'none')
                .attr('stroke', '#e04444')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '5,3')
                .attr('d', lineGen);
        }
    }
}
