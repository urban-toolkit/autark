import * as d3 from "d3";

import { PlotD3 } from "../plot-d3";
import { PlotConfig } from "../types";
import { PlotStyle } from "../plot-style";
import { PlotEvent } from "../constants";

export class ParallelCoordinates extends PlotD3 {

    protected scales: Map<string, d3.ScaleLinear<number, number> | d3.ScalePoint<string>> = new Map();
    protected axisPositions: d3.ScalePoint<string>;
    protected dimensionTypes: Map<string, 'categorical' | 'numerical'> = new Map();

    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = [PlotEvent.CLICK]; }
        super(config);

        this.axisPositions = d3.scalePoint();
        this.draw();
    }

    public async draw(): Promise<void> {
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
        const dimensions = this._axis;

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
            .attr('d', (d) => this.path(d))
            .style('fill', 'none')
            .style('stroke', PlotStyle.default)
            .style('stroke-width', 1.5)
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

        // Add axis labels
        axisGroups
            .append('text')
            .attr('class', 'axis-label')
            .attr('text-anchor', 'middle')
            .attr('y', -9)
            .style('fill', '#000')
            .style('font-weight', '600')
            .style('visibility', 'visible')
            .text((d) => d);

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
    }

    // Override updatePlotSelection to handle line styling
    public updatePlotSelection(): void {
        const lines = d3.selectAll('.autkMark');
        lines
            .style('stroke', (_d: unknown, id: number) => {
                if (this.selection.includes(id)) {
                    return PlotStyle.highlight;
                } else {
                    return PlotStyle.default;
                }
            })
            .style('opacity', (_d: unknown, id: number) => {
                if (this.selection.includes(id)) {
                    return 1;
                } else {
                    return 0.7;
                }
            })
            .style('stroke-width', (_d: unknown, id: number) => {
                if (this.selection.includes(id)) {
                    return 2.5;
                } else {
                    return 1.5;
                }
            });
    }

    // Override brushYEvent for correct multi-axis line intersection brushing
    public brushYEvent(): void {
        const brushable = d3.selectAll<SVGGElement, string>('.autkBrushable');
        const plot = this;

        // Store active brushes extents (min/max Y values per dimension)
        const activeBrushes = new Map<string, [number, number]>();

        const brushHeight = plot._height - plot._margins.top - plot._margins.bottom;

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
                        plot.selection = [];
                        plot.plotEvents.emit(PlotEvent.BRUSH_Y, plot.selection);
                        plot.updatePlotSelection();
                        return;
                    }

                    const nextSel = new Set<number>();

                    // For each data point check if it intersects ALL active brushes
                    plot.data.forEach((d, id) => {
                        let isSelected = true;

                        for (const [activeDim, brushExtent] of activeBrushes) {
                            const scale = plot.scales.get(activeDim);
                            const dimType = plot.dimensionTypes.get(activeDim);

                            let y = 0;
                            if (scale && dimType === 'numerical') {
                                const numScale = scale as d3.ScaleLinear<number, number>;
                                y = numScale(+plot.getNestedValue(d, activeDim) || 0);
                            } else if (scale && dimType === 'categorical') {
                                const catScale = scale as d3.ScalePoint<string>;
                                y = catScale(String(plot.getNestedValue(d, activeDim))) ?? 0;
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

                    plot.selection = Array.from(nextSel);
                    plot.plotEvents.emit(PlotEvent.BRUSH_Y, plot.selection);
                    plot.updatePlotSelection();
                });

            cBrush.call(brush);
        });
    }

    // Helper function to generate path for each data point
    protected path(d: any): string {
        const dimensions = this._axis;
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
