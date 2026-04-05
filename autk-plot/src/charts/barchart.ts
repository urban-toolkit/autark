import * as d3 from "d3";

import { ChartD3 } from "../chart-d3";
import type { ChartConfig, ChartTransformConfig } from "../api";
import { ChartStyle } from "../chart-style";
import { ChartEvent } from "../events-types";
import { valueAtPath } from "autk-core";
import { executeTransform } from "../transforms/execute-transform";

/**
 * Bar chart implementation supporting categorical values and histogram mode.
 *
 * In histogram mode, rendered bins are mapped back to original source feature
 * indices so interaction payloads remain stable across transformations.
 */
export class Barchart extends ChartD3 {

    protected mapX!: d3.ScaleBand<string>;
    protected mapY!: d3.ScaleLinear<number, number>;

    private _transformConfig?: ChartTransformConfig;
    private _rawData!: any[];

    /**
     * Creates a bar chart instance and performs the initial draw.
     * @param config Plot configuration with categorical axes or histogram settings.
     */
    constructor(config: ChartConfig) {
        if (config.events === undefined) { config.events = [ChartEvent.CLICK]; }
        if (config.transform) {
            config.labels = Barchart.applyTransformLabelDefaults(config.labels, config.transform);
        }
        super(config);

        this._transformConfig = config.transform ?? this.fromLegacyHistogramConfig(config);

        if (this._transformConfig) {
            // Save original data before draw() replaces it with aggregated rows.
            this._rawData = [...this.data];
        }

        this.draw();
    }

    /**
     * Transforms raw feature values into histogram bins and stores source ids
     * directly on each rendered bin datum via `autkIds`.
     */
    protected override computeTransform(): void {
        if (!this._transformConfig) {
            super.computeTransform();
            return;
        }

        const transformed = executeTransform(this._rawData, this._transformConfig);
        this.data = transformed.rows as any;
        this._attributes = transformed.attributes;
    }

    private fromLegacyHistogramConfig(config: ChartConfig): ChartTransformConfig | undefined {
        if (!config.histogram) {
            return undefined;
        }

        return {
            preset: 'histogram',
            attributes: {
                value: config.histogram.column,
            },
            options: {
                bins: config.histogram.numBins,
                divisor: config.histogram.divisor,
                labelSuffix: config.histogram.labelSuffix,
            },
        };
    }

    private static applyTransformLabelDefaults(
        labels: ChartConfig['labels'],
        transform: ChartTransformConfig
    ): NonNullable<ChartConfig['labels']> {
        const axis = labels?.axis ?? (transform.preset === 'histogram' ? ['label', 'count'] : ['bucket', 'value']);
        const title = labels?.title ?? Barchart.getTransformTitle(transform);

        return { axis, title };
    }

    private static getTransformTitle(transform: ChartTransformConfig): string {
        if (transform.preset === 'histogram') {
            return 'Histogram';
        }
        if (transform.preset === 'temporal-events') {
            return 'Temporal events';
        }
        return 'Timeseries';
    }

    /**
     * Renders chart scaffolding, axes, and bar marks.
     * @returns Promise resolved when SVG nodes are synchronized.
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

        // ---- Scales
        const xDomain = this.data.map((d) => {
            const val = d ? valueAtPath(d, this._attributes[0]) : 'unknown';
            return String(val);
        });
        this.mapX = d3.scaleBand().domain(xDomain).range([0, width]).padding(0.25);

        const yExtent = <[number, number]>d3.extent(this.data, (d) => d ? Number(valueAtPath(d, this._attributes[1])) || 0 : 0);
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
                const val = d ? valueAtPath(d, this._attributes[0]) : 'unknown';
                return this.mapX(String(val)) || 0;
            })
            .attr('y', (d) => this.mapY(d ? Number(valueAtPath(d, this._attributes[1])) || 0 : 0))
            .attr('height', (d) => height - this.mapY(d ? Number(valueAtPath(d, this._attributes[1])) || 0 : 0))
            .attr('width', this.mapX.bandwidth())
            .style('fill', ChartStyle.default)
            .style('stroke', '#2f2f2f')
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

}
