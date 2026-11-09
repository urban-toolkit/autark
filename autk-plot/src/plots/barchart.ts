/**
 * @fileoverview Bar plot visualization supporting both categorical and binned modes.
 *
 * Provides a D3-based bar plot implementation with the following features:
 * - **Dual rendering modes**: Categorical bars and one-dimensional binned output from transformed data
 * - **Two-axis mapping**: Category/bin labels on x and numeric values on y
 * - **Selection and linked views**: Uses source feature ids for click/brush interactions across components
 *
 * The plot maintains a stable mapping between rendered bins and original source features,
 * allowing selections to remain consistent across transformations.
 *
 * @example
 * // Binned mode with map-plot linking
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'barchart',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', '@transform'] },
 *   transform: {
 *     preset: 'binning-1d',
 *     options: { bins: 8 }
 *   },
 *   labels: { axis: ['area range', 'count'], title: 'Distribution' },
 *   events: [PlotEvent.CLICK]
 * });
 *
 * @example
 * // Categorical mode
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'barchart',
 *   collection: features,
 *   attributes: { axis: ['category', 'value'] },
 *   labels: { axis: ['category', 'value'] }
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';

import { PlotBaseInteractive } from '../plot-base-interactive';

/**
 * Bar plot implementation supporting categorical values and binned mode.
 *
 * In binned mode, rendered bins are mapped back to original source feature
 * indices so interaction payloads remain stable across transformations.
 */
export class Barchart extends PlotBaseInteractive {

    /** Band scale mapping category/bin labels to pixel positions. */
    protected mapX!: d3.ScaleBand<string>;
    /** Linear scale mapping bar heights (numeric values) to pixel coordinates. */
    protected mapY!: d3.ScaleLinear<number, number>;

    /**
     * Creates a bar plot instance and performs the initial draw.
     *
     * @param config Plot configuration with categorical axes or binning settings.
     * @throws If a transform is configured with a preset other than `binning-1d`.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        if (config.transform) {
            if (config.transform.preset !== 'binning-1d') {
                throw new Error('Barchart only supports the binning-1d transform preset.');
            }

            const axis = config.labels?.axis ?? ['label', 'value'];
            const title = config.labels?.title ?? 'Distribution';
            config.labels = { axis, title };
        }
        super(config);

        this.draw();
    }

    /** Runs the overlay callback again, for when the page's own state changed but the data did not. */
    public override refreshOverlay(): void {
        this.drawOverlay();
    }

    private drawOverlay(): void {
        const layer = d3.select(this._div).select<SVGGElement>('.autkOverlay').node();
        if (!this._overlay || !layer || !this.mapX || !this.mapY) { return; }
        layer.replaceChildren();
        const domain = this.mapX.domain();
        const mapX = this.mapX, mapY = this.mapY;
        this._overlay({
            layer,
            width: this._width - this._margins.left - this._margins.right,
            height: this._height - this._margins.top - this._margins.bottom,
            // x is the index of a category: the left edge of its band
            x: i => mapX(domain[Math.max(0, Math.min(domain.length - 1, Math.round(i)))]) ?? 0,
            y: v => mapY(v),
        });
    }

    /**
     * Renders plot scaffolding, axes, and bar marks.
     *
     * @throws If the root SVG element cannot be created.
     */
    render(): void {
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

        // ---- Plot size
        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title (optional)
        if (this._title && this._title.length > 0) {
            svg
                .selectAll<SVGTextElement, string>('.plot-title')
                .data([this._title])
                .join('text')
                .attr('class', 'plot-title')
                .attr('x', this._margins.left + width / 2)
                .attr('y', Math.max(this._margins.top * 0.5, 10))
                .attr('text-anchor', 'middle')
                .style('font-weight', '600')
                .style('visibility', 'visible')
                .text((d) => d);
        }

        // ---- Scales
        const keyOf = (d: unknown) => String(d ? valueAtPath(d as AutkDatum, this.renderAxisAttributes[0]) : 'unknown');
        const xDomain = [...new Set(this._data.map(keyOf))];
        this.mapX = d3.scaleBand().domain(xDomain).range([0, width]).padding(this._barPadding);

        // With a color attribute and more rows than categories, the rows belong to groups, which share each category's
        // band. A color attribute with one row per category only colors the bars.
        const colorAttribute = this.renderColorAttribute;
        const groupOf = (d: unknown) => (colorAttribute ? String(valueAtPath(d as AutkDatum, colorAttribute)) : '');
        const groups = [...new Set(this._data.map(groupOf))];
        const slice = d3.scaleBand().domain(groups).range([0, this.mapX.bandwidth()]);
        const grouped = !!colorAttribute && this._data.length > xDomain.length;
        const sideBySide = grouped && this._groupMode === 'side-by-side';

        const yExtent = <[number, number]>d3.extent(this._data, (d) => d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0);
        this.mapY = d3.scaleLinear().domain([0, Math.max(yExtent[1], 1)]).range([height, 0]);

        // ---- Axes
        // A category reads as it is written (2020, not 2.02k), unless the configuration's tickFormats give the x axis
        // a format, which then writes a category that reads as a number.
        const xAxis = d3.axisBottom(this.mapX).tickSizeOuter(0).tickFormat((d) => {
            const value = String(d);
            if (this._xTickLabel) { return this._xTickLabel(value); }
            const numericValue = Number(value);
            return this.hasTickFormat(0) && Number.isFinite(numericValue) && value.trim() !== ''
                ? this.tickFormat(0, '~s')(numericValue)
                : value;
        });

        const xAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.x.axis')
            .data([0])
            .join('g')
            .attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`)
            .style('visibility', 'visible');

        xAxisSelection
            .call(xAxis)
            .selectAll('.tick text')
            .style('text-anchor', this._xTickLabel ? 'middle' : 'end')
            .attr('dx', this._xTickLabel ? null : '-.8em')
            .attr('dy', this._xTickLabel ? null : '-.40em')
            .attr('transform', this._xTickLabel ? null : 'rotate(-90)');

        xAxisSelection
            .selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]])
            .join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('visibility', 'visible')
            .text((d) => d);

        const yAxis = d3.axisLeft(this.mapY).tickSizeInner(-width).tickFormat(this.tickFormat(1));

        const yAxisSelection = svg
            .selectAll<SVGGElement, unknown>('.y.axis')
            .data([0])
            .join('g')
            .attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('visibility', 'visible');
        yAxisSelection.call(yAxis);

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

        // ---- Overlay (page-drawn marks behind the bars)
        svg
            .selectAll('.autkOverlay')
            .data([0])
            .join('g')
            .attr('class', 'autkOverlay')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`)
            .style('pointer-events', 'none');
        this.drawOverlay();

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
            .data(this._data)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', (d) => (this.mapX(keyOf(d)) || 0) + (sideBySide ? slice(groupOf(d)) || 0 : 0))
            .attr('y', (d) => this.mapY(d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0))
            .attr('height', (d) => height - this.mapY(d ? Number(valueAtPath(d, this.renderAxisAttributes[1])) || 0 : 0))
            .attr('width', sideBySide ? slice.bandwidth() : this.mapX.bandwidth())
            .style('fill', d => this.getMarkColor(d))
            .style('fill-opacity', grouped && !sideBySide ? 0.5 : 1)
            .style('stroke', grouped ? 'none' : '#2f2f2f')
            .style('visibility', 'inherit');

        this.configureSignalListeners();
    }

}
