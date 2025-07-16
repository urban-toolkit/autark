import earcut from 'earcut';
import { lineOffset } from '@turf/turf';

import { FeatureCollection, Feature, LineString } from 'geojson';

import { ILayerGeometry, ILayerComponent } from './interfaces';
import { Triangulator } from './triangulator';

/**
 * Class for triangulating polylines from GeoJSON features.
 * It provides methods to convert different geometry types into polyline meshes.
 */
export class TriangulatorPolylines extends Triangulator {
    /**
     * The offset distance for the polyline extrusion.
     * @type {number}
     */
    static offset: number = 300;

    /**
     * Builds a mesh from GeoJSON features representing polylines.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
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
