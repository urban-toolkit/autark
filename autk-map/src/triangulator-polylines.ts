
import { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';

import { ILayerGeometry, ILayerComponent } from './interfaces';

import { lineOffset, lineString } from '@turf/turf';
import earcut from 'earcut';

/**
 * Class for triangulating polylines from GeoJSON features.
 * It provides methods to convert different geometry types into polyline meshes.
 */
export class TriangulatorPolylines {
    /**
     * The offset distance for the polyline extrusion.
     * @type {number}
     */
    static offset: number = 5;

    /**
     * Builds a mesh from GeoJSON features representing polylines.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[] = [];
        for (let fId = 0; fId < collection.length; fId++) {
            // gets the feature
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
                mesh.push({
                    position: triangulation.flatCoords,
                    indices: triangulation.flatIds
                });

                nPoints += triangulation.flatCoords.length / 2;
                nTriangles += triangulation.flatIds.length / 3;
            }
            comps.push({ nPoints, nTriangles });

        }
        return [mesh, comps];
    }


    /**
     * Converts a LineString feature to a polyline mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @param {number} offset The offset distance for the polyline extrusion
     * @returns {ILayerGeometry[]} An array of geometries
     */
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

    /**
     * Converts a MultiLineString feature to a polyline mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiLineString
     * @param {number[]} origin The origin point for translation
     * @param {number} offset The offset distance for the polyline extrusion
     * @returns {ILayerGeometry[]} An array of geometries
     */
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

            meshes.push({
                flatCoords,
                flatIds
            });
        }

        return meshes;
    }
}
