/**
 * @fileoverview Bubble chart: a scatter plot whose point area encodes a third attribute.
 *
 * Takes three numeric attributes: x (`axis[0]`), y (`axis[1]`), and size
 * (`axis[2]`). Bubble area is proportional to the size value. Larger bubbles
 * are drawn first so smaller ones stay visible and clickable. Interactions and
 * the segregated view are those of the scatter plot: an inner disc whose area
 * is the selected fraction of the bubble.
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'bubble',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', 'shape_leng', 'events_count'] },
 *   labels: { axis: ['area', 'perimeter', 'events'], title: 'Regions' },
 *   events: [PlotEvent.BRUSH]
 * });
 */

import * as d3 from 'd3';

import { valueAtPath } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';

import { Scatterplot } from './scatterplot';

/** Radius range of bubbles in pixels, from size `0` to the largest size. */
const RADIUS_RANGE: [number, number] = [2, 16];

/**
 * Scatter plot with bubble area proportional to a third attribute.
 */
export class Bubblechart extends Scatterplot {

    /**
     * Size scale, rebuilt on every render. Declared without an initializer:
     * the scatter plot constructor draws before subclass fields would be set.
     */
    declare protected sizeScale: d3.ScalePower<number, number> | undefined;

    /**
     * Creates a bubble chart and performs the initial draw.
     *
     * @param config Plot configuration with three numeric axis attributes.
     * @throws If fewer than three axis attributes are given.
     */
    constructor(config: PlotConfig) {
        if ((config.attributes?.axis?.length ?? 0) < 3) {
            throw new Error('Bubble chart requires x, y, and size attributes.');
        }
        super(config);
    }

    /**
     * Builds the size scale, renders the scatter plot, and draws larger
     * bubbles first.
     */
    public override render(): void {
        const sizeAttr = this.renderAxisAttributes[2];
        const sizes = this._data.map(d => Number(valueAtPath(d, sizeAttr))).filter(v => Number.isFinite(v) && v >= 0);
        this.sizeScale = d3.scaleSqrt().domain([0, d3.max(sizes) || 1]).range(RADIUS_RANGE);

        super.render();

        d3.select(this._div).selectAll<SVGCircleElement, AutkDatum>('.autkMark')
            .style('fill-opacity', 0.8)
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .sort((a, b) => this.radiusOf(b) - this.radiusOf(a));
    }

    /**
     * Bubble radius from the size attribute, with area proportional to it.
     *
     * @param d Bound datum of the bubble.
     * @returns Radius in pixels; the smallest radius for missing or negative sizes.
     */
    protected override radiusOf(d: AutkDatum): number {
        const size = Number(valueAtPath(d, this.renderAxisAttributes[2]));
        if (!this.sizeScale || !Number.isFinite(size) || size < 0) return RADIUS_RANGE[0];
        return this.sizeScale(size);
    }
}
