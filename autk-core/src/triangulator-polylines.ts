import { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';

import { LayerGeometry, LayerComponent } from './mesh-types';

import { lineOffset, lineString } from '@turf/turf';
import earcut from 'earcut';

export class TriangulatorPolylines {
    static offset: number = 5;

    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId = 0; fId < collection.length; fId++) {
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolylines.lineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolylines.multiLineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nTriangles = 0;

            for (const triangulation of meshes) {
                mesh.push({ position: triangulation.flatCoords, indices: triangulation.flatIds });
                nPoints += triangulation.flatCoords.length / 2;
                nTriangles += triangulation.flatIds.length / 3;
            }
            comps.push({ nPoints, nTriangles });
        }
        return [mesh, comps];
    }

    static lineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const base = <LineString>feature.geometry;
        base.coordinates = base.coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);

        const top = lineOffset(base, offset, { units: 'degrees' }).geometry.coordinates;
        const bot = lineOffset(base, -offset, { units: 'degrees' }).geometry.coordinates;

        bot.forEach((cord: number[]) => top.unshift(cord));
        top.push(top[0]);

        const flatIds = earcut(top.flat());
        const flatCoords = top.map((cord: number[]) => [cord[0], cord[1]]).flat();

        return [{ flatCoords, flatIds }];
    }

    static multiLineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const ls of coordinates) {
            const base = lineString(ls).geometry;
            base.coordinates = base.coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);

            const top = lineOffset(base, offset, { units: 'degrees' }).geometry.coordinates;
            const bot = lineOffset(base, -offset, { units: 'degrees' }).geometry.coordinates;

            bot.forEach((cord: number[]) => top.unshift(cord));
            top.push(top[0]);

            const flatIds = earcut(top.flat());
            const flatCoords = top.map((cord: number[]) => [cord[0], cord[1]]).flat();

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }
}
