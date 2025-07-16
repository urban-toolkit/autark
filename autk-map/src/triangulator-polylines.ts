import earcut from 'earcut';
import { lineOffset } from '@turf/turf';

import { FeatureCollection, Feature, LineString } from 'geojson';

import { ILayerGeometry, ILayerComponent } from './interfaces';
import { Triangulator } from './triangulator';

export class TriangulatorPolylines extends Triangulator {
    static offset: number = 300;

    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        for (const feature of collection) {
            const base = <LineString>feature.geometry;
            base.coordinates = base.coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);

            const top = lineOffset(base,  TriangulatorPolylines.offset).geometry.coordinates;
            const bot = lineOffset(base, -TriangulatorPolylines.offset).geometry.coordinates;

            bot.forEach((cord: number[]) => top.unshift(cord));
            top.push(top[0]);

            const flatIds = earcut(top.flat());
            const flatCoords = top.map((cord: number[]) => [cord[0], cord[1]]).flat();

            mesh.push({
                position: flatCoords,
                indices: flatIds,
            });

            comps.push({
                nPoints: flatCoords.length / 2,
                nTriangles: flatIds.length / 3,
            });
        }

        return [mesh, comps];
    }
}
