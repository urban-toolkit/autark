import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

import { ComputeGpgpu, ComputeRender } from '@urban-toolkit/autk-compute';
import scoreShader from './score.wgsl?raw';

export const SCORE_FIELD = 'compute.score';
export const ROAD_SKY_VIEW_FIELD = 'compute.skyViewFactor';
export const SKY_EXPOSURE_FIELD = 'sjoin.avg.skyExposure';
const SKY_EXPOSURE_RAW_KEY = 'table_osm_roads.compute.skyViewFactor';
const SKY_EXPOSURE_NORM_RAW_KEY = 'table_osm_roads.compute.skyViewFactor_norm';

type UrbaneFeature = Feature<Geometry, GeoJsonProperties>;

type UrbaneFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

type UrbaneProperties = GeoJsonProperties & {
    compute?: {
        render?: {
            classes?: {
                sky?: number,
            },
        },
        skyViewFactor?: number,
    },
    sjoin?: {
        count?: Record<string, number>,
        avg?: Record<string, number>,
    },
    scoreInputs?: number[],
};

function getProperties(feature: UrbaneFeature): UrbaneProperties {
    return (feature.properties ??= {}) as UrbaneProperties;
}

export async function computeRoadSkyView(
    buildings: FeatureCollection,
    roads: FeatureCollection,
): Promise<FeatureCollection> {
    const roadsWithSkyClasses = await new ComputeRender().run({
        layers: [{
            id: 'table_osm_buildings',
            collection: buildings,
            type: 'buildings',
        }],
        viewpoints: {
            collection: roads,
            sampling: { directions: 1 },
        },
        aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
        tileSize: 64,
    });

    return {
        ...roadsWithSkyClasses,
        features: roadsWithSkyClasses.features.map((road: UrbaneFeature) => {
            const properties = getProperties(road);
            return {
                ...road,
                properties: {
                    ...properties,
                    compute: {
                        ...(properties.compute ?? {}),
                        skyViewFactor: Number(properties.compute?.render?.classes?.sky ?? 0),
                    },
                },
            };
        }),
    };
}

export function decorateSkyExposureFields(geojson: UrbaneFeatureCollection): UrbaneFeatureCollection {
    for (const feature of geojson.features) {
        const properties = getProperties(feature);
        const sjoin = (properties.sjoin ??= {});
        const avg = (sjoin.avg ??= {});
        if (avg.skyExposure == null) {
            avg.skyExposure = avg[SKY_EXPOSURE_RAW_KEY] ?? 0;
        }
        if (avg.skyExposure_norm == null) {
            avg.skyExposure_norm = avg[SKY_EXPOSURE_NORM_RAW_KEY] ?? 0;
        }
    }

    return geojson;
}

export async function computeScore(
    geojson: UrbaneFeatureCollection,
    datasets: string[],
    weights: number[],
    skyExposureWeight: number,
): Promise<FeatureCollection> {
    if (weights.length !== datasets.length || [...weights, skyExposureWeight].some((weight) => !Number.isFinite(weight) || weight < 0)) {
        throw new Error('Provide one finite, non-negative weight per dataset and for sky exposure.');
    }
    decorateSkyExposureFields(geojson);
    const invertedDatasets = new Set(['arrest', 'noise']);
    const inputLength = datasets.length + 1;

    for (const feature of geojson.features) {
        const properties = getProperties(feature);
        const values = datasets.map((dataset) => {
            const value = properties.sjoin?.count?.[`${dataset}_norm`] ?? 0;
            return invertedDatasets.has(dataset) ? 1 - value : value;
        });
        values.push(properties?.sjoin?.avg?.skyExposure_norm ?? 0);
        properties.scoreInputs = values;
    }

    return new ComputeGpgpu().run({
        collection: geojson,
        variableMapping: { vals: 'scoreInputs' },
        attributeArrays: { vals: inputLength },
        uniformArrays: { weights: [...weights, skyExposureWeight] },
        resultField: 'score',
        wgslBody: scoreShader,
    });
}
