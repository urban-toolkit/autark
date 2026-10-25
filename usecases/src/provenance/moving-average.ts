/**
 * A user-defined transform, registered outside the package core: the centered
 * moving average of events per day.
 *
 * It uses only the public API (`registerTransform` and the provenance types).
 * Each event on day `d` adds `1 / (2h + 1)` to every day of the window
 * `[d − h, d + h]`, so a day's value is the average daily count around it.
 * The chain is `D0 regions → (1:N) D1 events → (N:N, real weights) D2 days`:
 * an event spreads over the days of its window, which is fractional coverage,
 * so a selected run of days covers each region by the part of its events'
 * weight inside it.
 *
 * Days at the ends of the data have an incomplete window, so their averages
 * are lower. Timestamps follow the convention of `binning-events`: the day is
 * the UTC day of the parsed date (the case study data carries its local time as UTC).
 */

import type { AutkDatum, TransformDefinition, TransformProvenance } from '@urban-toolkit/autk-plot';
import { featureId } from '@urban-toolkit/autk-plot';

/** One day in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

/** Day of a timestamp, at 00:00 UTC. */
function dayOf(value: unknown): number | null {
    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) ? Math.floor(time / DAY) * DAY : null;
}

/** Bucket label of a day: `MM-DD`, which sorts in time order within a year. */
function bucketOf(day: number): string {
    return new Date(day).toISOString().slice(5, 10);
}

export const movingAverage: TransformDefinition = {
    name: 'moving-average',
    shape: 'series',
    run(rows, options, columns) {
        const eventsAttr = columns[0] ?? '';
        const timestamp = String(options.timestamp ?? 'timestamp');
        const half = Math.max(0, Math.round(Number(options.halfWindow ?? 3)));
        const weight = 1 / (2 * half + 1);

        // ---- D1: one unit per event, with its day
        const events: { feature: number; day: number; id: string }[] = [];
        rows.forEach((row, index) => {
            const feature = row.autkIds?.[0] ?? index;
            const list = eventsAttr.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row);
            (Array.isArray(list) ? list : []).forEach((event, k) => {
                const day = dayOf((event as Record<string, unknown>)[timestamp]);
                if (day !== null) events.push({ feature, day, id: `event:${feature}.${k}` });
            });
        });

        // ---- D2: every day from the first to the last event
        const days: number[] = [];
        if (events.length > 0) {
            // A loop, not Math.min(...): spreading many events would overflow the stack.
            const first = events.reduce((m, e) => Math.min(m, e.day), Infinity);
            const last = events.reduce((m, e) => Math.max(m, e.day), -Infinity);
            for (let day = first; day <= last; day += DAY) days.push(day);
        }
        // Ids carry the year, so data spanning years never repeats a day id.
        const dayId = (day: number) => `day:${new Date(day).toISOString().slice(0, 10)}`;
        const inRange = new Set(days);

        // ---- Relations and units: each event spreads over its window
        const pairs01 = events.map(e => ({ source: featureId(e.feature), target: e.id, weight: 1 }));
        const pairs12: TransformProvenance['relations'][number]['pairs'] = [];
        const contributions: TransformProvenance['contributions'] = [];
        const value = new Map<number, number>();
        const reached = new Map<number, Set<number>>();
        for (const event of events) {
            for (let offset = -half; offset <= half; offset++) {
                const day = event.day + offset * DAY;
                if (!inRange.has(day)) continue;
                pairs12.push({ source: event.id, target: dayId(day), weight });
                contributions.push({ source: featureId(event.feature), target: dayId(day), value: weight, weight });
                value.set(day, (value.get(day) ?? 0) + weight);
                if (!reached.has(day)) reached.set(day, new Set());
                reached.get(day)!.add(event.feature);
            }
        }

        const output: AutkDatum[] = days.map(day => ({
            bucket: bucketOf(day),
            value: value.get(day) ?? 0,
            autkIds: Array.from(reached.get(day) ?? []),
        })) as AutkDatum[];

        return {
            rows: output,
            provenance: {
                stages: [
                    { name: 'D1', label: 'events', ids: events.map(e => e.id) },
                    { name: 'D2', label: 'days', ids: days.map(dayId) },
                ],
                relations: [
                    { source: 'D0', target: 'D1', pairs: pairs01 },
                    { source: 'D1', target: 'D2', pairs: pairs12 },
                ],
                rowIds: days.map(dayId),
                contributions,
                reducer: 'sum',
            },
        };
    },
};
