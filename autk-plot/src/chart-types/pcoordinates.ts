import * as d3 from "d3";

import { ChartD3 } from "../chart-d3";
import type { ChartConfig } from "../api";
import { ChartStyle } from "../chart-style";
import { ChartEvent } from "../events-types";
import { ColorMap } from '../core-types';

/**
 * Parallel coordinates chart for multivariate feature exploration.
 *
 * Supports mixed numeric/categorical dimensions and multi-axis brushing.
 */
export class ParallelCoordinates extends ChartD3 {

    protected scales: Map<string, d3.ScaleLinear<number, number> | d3.ScalePoint<string>> = new Map();
    protected axisPositions: d3.ScalePoint<string>;
    protected dimensionTypes: Map<string, 'categorical' | 'numerical'> = new Map();
    protected colorDimension: string | null = null;

    /**
     * Creates a parallel coordinates chart and performs the initial draw.
     * @param config Plot configuration for parallel coordinates rendering.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        super(config);

        this.axisPositions = d3.scalePoint();
        this.draw();
    }

    /**
     * Renders axes, paths, labels, and interaction layers.
     * @returns Promise resolved when chart nodes are synchronized.
     */
    public async render(): Promise<void> {
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

        // ---- Chart size
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title (optional)
        if (this._title && this._title.length > 0) {
            svg
                .selectAll<SVGTextElement, string>('#plotTitle')
                .data([this._title])
                .join('text')
                .attr('id', 'plotTitle')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + width / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text((d) => d);
        }

        // ---- Scales for each dimension
        const dimensions = this._attributes;

        // Build a scale for each dimension based on data type
        dimensions.forEach((dim) => {
            // Check if dimension is categorical or numerical
            const sampleValues = this.data.map(d => d ? this.getNestedValue(d, dim) : null).filter(v => v !== null && v !== undefined);
            const isNumerical = sampleValues.every(v => !isNaN(Number(v)));

            if (isNumerical) {
                // Numerical scale
                this.dimensionTypes.set(dim, 'numerical');
                const extent = d3.extent(this.data, (d) => d ? +this.getNestedValue(d, dim) || 0 : 0) as [number, number];
                this.scales.set(dim, d3.scaleLinear().domain(extent).range([height, 0]));
            } else {
                // Categorical scale
                this.dimensionTypes.set(dim, 'categorical');
                const uniqueValues = Array.from(new Set(this.data.map(d => d ? String(this.getNestedValue(d, dim)) : 'unknown')));
                this.scales.set(dim, d3.scalePoint<string>().domain(uniqueValues).range([height, 0]).padding(0.5));
            }
        });

        // Position scale for axes
        this.axisPositions = d3.scalePoint()
            .domain(dimensions)
            .range([0, width])
            .padding(0.1);


        // ---- Foreground group for lines (for interaction)
        const foreground = svg
            .selectAll('.autkMarksGroup')
            .data([0])
            .join('g')
            .attr('class', 'autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);


        // ---- Draw foreground lines (interactive)
        foreground
            .selectAll('.autkMark')
            .data(this.data)
            .join('path')
            .attr('class', 'autkMark')
            .attr('data-idx', (_d, i) => i)
            .attr('d', (d) => this.path(d))
            .style('fill', 'none')
            .style('stroke', ChartStyle.default)
            .style('stroke-width', 2)
            .style('opacity', 0.7)
            .style('visibility', 'inherit');

        // ---- Draw axes
        const axisGroups = svg
            .selectAll('.autkBrushable')
            .data(dimensions)
            .join('g')
            .attr('class', 'autkBrushable')
            .attr('transform', (d) => `translate(${this._margins.left + (this.axisPositions(d) || 0)}, ${this._margins.top})`)
            .style('visibility', 'inherit');

        // Store dimension name for selection
        axisGroups.attr('data-dim', (d) => d);

        // Add axis lines and ticks
        axisGroups.each((dim, i, nodes) => {
            const scale = this.scales.get(dim);
            const dimType = this.dimensionTypes.get(dim);

            if (scale && dimType === 'numerical') {
                d3.select(nodes[i]).call(d3.axisLeft(scale as d3.ScaleLinear<number, number>).ticks(5) as any);
            } else if (scale && dimType === 'categorical') {
                d3.select(nodes[i]).call(d3.axisLeft(scale as d3.ScalePoint<string>) as any);
            }
        });

        // ---- Add clear area for deselection
        foreground
            .selectAll('.autkClear')
            .data([0])
            .join('rect')
            .attr('class', 'autkClear')
            .attr('x', -this._margins.left)
            .attr('y', -this._margins.top)
            .attr('width', this._width)
            .attr('height', this._height)
            .style('fill', 'transparent')
            .style('visibility', 'visible')
            .lower();

        this.configureSignalListeners();

        // ---- Axis labels in a separate top-level group so they always render
        // above brush overlay rects (which are re-appended on every brush event)
        svg
            .selectAll('.autkAxisLabels')
            .data([0])
            .join('g')
            .attr('class', 'autkAxisLabels')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .selectAll<SVGTextElement, string>('.axis-label')
            .data(dimensions)
            .join('text')
            .attr('class', 'axis-label')
            .attr('text-anchor', 'middle')
            .attr('x', (d) => this.axisPositions(d) || 0)
            .attr('y', -9)
            .style('font-weight', '600')
            .style('cursor', 'pointer')
            .style('visibility', 'visible')
            .text((_d, i) => this._axis[i] ?? _d)
            .on('click', (_event, dim) => {
                this.colorDimension = this.colorDimension === dim ? null : dim;
                this.updateAxisLabelStyles();
                this.updateChartSelection();
            });
    }

    /**
     * Re-applies line style based on current selection and color dimension.
     * @returns Nothing. Updates SVG styles in place.
     */
    public updateChartSelection(): void {
        const lines = d3.select(this._div).selectAll<SVGPathElement, unknown>('.autkMark');
        const sel = this.selection;

        // Read the stable original index from the data-idx attribute, not the DOM position
        // (DOM order changes after .raise(), so the id parameter cannot be trusted here).
        const idx = (node: SVGPathElement) => +(d3.select(node).attr('data-idx') ?? -1);

        let strokeFn: (this: SVGPathElement, d: unknown) => string;

        if (this.colorDimension) {
            const dim = this.colorDimension;
            const scale = this.scales.get(dim);
            const dimType = this.dimensionTypes.get(dim);

            const chart = this;
            if (dimType === 'numerical' && scale) {
                const dimValues = chart.data.map(d => d ? +chart.getNestedValue(d, dim) || 0 : 0);
                const lo = chart._domain?.[0] ?? dimValues.reduce((a, b) => Math.min(a, b), Infinity);
                const hi = chart._domain?.[1] ?? dimValues.reduce((a, b) => Math.max(a, b), -Infinity);
                strokeFn = function (this: SVGPathElement, d: unknown) {
                    if (sel.includes(idx(this))) return ChartStyle.highlight;
                    const v = +chart.getNestedValue(d, dim) || 0;
                    const { r, g, b } = ColorMap.getColor(v, chart._colorMapInterpolator, [lo, hi]);
                    return `rgb(${r},${g},${b})`;
                };
            } else if (dimType === 'categorical' && scale) {
                const catScale = scale as d3.ScalePoint<string>;
                const categories = catScale.domain();
                strokeFn = function (this: SVGPathElement, d: unknown) {
                    if (sel.includes(idx(this))) return ChartStyle.highlight;
                    const val = String(chart.getNestedValue(d, dim));
                    const i = categories.indexOf(val);
                    const t = categories.length <= 1 ? 0.5 : i / (categories.length - 1);
                    const { r, g, b } = ColorMap.getColor(t, chart._colorMapInterpolator);
                    return `rgb(${r},${g},${b})`;
                };
            } else {
                strokeFn = function (this: SVGPathElement) {
                    return sel.includes(idx(this)) ? ChartStyle.highlight : ChartStyle.default;
                };
            }
        } else {
            strokeFn = function (this: SVGPathElement) {
                return sel.includes(idx(this)) ? ChartStyle.highlight : ChartStyle.default;
            };
        }

        lines
            .style('stroke', strokeFn)
            .style('opacity', function (this: SVGPathElement) { return sel.includes(idx(this)) ? 1 : 0.7; })
            .style('stroke-width', function (this: SVGPathElement) { return sel.includes(idx(this)) ? 3 : 2; });

        lines.filter(function (this: SVGPathElement) { return sel.includes(idx(this)); }).raise();
    }

    /**
     * Updates axis label style to reflect the active color dimension.
     * @returns Nothing. Updates label styles in place.
     */
    protected updateAxisLabelStyles(): void {
        d3.select(this._div).selectAll<SVGTextElement, string>('.axis-label')
            .style('fill', (dim) => { if (this.colorDimension !== dim) return '#000'; const { r, g, b } = ColorMap.getColor(0.7, this._colorMapInterpolator); return `rgb(${r},${g},${b})`; })
            .style('text-decoration', (dim) => this.colorDimension === dim ? 'underline' : 'none');
    }

    /**
     * Enables per-axis vertical brushing and emits source feature indices.
     * @returns Nothing. Registers brush handlers for each axis.
     */
    public brushYEvent(): void {
        const brushable = d3.selectAll<SVGGElement, string>('.autkBrushable');
        const chart = this;

        // Store active brushes extents (min/max Y values per dimension)
        const activeBrushes = new Map<string, [number, number]>();

        const brushHeight = chart._height - chart._margins.top - chart._margins.bottom;

        brushable.each(function () {
            const cBrush = d3.select<SVGGElement, unknown>(this);
            const dim = cBrush.attr('data-dim') as string;

            const brush = d3.brushY()
                .extent([[-15, 0], [15, brushHeight]])
                .on("start brush end", function (event: any) {
                    if (event.selection) {
                        activeBrushes.set(dim, event.selection);
                    } else {
                        activeBrushes.delete(dim);
                    }

                    if (activeBrushes.size === 0) {
                        chart.selection = [];
                        chart.events.emit(ChartEvent.BRUSH_Y, { selection: [] });
                        chart.updateChartSelection();
                        return;
                    }

                    const nextSel = new Set<number>();

                    // For each data point check if it intersects ALL active brushes
                    chart.data.forEach((d, id) => {
                        let isSelected = true;

                        for (const [activeDim, brushExtent] of activeBrushes) {
                            const scale = chart.scales.get(activeDim);
                            const dimType = chart.dimensionTypes.get(activeDim);

                            let y = 0;
                            if (scale && dimType === 'numerical') {
                                const numScale = scale as d3.ScaleLinear<number, number>;
                                y = numScale(+chart.getNestedValue(d, activeDim) || 0);
                            } else if (scale && dimType === 'categorical') {
                                const catScale = scale as d3.ScalePoint<string>;
                                y = catScale(String(chart.getNestedValue(d, activeDim))) ?? 0;
                            }

                            // If y is outside the brush extent for THIS dimension, line is not selected
                            if (y < brushExtent[0] || y > brushExtent[1]) {
                                isSelected = false;
                                break;
                            }
                        }

                        if (isSelected) {
                            nextSel.add(id);
                        }
                    });

                    chart.selection = Array.from(nextSel);
                    chart.events.emit(ChartEvent.BRUSH_Y, { selection: chart.getSelectedSourceIndices() });
                    chart.updateChartSelection();
                });

            cBrush.call(brush);
        });
    }

    /**
     * Generates the polyline path through all configured dimensions.
     * @param d Render row object.
     * @returns SVG path string for the row.
     */
    protected path(d: any): string {
        const dimensions = this._attributes;
        const lineGenerator = d3.line<[number, number]>();
        const points: [number, number][] = dimensions.map((dim) => {
            const x = this.axisPositions(dim) || 0;
            const scale = this.scales.get(dim);
            const dimType = this.dimensionTypes.get(dim);

            let y = 0;
            if (scale && dimType === 'numerical') {
                const numScale = scale as d3.ScaleLinear<number, number>;
                y = numScale(+this.getNestedValue(d, dim) || 0);
            } else if (scale && dimType === 'categorical') {
                const catScale = scale as d3.ScalePoint<string>;
                y = catScale(String(this.getNestedValue(d, dim))) ?? 0;
            }

            return [x, y];
        });
        return lineGenerator(points) || '';
    }
}
