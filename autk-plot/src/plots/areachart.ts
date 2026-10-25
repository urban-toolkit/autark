/**
 * @fileoverview Area chart for event-based and series data.
 *
 * A line chart with the region under the line filled. It takes the same
 * transforms (`binning-events`, `reduce-series`) and interactions as the line
 * chart. In the segregated view, the selected subset also gets its own filled
 * area under its line when the reducer is additive (count or sum), so the
 * selection reads as the part of the whole it produced.
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'areachart',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'monthday' } },
 *   labels: { axis: ['day', 'events'], title: 'Events per day' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import { Linechart } from './linechart';
import { PlotStyle } from '../plot-style';
import { markId } from '../provenance';

/** Point of a filled area: bucket position and value. */
type AreaPoint = { x: number; y: number };

/**
 * Area chart over the line chart's rows and scales.
 */
export class Areachart extends Linechart {

    /**
     * Renders the line chart and fills the region under the line.
     */
    public override render(): void {
        super.render();

        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        const rows = this._data as unknown as AreaPoint[];
        group.selectAll<SVGPathElement, AreaPoint[]>('.autk-area')
            .data([rows])
            .join(enter => enter.insert('path', '.autk-line'))
            .attr('class', 'autk-area')
            .attr('d', this.areaPath())
            .style('fill', this.segregatedEnabled ? PlotStyle.default : '#4472c4')
            .style('fill-opacity', this.segregatedEnabled ? 0.35 : 0.2)
            .style('pointer-events', 'none');
    }

    /**
     * Draws the subset line and dots of the line chart, plus the area under
     * the subset line for additive reducers.
     *
     * For count and sum the subset value of a bucket is a part of its total,
     * so the filled subset area always lies inside the total area. For avg,
     * min, and max it is not a part, and only the subset line is drawn.
     */
    protected override renderSegregatedMarks(): void {
        super.renderSegregatedMarks();

        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || !this.xScale || !this.yScale) return;

        const parts = this.segregatedParts();
        const additive = parts[0]?.part.additive ?? false;
        const byMark = new Map(parts.map(p => [p.mark, p]));
        const rows = this._data as unknown as AreaPoint[];
        const points: AreaPoint[] = parts.length === 0 || !additive ? [] : rows.map(row => {
            const rowId = this.rowIdOf(row);
            const part = rowId ? byMark.get(markId(rowId))?.part : undefined;
            return { x: row.x, y: part?.value ?? 0 };
        });

        group.selectAll<SVGPathElement, AreaPoint[]>('.autkPartialArea')
            .data(points.length > 0 ? [points] : [])
            .join(enter => enter.insert('path', '.autkMark'))
            .attr('class', 'autkPartialArea')
            .attr('d', this.areaPath())
            .style('fill', this.highlightColor)
            .style('fill-opacity', 0.45)
            .style('pointer-events', 'none');
    }

    /**
     * Area generator from the x axis (or `0`, when inside the y domain) up to each point.
     */
    private areaPath(): d3.Area<AreaPoint> {
        const y = this.yScale.copy().clamp(true);
        const [low, high] = this.yScale.domain();
        const base = y(Math.min(Math.max(0, low), high));
        return d3.area<AreaPoint>()
            .x(p => this.xScale(p.x))
            .y0(base)
            .y1(p => y(p.y));
    }
}
