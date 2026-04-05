import type { AutkDatum, ChartTransformConfig } from '../api';
import { runHistogram, type ExecutedHistogramTransform } from './presets/histogram';
import { runTemporal, type ExecutedTemporalTransform } from './presets/temporal';
import { runTimeseries, type ExecutedTimeseriesTransform } from './presets/timeseries';

export * from './kernel';
export * from './presets/histogram';
export * from './presets/temporal';
export * from './presets/timeseries';

export type ExecutedChartTransform =
    | ExecutedHistogramTransform
    | ExecutedTemporalTransform
    | ExecutedTimeseriesTransform;

/**
 * Runs a chart transform config through the preset pipeline.
 */
export function run(rows: AutkDatum[], config: ChartTransformConfig): ExecutedChartTransform {
    if (config.preset === 'histogram') return runHistogram(rows, config);
    if (config.preset === 'temporal') return runTemporal(rows, config);
    return runTimeseries(rows, config);
}
