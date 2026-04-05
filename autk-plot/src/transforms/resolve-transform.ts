import type {
    ChartTransformConfig,
    HistogramTransformConfig,
    TemporalEventsTransformConfig,
    TimeseriesTransformConfig,
    TransformReducer,
    TransformResolution,
} from '../api';

export type NormalizedHistogramTransform = {
    preset: 'histogram';
    attributes: {
        value: string;
    };
    options: {
        bins: number;
    };
};

export type NormalizedTemporalEventsTransform = {
    preset: 'temporal-events';
    attributes: {
        events: string;
        timestamp: string | null;
        value: string | null;
    };
    options: {
        resolution: TransformResolution;
        reducer: TransformReducer;
    };
    fallbacks: {
        timestamp: string[];
        value: string[];
    };
};

export type NormalizedTimeseriesTransform = {
    preset: 'timeseries';
    attributes: {
        series: string;
        timestamp: string | null;
        value: string | null;
    };
    options: {
        reducer: TransformReducer;
    };
    fallbacks: {
        timestamp: string[];
        value: string[];
    };
};

export type NormalizedChartTransform =
    | NormalizedHistogramTransform
    | NormalizedTemporalEventsTransform
    | NormalizedTimeseriesTransform;

const DEFAULT_TEMPORAL_TIMESTAMP_FALLBACKS = ['timestamp', 'time', 'date', 'createdAt', 'created_at'];
const DEFAULT_TEMPORAL_VALUE_FALLBACKS = ['value', 'y', 'avg', 'val', 'weight'];
const DEFAULT_TIMESERIES_TIMESTAMP_FALLBACKS = ['timestamp', 'time', 'date', 'x', 'index'];
const DEFAULT_TIMESERIES_VALUE_FALLBACKS = ['value', 'y', 'avg', 'val'];

function normalizeHistogramTransform(config: HistogramTransformConfig): NormalizedHistogramTransform {
    return {
        preset: 'histogram',
        attributes: {
            value: config.attributes.value,
        },
        options: {
            bins: config.options?.bins ?? 10,
        },
    };
}

function normalizeTemporalEventsTransform(config: TemporalEventsTransformConfig): NormalizedTemporalEventsTransform {
    return {
        preset: 'temporal-events',
        attributes: {
            events: config.attributes.events,
            timestamp: config.attributes.timestamp ?? null,
            value: config.attributes.value ?? null,
        },
        options: {
            resolution: config.options?.resolution ?? 'month',
            reducer: config.options?.reducer ?? 'count',
        },
        fallbacks: {
            timestamp: DEFAULT_TEMPORAL_TIMESTAMP_FALLBACKS,
            value: DEFAULT_TEMPORAL_VALUE_FALLBACKS,
        },
    };
}

function normalizeTimeseriesTransform(config: TimeseriesTransformConfig): NormalizedTimeseriesTransform {
    return {
        preset: 'timeseries',
        attributes: {
            series: config.attributes.series,
            timestamp: config.attributes.timestamp ?? null,
            value: config.attributes.value ?? null,
        },
        options: {
            reducer: config.options?.reducer ?? 'avg',
        },
        fallbacks: {
            timestamp: DEFAULT_TIMESERIES_TIMESTAMP_FALLBACKS,
            value: DEFAULT_TIMESERIES_VALUE_FALLBACKS,
        },
    };
}

/**
 * Resolves user-facing transform config into a normalized internal shape with defaults.
 */
export function resolveTransform(config: ChartTransformConfig): NormalizedChartTransform {
    if (config.preset === 'histogram') {
        return normalizeHistogramTransform(config);
    }
    if (config.preset === 'temporal-events') {
        return normalizeTemporalEventsTransform(config);
    }
    return normalizeTimeseriesTransform(config);
}
