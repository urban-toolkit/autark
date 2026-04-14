import { FeatureCollection, Feature, Geometry, LineString, MultiLineString } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

import { lineOffset, lineString } from '@turf/turf';
import earcut from 'earcut';

export class TriangulatorRaster {
    static buildMesh(geotiff: FeatureCollection<Geometry | null>, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const bbox = geotiff.bbox;

        if (!bbox) {
            console.warn('GeoTIFF feature collection does not have a bounding box.');
            return [mesh, comps];
        }

        const p0 = [bbox[0] - origin[0], bbox[1] - origin[1]];
        const p1 = [bbox[2] - origin[0], bbox[1] - origin[1]];
        const p2 = [bbox[2] - origin[0], bbox[3] - origin[1]];
        const p3 = [bbox[0] - origin[0], bbox[3] - origin[1]];

        const flatCoords = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
        const texCoords = [0, 0, 1, 0, 1, 1, 0, 1];
        const flatIds = [0, 1, 2, 0, 2, 3];

        mesh.push({ 
            position: new Float32Array(flatCoords), 
            texCoord: new Float32Array(texCoords), 
            indices: new Uint32Array(flatIds) 
        });

        comps.push({ nPoints: flatCoords.length / 2, nTriangles: flatIds.length / 3 });

        return [mesh, comps];
    }

    static lineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const base = <LineString>feature.geometry;
        base.coordinates = base.coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);

        const top = lineOffset(base, offset).geometry.coordinates;
        const bot = lineOffset(base, -offset).geometry.coordinates;

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

            const top = lineOffset(base, offset).geometry.coordinates;
            const bot = lineOffset(base, -offset).geometry.coordinates;

            bot.forEach((cord: number[]) => top.unshift(cord));
            top.push(top[0]);

            const flatIds = earcut(top.flat());
            const flatCoords = top.map((cord: number[]) => [cord[0], cord[1]]).flat();

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }
}
