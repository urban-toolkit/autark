/**
 * @fileoverview Parallel coordinates chart for multivariate feature exploration.
 *
 * Provides a D3-based parallel coordinates implementation with the following features:
 * - **Multidimensional rendering**: Visualizes each feature as a polyline across multiple axes
 * - **Mixed data types**: Supports both numeric and categorical dimensions with automatic scale detection
 * - **Multi-axis brushing and selection**: Enables brushing on any axis for interactive filtering and linked selection
 * - **Color-by-dimension**: Clickable axis labels allow coloring lines by any dimension (numeric or categorical)
 * - **Customizable axes and labels**: Axis/attribute mapping for flexible dimension selection and labeling
 *
 * @example
 * // Basic parallel coordinates chart
 * const plot = new AutkChart(plotDiv, {
 *   type: 'parallel-coordinates',
 *   collection: geojson,
 *   attributes: ['attr1', 'attr2', 'attr3'],
 *   labels: { axis: ['A', 'B', 'C'], title: 'Parallel Coordinates' }
 * });
 *
 * @example
 * // Parallel coordinates with color-by-dimension and brushing
 * const plot = new AutkChart(plotDiv, {
 *   type: 'parallel-coordinates',
 *   collection: geojson,
 *   events: [ChartEvent.BRUSH_X, ChartEvent.BRUSH_Y],
 *   attributes: ['height', 'type', 'value'],
 *   labels: { axis: ['Height', 'Type', 'Value'], title: 'Multivariate Exploration' }
 * });
 */
import * as d3 from 'd3';

import { valueAtPath, ColorMap } from '../core-types';

import type { AutkDatum, ChartConfig } from '../api';

import { ChartBase } from '../chart-base';
import { ChartStyle } from '../chart-style';
import { ChartEvent } from '../events-types';

/**
 * Parallel coordinates chart for multivariate feature exploration.
 *
 * Supports mixed numeric/categorical dimensions and multi-axis brushing.
 */
export class ParallelCoordinates extends ChartBase {

    /** Per-dimension scales: linear for numerical dimensions, point for categorical ones. */
    protected scales: Map<string, d3.ScaleLinear<number, number> | d3.ScalePoint<string>> = new Map();
    /** Point scale that maps each dimension name to its horizontal axis position. */
    protected axisPositions: d3.ScalePoint<string>;
    /** Detected type for each dimension: `'numerical'` or `'categorical'`. */
    protected dimensionTypes: Map<string, 'categorical' | 'numerical'> = new Map();
    /** Dimension currently used for color encoding, or `null` when coloring is inactive. */
    protected colorDimension: string | null = null;

