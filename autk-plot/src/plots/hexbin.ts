/**
 * @fileoverview Hexbin: a scatter plot aggregated into hexagons.
 *
 * Provides a D3-based hexagonal binning plot with the following features:
 * - **Aggregated marks**: Points are grouped into regular hexagons colored by
 *   their reduced value (count by default)
 * - **Selection and linked views**: Click and 2D brush interactions on hexagons
 * - **Segregated view**: A hexagon fills only the part produced by a selection
 *   from another view, as an inner hexagon whose area is the selected fraction
 * - **Transform required**: Data must be grouped with the `binning-hex` preset.
 *   The plot sets the preset's pixel area to its own drawing area.
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'hexbin',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', 'shape_leng'] },
 *   transform: { preset: 'binning-hex', options: { radius: 16 } },
 *   labels: { axis: ['area', 'perimeter'], title: 'Regions by area and perimeter' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';

import { PlotBaseInteractive } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import type { SegregatedPart } from '../plot-base-interactive';
import type { ResolvedPlotTransform } from '../plot-base-data';

import type { BinningHexRow, ExecutedPlotTransform } from '../transforms';

/**
 * Closed path of a pointy-top hexagon.
 *
 * @param r Radius (center to corner) in pixels.
 * @param cx Center x in pixels.
 * @param cy Center y in pixels.
 * @returns SVG path data with line commands only, so brushes can test it.
 */
function hexagonPath(r: number, cx: number, cy: number): string {
    const corners = d3.range(6).map(k => {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
    });
    return `M${corners.join('L')}Z`;
}

/**
 * Hexagonal binning plot of two numeric attributes.
 */
export class Hexbin extends PlotBaseInteractive {

    /** Linear scale of the x attribute, for the axis. */
    protected mapX!: d3.ScaleLinear<number, number>;
    /** Linear scale of the y attribute, for the axis. */
    protected mapY!: d3.ScaleLinear<number, number>;
    /** Data extent and hexagon radius of the last transform run. */
    protected grid: { extent: { x: [number, number]; y: [number, number] }; radius: number } = {
        extent: { x: [0, 1], y: [0, 1] },
        radius: 14,
    };

    /**
     * Creates a hexbin plot and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `binning-hex` transform.
     * @throws If the transform is missing or is not `binning-hex`.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        // Grey by value, so the provenance color stands out over any mark.
        if (config.colorMapInterpolator === undefined) { config.colorMapInterpolator = ColorMapInterpolator.SEQ_GREYS; }
        if (config.tickFormats === undefined) { config.tickFormats = ['~s', '~s']; }
        if (!config.transform || config.transform.preset !== 'binning-hex') {
            throw new Error('Hexbin requires a binning-hex transform preset.');
        }

        super(config);
        this.draw();
    }

    /** Bins the hexagons in the plot's own drawing area, so they are regular on screen at any width. */
    protected override resolveSize(): void {
        super.resolveSize();
        const transform = this._transformConfig;
        if (transform?.preset === 'binning-hex') {
            this._transformConfig = {
                ...transform,
                options: {
                    ...transform.options,
                    width: this._width - this._margins.left - this._margins.right,
                    height: this._height - this._margins.top - this._margins.bottom,
                },
            };
        }
    }

    /**
     * Keeps the data extent and radius of the transform for the axes and marks.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns The default resolution of the base class.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        if (result.preset === 'binning-hex') {
            this.grid = { extent: result.extent, radius: result.radius };
        }
        return super.resolveTransformResult(result);
    }

    /**
     * Colors by value with a domain that keeps the default grey scheme between
     * light and medium tones, unless a domain was configured.
     */
    protected override computeColorDomain(): void {
        super.computeColorDomain();
        const domain = this._resolvedDomain;
        if (this._domainSpec || !domain || typeof domain[0] !== 'number') return;
        this._resolvedDomain = PlotStyle.softSequentialDomain([domain[0], domain[domain.length - 1] as number]);
    }

