/**
 * @fileoverview Calendar heatmap of events per day.
 *
 * Provides a D3-based calendar with the following features:
 * - **Day grid**: One column per week and one row per weekday, covering every
 *   day from the first to the last day with events
 * - **Aggregated marks**: Days with events are colored by their reduced value
 * - **Selection and linked views**: Click and 2D brush interactions on days
 * - **Segregated view**: A day fills only the part produced by a selection from
 *   another view, as an inner square whose area is the selected fraction
 * - **Transform required**: Events must be bucketed per day with the
 *   `binning-events` preset (`resolution: 'day'`, the default here)
 *
 * @example
 * const plot = new AutkPlot(plotDiv, {
 *   type: 'calendar',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: { preset: 'binning-events', options: { timestamp: 'date' } },
 *   labels: { title: 'Events per day' },
 *   events: [PlotEvent.CLICK]
 * });
 */

import * as d3 from 'd3';

import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import type { PlotConfig } from '../api';
import type { AutkDatum } from '../types-plot';

import { PlotBaseInteractive } from '../plot-base-interactive';
import { PlotStyle } from '../plot-style';
import type { SegregatedPart } from '../plot-base-interactive';
import type { ResolvedPlotTransform } from '../plot-base-data';

import type { BinningEventsBucketRow, ExecutedPlotTransform } from '../transforms';

/** One day in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;
/** Weekday initials, Sunday first, matching `Date.getUTCDay()`. */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Day cell of the grid. */
type DayCell = { date: Date; column: number; row: number };

/**
 * Calendar heatmap with one cell per day.
 */
export class Calendar extends PlotBaseInteractive {

    /** First day of the grid, at 00:00 UTC. */
    protected firstDay = new Date(0);
    /** Cell size in pixels. */
    protected cell = 0;
    /** Left offset that centers the grid in the drawing area. */
    protected offsetX = 0;

    /**
     * Creates a calendar and performs the initial draw.
     *
     * @param config Plot configuration. Must include a `binning-events` transform with daily buckets.
     * @throws If the transform is missing, is not `binning-events`, or uses another resolution.
     */
    constructor(config: PlotConfig) {
        if (config.events === undefined) { config.events = []; }
        // Grey by value, so the provenance color stands out over any mark.
        if (config.colorMapInterpolator === undefined) { config.colorMapInterpolator = ColorMapInterpolator.SEQ_GREYS; }
        if (!config.transform || config.transform.preset !== 'binning-events') {
            throw new Error('Calendar requires a binning-events transform preset.');
        }
        const resolution = config.transform.options?.resolution ?? 'day';
        if (resolution !== 'day') {
            throw new Error("Calendar requires daily buckets (resolution: 'day').");
        }
        config.transform = { ...config.transform, options: { ...config.transform.options, resolution } };

        super(config);
        this.draw();
    }

