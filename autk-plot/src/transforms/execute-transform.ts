import { valueAtPath } from 'autk-core';

import type { AutkDatum, ChartTransformConfig } from '../api';
import { presetHistogram, type HistogramBinRow } from './presets/histogram';
import { presetEventsByResolution, type TemporalBucketRow } from './presets/temporal-events';
import { presetTimeseriesAggregate, type TimeseriesBucketRow, type TimeseriesPoint } from './presets/timeseries';
import { resolveTransform, type NormalizedChartTransform } from './resolve-transform';

export type ExecutedHistogramTransform = {
    preset: 'histogram';
    attributes: ['label', 'count'];
    rows: HistogramBinRow[];
};

export type ExecutedTemporalEventsTransform = {
    preset: 'temporal-events';
    attributes: ['bucket', 'value'];
    rows: TemporalBucketRow[];
};

export type ExecutedTimeseriesTransform = {
    preset: 'timeseries';
    attributes: ['bucket', 'value'];
    rows: TimeseriesBucketRow[];
};

export type ExecutedChartTransform =
    | ExecutedHistogramTransform
    | ExecutedTemporalEventsTransform
    | ExecutedTimeseriesTransform;

/**
 * Runs a user-facing chart transform through the shared internal preset pipeline.
 */
export function executeTransform(rows: AutkDatum[], config: ChartTransformConfig): ExecutedChartTransform {
    return executeResolvedTransform(rows, resolveTransform(config));
}

/**
 * Runs a normalized chart transform and returns chart-ready rows plus axis attributes.
 */
export function executeResolvedTransform(
    rows: AutkDatum[],
    transform: NormalizedChartTransform
): ExecutedChartTransform {
    if (transform.preset === 'histogram') {
        return {
            preset: 'histogram',
            attributes: ['label', 'count'],
            rows: presetHistogram({
                rows,
                column: transform.attributes.value,
                numBins: transform.options.bins,
                divisor: transform.options.divisor,
                labelSuffix: transform.options.labelSuffix,
            }),
        };
    }

    if (transform.preset === 'temporal-events') {
        return {
            preset: 'temporal-events',
            attributes: ['bucket', 'value'],
            rows: presetEventsByResolution({
                rows,
                resolution: transform.options.resolution,
                reducer: transform.options.reducer,
                eventsOf: (row) => getArrayAtPath(row, transform.attributes.events),
                timestampOf: (event) => getTimestampValue(event, transform.attributes.timestamp, transform.fallbacks.timestamp),
                valueOf: transform.options.reducer === 'count'
                    ? undefined
                    : (event) => {
                        const value = getPathValue(event, transform.attributes.value, transform.fallbacks.value);
                        const numericValue = Number(value);
                        return Number.isFinite(numericValue) ? numericValue : null;
                    },
            }),
        };
    }

    return {
        preset: 'timeseries',
        attributes: ['bucket', 'value'],
        rows: presetTimeseriesAggregate({
            rows,
            reducer: transform.options.reducer,
            pointsOf: (row) => getTimeseriesPoints(row, transform),
        }),
    };
}

function getArrayAtPath(row: AutkDatum, path: string): unknown[] {
    const value = valueAtPath(row, path);
    return Array.isArray(value) ? value : [];
}

function getPathValue(target: unknown, explicitPath: string | null, fallbacks: string[]): unknown {
    if (!target || typeof target !== 'object') {
        return undefined;
    }

    if (explicitPath) {
        return valueAtPath(target as Record<string, unknown>, explicitPath);
    }

    for (const path of fallbacks) {
        const value = valueAtPath(target as Record<string, unknown>, path);
        if (value !== undefined && value !== null) {
            return value;
        }
    }

    return undefined;
}

function getTimestampValue(target: unknown, explicitPath: string | null, fallbacks: string[]): Date | string | number | null | undefined {
    const value = getPathValue(target, explicitPath, fallbacks);

    if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
        return value;
    }

    return undefined;
}

function getTimeseriesPoints(
    row: AutkDatum,
    transform: Extract<NormalizedChartTransform, { preset: 'timeseries' }>
): TimeseriesPoint[] {
    const sourceSeries = valueAtPath(row, transform.attributes.series);
    if (!Array.isArray(sourceSeries)) {
        return [];
    }

    const points: TimeseriesPoint[] = [];

    sourceSeries.forEach((point, index) => {
        if (typeof point === 'number' && Number.isFinite(point)) {
            points.push({
                timestamp: index,
                value: point,
            });
            return;
        }

        if (!point || typeof point !== 'object') {
            return;
        }

        const timestamp = getPathValue(point, transform.attributes.timestamp, transform.fallbacks.timestamp) ?? index;
        const rawValue = getPathValue(point, transform.attributes.value, transform.fallbacks.value);
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
            return;
        }

        points.push({
            timestamp: timestamp instanceof Date || typeof timestamp === 'string' || typeof timestamp === 'number'
                ? timestamp
                : index,
            value: numericValue,
        });
    });

    return points;
}