    /**
     * Creates a parallel coordinates chart and performs the initial draw.
     * @param config Plot configuration for parallel coordinates rendering.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.tickFormats === undefined) {
            config.tickFormats = ['~s', '~s'];
        }
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
            const sampleValues = this.data.map(d => d ? valueAtPath(d, dim) : null).filter(v => v !== null && v !== undefined);
            const isNumerical = sampleValues.every(v => !isNaN(Number(v)));

            if (isNumerical) {
                // Numerical scale
                this.dimensionTypes.set(dim, 'numerical');
                const extent = d3.extent(this.data, (d) => d ? Number(valueAtPath(d, dim)) || 0 : 0) as [number, number];
                this.scales.set(dim, d3.scaleLinear().domain(extent).range([height, 0]));
            } else {
                // Categorical scale
                this.dimensionTypes.set(dim, 'categorical');
                const uniqueValues = Array.from(new Set(this.data.map(d => d ? String(valueAtPath(d, dim)) : 'unknown')));
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
            .style('visibility', 'visible');

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
            .selectAll('.autkBrush')
            .data(dimensions)
            .join('g')
            .attr('class', 'autkBrush')
            .attr('transform', (d) => `translate(${this._margins.left + (this.axisPositions(d) || 0)}, ${this._margins.top})`)
            .style('visibility', 'inherit');

        // Store dimension name for selection
        axisGroups.attr('autkBrushId', (d) => d);

        // Add axis lines and ticks
        axisGroups.each((dim, i, nodes) => {
            const scale = this.scales.get(dim);
            const dimType = this.dimensionTypes.get(dim);

            if (scale && dimType === 'numerical') {
                d3.select(nodes[i]).call(
                    d3.axisLeft(scale as d3.ScaleLinear<number, number>)
                        .ticks(5)
                        .tickFormat((value) => d3.format(this._tickFormats[0] || '~s')(Number(value))) as any
                );
            } else if (scale && dimType === 'categorical') {
                d3.select(nodes[i]).call(d3.axisLeft(scale as d3.ScalePoint<string>) as any);
            }
        });

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
                this.applyChartSelection();
            });
    }

    /**
     * Applies stroke-based selection styles with optional color-by-dimension mapping.
     */
    protected override applyMarkStyles(svgs: d3.Selection<d3.BaseType, unknown, HTMLElement, unknown>): void {
        const lines = svgs as unknown as d3.Selection<SVGPathElement, unknown, HTMLElement, unknown>;
        const chart = this;
        const sel = this.selection;
        const isSelected = (d: unknown) => ((d as AutkDatum)?.autkIds ?? []).some((id) => sel.includes(id));

        let strokeFn: (this: SVGPathElement, d: unknown) => string;

        if (this.colorDimension) {
            const dim = this.colorDimension;
            const scale = this.scales.get(dim);
            const dimType = this.dimensionTypes.get(dim);

            if (dimType === 'numerical' && scale) {
                const dimValues = chart.data.map(d => d ? Number(valueAtPath(d, dim)) || 0 : 0);
                const lo = chart._domain?.[0] ?? dimValues.reduce((a, b) => Math.min(a, b), Infinity);
                const hi = chart._domain?.[1] ?? dimValues.reduce((a, b) => Math.max(a, b), -Infinity);
                strokeFn = function (this: SVGPathElement, d: unknown) {
                    if (isSelected(d)) return ChartStyle.highlight;
                    const v = Number(valueAtPath(d, dim)) || 0;
                    const { r, g, b } = ColorMap.getColor(v, chart._colorMapInterpolator, [lo, hi]);
                    return `rgb(${r},${g},${b})`;
                };
            } else if (dimType === 'categorical' && scale) {
                const catScale = scale as d3.ScalePoint<string>;
                const categories = catScale.domain();
                strokeFn = function (this: SVGPathElement, d: unknown) {
                    if (isSelected(d)) return ChartStyle.highlight;
                    const val = String(valueAtPath(d, dim));
                    const i = categories.indexOf(val);
                    const t = categories.length <= 1 ? 0.5 : i / (categories.length - 1);
                    const { r, g, b } = ColorMap.getColor(t, chart._colorMapInterpolator);
                    return `rgb(${r},${g},${b})`;
                };
            } else {
                strokeFn = function (this: SVGPathElement, d: unknown) {
                    return isSelected(d) ? ChartStyle.highlight : ChartStyle.default;
                };
            }
        } else {
            strokeFn = function (this: SVGPathElement, d: unknown) {
                return isSelected(d) ? ChartStyle.highlight : ChartStyle.default;
            };
        }

        lines
            .style('stroke', strokeFn)
            .style('opacity', function (this: SVGPathElement, d: unknown) { return isSelected(d) ? 1 : 0.7; })
            .style('stroke-width', function (this: SVGPathElement, d: unknown) { return isSelected(d) ? 3 : 2; });

        lines.filter(function (this: SVGPathElement, d: unknown) { return isSelected(d); }).raise();
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
                y = numScale(Number(valueAtPath(d, dim)) || 0);
            } else if (scale && dimType === 'categorical') {
                const catScale = scale as d3.ScalePoint<string>;
                y = catScale(String(valueAtPath(d, dim))) ?? 0;
            }

            return [x, y];
        });
        return lineGenerator(points) || '';
    }
}