    /**
     * Renders the title, axes, and hexagons.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as BinningHexRow[];

        const svg = d3.select(this._div)
            .selectAll('#plot').data([0]).join('svg')
            .attr('id', 'plot')
            .attr('width', this._width)
            .attr('height', this._height)
            .style('visibility', 'visible');

        if (!svg.node()) throw new Error('SVG element could not be created.');

        const width = this._width - this._margins.left - this._margins.right;
        const height = this._height - this._margins.top - this._margins.bottom;

        // ---- Title
        svg.selectAll<SVGTextElement, string>('#plotTitle')
            .data(this._title ? [this._title] : []).join('text')
            .attr('id', 'plotTitle')
            .attr('class', 'plot-title')
            .attr('x', this._margins.left + width / 2)
            .attr('y', Math.max(this._margins.top * 0.5, 10))
            .attr('text-anchor', 'middle')
            .style('font-weight', '600')
            .text(d => d);

        // ---- Axes, over the same extent and inset the transform mapped to pixels
        const inset = this.grid.radius;
        this.mapX = d3.scaleLinear().domain(this.grid.extent.x).range([inset, width - inset]);
        this.mapY = d3.scaleLinear().domain(this.grid.extent.y).range([height - inset, inset]);

        const xAxis = svg.selectAll<SVGGElement, unknown>('#axisX').data([0]).join('g')
            .attr('id', 'axisX').attr('class', 'x axis')
            .attr('transform', `translate(${this._margins.left}, ${this._height - this._margins.bottom})`);
        xAxis.call(d3.axisBottom(this.mapX).ticks(6).tickFormat(d3.format(this._tickFormats[0] || '~s')));
        xAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[0]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('x', width)
            .attr('y', this._margins.bottom / 2 + 10)
            .style('fill', '#000')
            .text(d => d);

        const yAxis = svg.selectAll<SVGGElement, unknown>('#axisY').data([0]).join('g')
            .attr('id', 'axisY').attr('class', 'y axis')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);
        yAxis.call(d3.axisLeft(this.mapY).ticks(5).tickFormat(d3.format(this._tickFormats[1] || '~s')));
        yAxis.selectAll<SVGTextElement, string>('.axis-label')
            .data([this._axisLabels[1]]).join('text')
            .attr('class', 'axis-label title')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-90)')
            .attr('y', -this._margins.left / 2 - 7)
            .attr('x', -this._margins.top)
            .style('fill', '#000')
            .text(d => d);

        // ---- Hexagons
        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        cGroup.selectAll<SVGPathElement, BinningHexRow>('.autkMark')
            .data(rows).join('path')
            .attr('class', 'autkMark')
            // Absolute coordinates, so brushes test the hexagon where it is drawn.
            .attr('d', r => hexagonPath(this.grid.radius, r.cx, r.cy))
            .style('fill', d => this.getMarkColor(d))
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('cursor', 'pointer')
            .selectAll('title').data(r => [r]).join('title')
            .text(r => `${r.label}\nn = ${r.count}, value = ${d3.format('~s')(r.value)}`);

        this.configureSignalListeners();
    }

    /**
     * Hexagons aggregate many features, so they can show partial contributions.
     *
     * @returns Always `true`; the plot requires the `binning-hex` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the part of each hexagon produced by the selected features.
     *
     * For count and sum, a centered inner hexagon covers the selected fraction
     * of the hexagon area while the hexagon keeps its color. For avg, min, and
     * max the subset value is not a part; a half-size inner hexagon shows it
     * with the same colormap instead.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty()) return;

        const scaleOf = (p: SegregatedPart) => p.part.additive ? Math.sqrt(p.fraction) : 0.5;
        const fillOf = (p: SegregatedPart) => p.part.additive
            ? this.highlightColor
            : this.getMarkColor({ ...p.datum, value: p.part.value });

        group.selectAll<SVGPathElement, SegregatedPart>('.autkPartial')
            .data(this.segregatedParts(), p => p.mark)
            .join('path')
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('d', p => {
                const row = p.datum as unknown as BinningHexRow;
                return hexagonPath(this.grid.radius * scaleOf(p), row.cx, row.cy);
            })
            .style('fill', fillOf)
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('pointer-events', 'none');
    }
}
