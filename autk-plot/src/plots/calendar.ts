/**
 * @fileoverview Calendar heatmap of events per day.
 *
 * Reads daily buckets (`YYYY-MM-DD`) of a `binning-events` transform or of any `series` transform,
 * laid out as one column per week and one row per weekday from the first to the last day with events. A selection
 * elsewhere shows an inner square of the selected area for count and sum, a half-size square
 * colored by the subset value for avg, min, and max.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'calendar',
 *   collection: geojson,
 *   attributes: { axis: ['events', '@transform'] },
 *   transform: { preset: 'binning-events', options: { timestamp: 'date' } },
 *   labels: { title: 'Events per day' }
 * });
 */

import * as d3 from 'd3';

import { ColorMapInterpolator } from '@urban-toolkit/autk-core';

import { PlotStyle } from '../plot-style';
import type { BinningEventsBucketRow } from '../transforms';
import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** One day in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;
/** Weekday initials, Sunday first, matching `Date.getUTCDay()`. */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A daily bucket key. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a `YYYY-MM-DD` bucket key as 00:00 UTC of that day. */
const dayOf = (row: AutkDatum) => new Date(`${(row as unknown as BinningEventsBucketRow).bucket}T00:00:00Z`);

/** Days of a daily series (`binning-events` by day, or any `series` transform with `YYYY-MM-DD` buckets), colored by their reduced value. */
export const calendar: PlotDefinition = {
    name: 'calendar',
    label: 'Calendar',
    transforms: ['binning-events', 'series'],
    requiresTransform: true,
    topK: false,
    // Gray by value, so the highlight stands out over any day.
    defaults: { colorMapInterpolator: ColorMapInterpolator.SEQ_GREYS },
    colorAttribute: 'value',
    colorDomain: PlotStyle.softSequentialDomain,
    validate: config => {
        if (config.transform?.preset !== 'binning-events') return;
        const resolution = (config.transform.options as { resolution?: string } | undefined)?.resolution ?? 'day';
        if (resolution !== 'day') throw new Error("Calendar requires daily buckets (resolution: 'day').");
    },
    // Daily buckets by default; a configured resolution is kept, and checked above or by draw.
    transformOptions: (_area, configured) => ({ resolution: configured.resolution ?? 'day' }),
    // Days have one size: the value is in the color, never in the geometry.
    design: { rect: { rule: 'glyph' } },

    draw({ group, rows, width, height }) {
        if (rows.some(row => !DAY_KEY.test(String((row as unknown as BinningEventsBucketRow).bucket)))) {
            throw new Error('Calendar requires daily buckets (YYYY-MM-DD).');
        }
        const times = rows.map(row => dayOf(row).getTime()).filter(Number.isFinite);
        const first = times.length > 0 ? Math.min(...times) : 0;
        const last = times.length > 0 ? Math.max(...times) : 0;
        const firstDay = new Date(first);
        // Grid position of a day: its week since the first day's week, and its weekday.
        const cellOf = (date: Date) => {
            const offset = Math.round((date.getTime() - first) / DAY);
            return { date, column: Math.floor((offset + firstDay.getUTCDay()) / 7), row: date.getUTCDay() };
        };
        const days = times.length === 0 ? [] : d3.range(first, last + DAY, DAY).map(t => cellOf(new Date(t)));
        const columns = Math.max(1, ...days.map(d => d.column + 1));
        const cell = Math.max(1, Math.min(width / columns, height / 7));
        const left = (width - cell * columns) / 2;

        // Weekday initials on the left, month names above their first week.
        group.selectAll('text.autk-calendar-weekday')
            .data(d3.range(7))
            .join('text')
            .attr('class', 'autk-calendar-weekday')
            .attr('x', left - 6)
            .attr('y', i => (i + 0.5) * cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('font-size', '10px')
            .style('fill', '#57606a')
            .text(i => WEEKDAYS[i]);
        group.selectAll('text.autk-calendar-month')
            .data(days.filter(d => d.date.getUTCDate() === 1 || d === days[0]))
            .join('text')
            .attr('class', 'autk-calendar-month')
            .attr('x', d => left + d.column * cell)
            .attr('y', -6)
            .style('font-size', '11px')
            .style('fill', '#57606a')
            .text(d => d3.utcFormat('%b %Y')(d.date));

        // Every day of the range, under the marks.
        group.selectAll('rect.autk-calendar-day')
            .data(days)
            .join('rect')
            .attr('class', 'autk-calendar-day')
            .attr('x', d => left + d.column * cell)
            .attr('y', d => d.row * cell)
            .attr('width', cell)
            .attr('height', cell)
            .style('fill', '#f6f8fa')
            .style('stroke', '#ffffff')
            .style('pointer-events', 'none');

        group.selectAll('rect.autkMark')
            .data(rows)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => left + cellOf(dayOf(row)).column * cell)
            .attr('y', row => cellOf(dayOf(row)).row * cell)
            .attr('width', cell)
            .attr('height', cell)
            .style('stroke', '#ffffff')
            .style('cursor', 'pointer')
            .append('title')
            .text(row => `${(row as unknown as BinningEventsBucketRow).bucket}: ${d3.format('~s')(Number(row.value))}`);

        // Day numbers, when cells are large enough to hold them.
        group.selectAll('text.autk-calendar-number')
            .data(cell >= 18 ? days : [])
            .join('text')
            .attr('class', 'autk-calendar-number')
            .attr('x', d => left + (d.column + 0.5) * cell)
            .attr('y', d => (d.row + 0.5) * cell)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .style('font-size', '9px')
            .style('fill', '#24292f')
            .style('pointer-events', 'none')
            .text(d => d.date.getUTCDate());
    },
};
