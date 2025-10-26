
import { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';

import { ILayerGeometry, ILayerComponent } from './interfaces';

import { lineOffset, lineString } from '@turf/turf';
import earcut from 'earcut';

/**
 * Class for triangulating polylines from GeoJSON features.
 * It provides methods to convert different geometry types into polyline meshes.
 */
export class TriangulatorRaster {

    /**
     * Builds a mesh from GeoJSON features representing polylines.
     * @param {FeatureCollection} geotiff The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(geotiff: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        const bbox = geotiff.bbox;

        if (!bbox) {
            console.warn('GeoTIFF feature collection does not have a bounding box.');
            return [mesh, comps];
        }

        const p0 = [bbox[0] - origin[0], bbox[1] - origin[1]];
        const p1 = [bbox[2] - origin[0], bbox[1] - origin[1]];
        const p2 = [bbox[2] - origin[0], bbox[3] - origin[1]];
        const p3 = [bbox[0] - origin[0], bbox[3] - origin[1]];

        const flatCoords = [p0[0] , p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
        const texCoords = [0, 0, 1, 0, 1, 1, 0, 1];

        const flatIds = [0, 1, 2, 0, 2, 3];

        mesh.push({ 
            position: flatCoords,
            texCoord: texCoords,
            indices: flatIds 
        });

        const nPoints = flatCoords.length / 2;
        const nTriangles = flatIds.length / 3;

        comps.push({ nPoints, nTriangles });

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

        const top = lineOffset(base, offset).geometry.coordinates;
        const bot = lineOffset(base, -offset).geometry.coordinates;

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

            const top = lineOffset(base, offset).geometry.coordinates;
            const bot = lineOffset(base, -offset).geometry.coordinates;

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
