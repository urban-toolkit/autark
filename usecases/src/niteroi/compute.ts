import type { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from '@urban-toolkit/autk-compute';
import regressionShader from './regression.wgsl?raw';
import { BAND_COUNT, START_YEAR } from './config';

/** Convert the numeric GPU inputs to the timestamp/value format used by AutkPlot. */
export function prepareLstTimeseries(collection: FeatureCollection): FeatureCollection {
    return {
        ...collection,
        features: collection.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                lst_timeseries: ((feature.properties?.lst_timeseries ?? []) as number[]).map((value, i) => ({
                    timestamp: String(START_YEAR + i), value,
                })),
            },
        })),
    };
}

export async function computeLstRegression(roads: FeatureCollection): Promise<FeatureCollection> {
    const result = await new ComputeGpgpu().run({
        collection: roads,
        variableMapping: { bands: 'lst_timeseries' },
        attributeArrays: { bands: BAND_COUNT },
        outputColumns: ['angle', 'intercept'],
        wgslBody: regressionShader,
    });
    return prepareLstTimeseries(result);
}