    /**
     * Colors days by their reduced value.
     *
     * @param result Executed transform payload from the shared dispatcher.
     * @returns Day rows with `value` as the color binding.
     */
    protected override resolveTransformResult(result: ExecutedPlotTransform): ResolvedPlotTransform {
        return { ...super.resolveTransformResult(result), colorAttribute: 'value' };
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
     * Renders the title, weekday and month labels, the day grid, and day marks.
     *
     * @throws If the root SVG element cannot be created.
     */
    public render(): void {
        const rows = this._data as unknown as BinningEventsBucketRow[];

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

        // ---- Grid: every day between the first and the last day with events
        const times = rows.map(r => this.dayOf(r.bucket).getTime()).filter(Number.isFinite);
        const first = times.length > 0 ? Math.min(...times) : 0;
        const last = times.length > 0 ? Math.max(...times) : 0;
        this.firstDay = new Date(first);
        const days: DayCell[] = times.length === 0 ? [] : d3.range(first, last + DAY, DAY).map(t => this.cellOf(new Date(t)));
        const columns = Math.max(1, ...days.map(d => d.column + 1));
        this.cell = Math.max(1, Math.min(width / columns, height / 7));
        this.offsetX = (width - this.cell * columns) / 2;

        const cGroup = svg.selectAll('.autkBrush').data([0]).join('g')
            .attr('class', 'autkBrush autkMarksGroup')
            .attr('transform', `translate(${this._margins.left}, ${this._margins.top})`);

        cGroup.selectAll('.autkClear').data([0]).join('rect')
            .attr('class', 'autkClear')
            .attr('width', width).attr('height', height)
            .style('fill', 'white').style('opacity', 0);

        // Weekday initials on the left, month names above their first week
        cGroup.selectAll<SVGTextElement, number>('.autk-calendar-weekday')
            .data(d3.range(7)).join('text')
            .attr('class', 'autk-calendar-weekday')
            .attr('x', this.offsetX - 6)
            .attr('y', i => (i + 0.5) * this.cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('font-size', '10px')
            .style('fill', '#57606a')
            .text(i => WEEKDAYS[i]);
        const months = days.filter(d => d.date.getUTCDate() === 1 || d === days[0]);
        cGroup.selectAll<SVGTextElement, DayCell>('.autk-calendar-month')
            .data(months).join('text')
            .attr('class', 'autk-calendar-month')
            .attr('x', d => this.offsetX + d.column * this.cell)
            .attr('y', -6)
            .style('font-size', '11px')
            .style('fill', '#57606a')
            .text(d => d3.utcFormat('%b %Y')(d.date));

        // Every day of the range, under the marks
        cGroup.selectAll<SVGRectElement, DayCell>('.autk-calendar-day')
            .data(days).join('rect')
            .attr('class', 'autk-calendar-day')
            .attr('x', d => this.offsetX + d.column * this.cell)
            .attr('y', d => d.row * this.cell)
            .attr('width', this.cell)
            .attr('height', this.cell)
            .style('fill', '#f6f8fa')
            .style('stroke', '#ffffff')
            .style('pointer-events', 'none');

        // Days with events are the interactive marks
        cGroup.selectAll<SVGRectElement, AutkDatum>('.autkMark')
            .data(this._data).join('rect')
            .attr('class', 'autkMark')
            .attr('x', d => this.offsetX + this.cellOf(this.dayOf((d as unknown as BinningEventsBucketRow).bucket)).column * this.cell)
            .attr('y', d => this.cellOf(this.dayOf((d as unknown as BinningEventsBucketRow).bucket)).row * this.cell)
            .attr('width', this.cell)
            .attr('height', this.cell)
            .style('fill', d => this.getMarkColor(d))
            .style('stroke', '#ffffff')
            .style('cursor', 'pointer')
            .selectAll('title').data(d => [d as unknown as BinningEventsBucketRow]).join('title')
            .text(r => `${r.bucket}: ${d3.format('~s')(r.value)}`);

        // Day numbers, when cells are large enough to hold them
        cGroup.selectAll<SVGTextElement, DayCell>('.autk-calendar-number')
            .data(this.cell >= 18 ? days : []).join('text')
            .attr('class', 'autk-calendar-number')
            .attr('x', d => this.offsetX + (d.column + 0.5) * this.cell)
            .attr('y', d => (d.row + 0.5) * this.cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(d => d.date.getUTCDate());

        this.configureSignalListeners();
    }

    /**
     * Days aggregate events from many features, so they can show partial contributions.
     *
     * @returns Always `true`; the calendar requires the `binning-events` transform.
     */
    protected override supportsSegregatedView(): boolean {
        return true;
    }

    /**
     * Draws the part of each day produced by the selected features.
     *
     * For count and sum, a centered inner square covers the selected fraction
     * of the day cell while the cell keeps its color. For avg, min, and max the
     * subset value is not a part; a half-size inner square shows it with the
     * same colormap instead.
     */
    protected override renderSegregatedMarks(): void {
        const group = d3.select(this._div).select<SVGGElement>('.autkMarksGroup');
        if (group.empty() || this.cell === 0) return;

        const scaleOf = (p: SegregatedPart) => p.part.additive ? Math.sqrt(p.fraction) : 0.5;
        const cellOf = (p: SegregatedPart) => this.cellOf(this.dayOf((p.datum as unknown as BinningEventsBucketRow).bucket));
        const fillOf = (p: SegregatedPart) => p.part.additive
            ? this.highlightColor
            : this.getMarkColor({ ...p.datum, value: p.part.value });

        group.selectAll<SVGRectElement, SegregatedPart>('.autkPartial')
            .data(this.segregatedParts(), p => p.mark)
            .join(enter => enter.insert('rect', '.autk-calendar-number'))
            .attr('class', 'autkPartial')
            .attr('data-autk-provenance', p => p.mark)
            .attr('data-autk-units', p => `${p.part.selectedUnits}/${p.part.totalUnits}`)
            .attr('x', p => this.offsetX + (cellOf(p).column + (1 - scaleOf(p)) / 2) * this.cell)
            .attr('y', p => (cellOf(p).row + (1 - scaleOf(p)) / 2) * this.cell)
            .attr('width', p => this.cell * scaleOf(p))
            .attr('height', p => this.cell * scaleOf(p))
            .style('fill', fillOf)
            .style('stroke', '#ffffff')
            .style('pointer-events', 'none');
    }

    /** Parses a `YYYY-MM-DD` bucket key as 00:00 UTC of that day. */
    private dayOf(bucket: string): Date {
        return new Date(`${bucket}T00:00:00Z`);
    }

    /** Grid position of a day: its week since the first day's week, and its weekday. */
    private cellOf(date: Date): DayCell {
        const offset = Math.round((date.getTime() - this.firstDay.getTime()) / DAY);
        return { date, column: Math.floor((offset + this.firstDay.getUTCDay()) / 7), row: date.getUTCDay() };
    }
}
