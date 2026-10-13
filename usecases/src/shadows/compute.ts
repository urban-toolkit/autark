import type { FeatureCollection } from 'geojson';
import { ComputeGpgpu } from '@urban-toolkit/autk-compute';
import shadowShader from './shadow.wgsl?raw';
import { MONTH_DOY, type MonthCode } from './utils';

/** Return a result, rather than mutating roads: the app can reject obsolete runs. */
export async function computeShadows(
    roads: FeatureCollection, footprint: number[][], height: number, month: MonthCode,
): Promise<FeatureCollection> {
    return new ComputeGpgpu().run({
        collection: roads,
        variableMapping: { seg: 'geometry.coordinates', sjoin_avg: `sjoin.avg.shadows.${month}` },
        attributeMatrices: { seg: { rows: 'auto', cols: 2 } },
        uniforms: { bld_height: height, doy: MONTH_DOY[month] },
        uniformMatrices: { ring: { data: footprint, cols: 2 } },
        outputColumns: ['shadow', 'contribution'],
        wgslBody: shadowShader,
    });
}
