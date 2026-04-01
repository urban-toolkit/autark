import * as d3 from "d3";

import { PlotD3 } from "../plot-d3";
import { PlotConfig } from "../types";
import { PlotStyle } from "../plot-style";
import { PlotEvent } from "../constants";

interface HistogramConfig {
    column: string;
    numBins: number;
    divisor: number;
    labelSuffix: string;
}

export class Barchart extends PlotD3 {

    protected mapX!: d3.ScaleBand<string>;
    protected mapY!: d3.ScaleLinear<number, number>;

    private _histogramConfig?: HistogramConfig;
    private _binToFeatureIds: Map<number, number[]> = new Map();
    private _rawData!: any[];

    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = [PlotEvent.CLICK]; }
        super(config);

        if (config.histogram) {
            this._histogramConfig = {
                column: config.histogram.column,
                numBins: config.histogram.numBins,
                divisor: config.histogram.divisor ?? 1,
                labelSuffix: config.histogram.labelSuffix ?? '',
            };
            // Save original data before draw() replaces it with bin summaries
            this._rawData = [...this.data];
        }

        this.draw();
    }

    // ── Histogram computation ─────────────────────────────────────────────────

    private computeBins(): void {
        const { column, numBins, divisor, labelSuffix } = this._histogramConfig!;

        const binCounts = new Array(numBins).fill(0);
        this._binToFeatureIds = new Map();
        for (let i = 0; i < numBins; i++) this._binToFeatureIds.set(i, []);

        this._rawData.forEach((d: any, idx: number) => {
            const val = d ? this.getNestedValue(d, column) : null;
            if (val == null) return;
            const bin = Math.max(0, Math.min(Math.floor(+val / divisor), numBins - 1));
            binCounts[bin]++;
            this._binToFeatureIds.get(bin)!.push(idx);
        });

        // Replace data and attributes with bin-level summaries for rendering
        this.data = Array.from({ length: numBins }, (_, i) => ({
            label: `${i}-${i + 1}${labelSuffix}`,
            count: binCounts[i],
        })) as any;
        this._attributes = ['label', 'count'];
    }

    private getSelectedFeatureIds(): number[] {
        return this.selection.flatMap(binIdx => this._binToFeatureIds.get(binIdx) ?? []);
    }

    // ── Event overrides (histogram mode emits original feature indices) ────────

    override clickEvent(): void {
        if (!this._histogramConfig) { super.clickEvent(); return; }

        const svgs = d3.select(this._div).selectAll('.autkMark');
        const cls = d3.select(this._div).selectAll('.autkClear');
        const plot = this;

        svgs.each(function (_d, binIdx: number) {
            d3.select(this).on('click', function () {
                if (plot.selection.includes(binIdx)) {
                    plot.selection = plot.selection.filter(x => x !== binIdx);
                } else {
                    plot.selection.push(binIdx);
                }
                plot.events.emit(PlotEvent.CLICK, plot.getSelectedFeatureIds());
                plot.updatePlotSelection();
            });
        });

        cls.on('click', function () {
            plot.selection = [];
            plot.events.emit(PlotEvent.CLICK, []);
            plot.updatePlotSelection();
        });
    }

    override brushXEvent(): void {
        if (!this._histogramConfig) { super.brushXEvent(); return; }

        const brushable = d3.select(this._div).selectAll<SVGGElement, unknown>('.autkBrushable');
        const plot = this;

        const extent: [[number, number], [number, number]] = [
            [0, 0],
            [plot._width - plot._margins.left - plot._margins.right, plot._height - plot._margins.top - plot._margins.bottom],
        ];

        brushable.each(function () {
            const cBrush = d3.select<SVGGElement, unknown>(this);

            const brush = d3.brushX()
                .extent(extent)
                .on('start end', function (event: any) {
                    if (event.selection) {
                        const [x0, x1] = event.selection as [number, number];
                        const nextSel = new Set<number>();

                        // Intersect brush x-range with each bar's x-range via the band scale
                        plot.data.forEach((_d: any, binIdx: number) => {
                            const label = String(plot.getNestedValue(_d, plot._attributes[0]));
                            const barX = plot.mapX(label) ?? 0;
                            if (barX + plot.mapX.bandwidth() > x0 && barX < x1) {
                                nextSel.add(binIdx);
                            }
                        });

                        plot.selection = Array.from(nextSel);
                        plot.events.emit(PlotEvent.BRUSH_X, plot.getSelectedFeatureIds());
                        plot.updatePlotSelection();
                    } else {
                        plot.selection = [];
                        plot.events.emit(PlotEvent.BRUSH_X, []);
                        plot.updatePlotSelection();
                    }
                });

            cBrush.call(brush);
        });
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    public async draw(): Promise<void> {
        if (this._histogramConfig) {
            this.computeBins();
        }

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

        // ---- Scales
        const xDomain = this.data.map((d) => {
            const val = d ? this.getNestedValue(d, this._attributes[0]) : 'unknown';
            return String(val);
        });
        this.mapX = d3.scaleBand().domain(xDomain).range([0, width]).padding(0.25);

        const yExtent = <[number, number]>d3.extent(this.data, (d) => d ? +this.getNestedValue(d, this._attributes[1]) || 0 : 0);
        this.mapY = d3.scaleLinear().domain([0, Math.max(yExtent[1], 1)]).range([height, 0]);

        // ---- Axes
        const xAxis = d3.axisBottom(this.mapX).tickSizeOuter(0);

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisX')
            .data([0])
            .join('g')
            .attr('id', 'axisX')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');

        xAxisSelection
            .call(xAxis)
            .selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '-.40em')
            .attr('transform', 'rotate(-90)');

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(d3.format(',.0f'));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('#axisY')
            .data([0])
            .join('g')
            .attr('id', 'axisY')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

        // Y axis label:
        yAxisSelection
            .append('text')
            .attr('class', 'title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('visibility', 'visible')
            .text(this._axis[1]);

        // ---- Bars
        const cGroup = svg
            .selectAll('.autkBrushable')
            .data([0])
            .join('g')
            .attr('class', 'autkBrushable autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup
            .selectAll('.autkClear')
            .data([0])
            .join('rect')
            .attr('class', 'autkClear')
            .attr('width', width)
            .attr('height', height)
            .style('fill', 'white')
            .style('opacity', 0)
            .style('visibility', 'visible');

        cGroup
            .selectAll('.autkMark')
            .data(this.data)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', (d) => {
                const val = d ? this.getNestedValue(d, this._attributes[0]) : 'unknown';
                return this.mapX(String(val)) || 0;
            })
            .attr('y', (d) => this.mapY(d ? +this.getNestedValue(d, this._attributes[1]) || 0 : 0))
            .attr('height', (d) => height - this.mapY(d ? +this.getNestedValue(d, this._attributes[1]) || 0 : 0))
            .attr('width', this.mapX.bandwidth())
            .style('fill', PlotStyle.default)
            .style('stroke', '#2f2f2f')
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

}
