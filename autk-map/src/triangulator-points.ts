import { FeatureCollection, Feature, Point, MultiPoint  } from 'geojson';

import { ILayerGeometry, ILayerComponent } from './interfaces';

/**
 * Class for triangulating points from GeoJSON features.
 * It provides methods to convert different geometry types into point meshes.
 */
export class TriangulatorPoints {
    /**
     * Builds a mesh from GeoJSON features representing points.
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

            if (feature.geometry.type === 'Point') {
                meshes = TriangulatorPoints.pointToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiPoint') {
                meshes = TriangulatorPoints.multiPointToMesh(feature, origin);
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

    //---------------------------------------------------------------------------    

    /**
     * Converts a Point feature to a mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a Point
     * @param {number[]} origin The origin point for translation
     * @returns {{ flatCoords: number[], flatIds: number[] }[]} An array containing the flat coordinates and indices
     */
    static pointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Point>feature.geometry;

        const res = 40;

        const flatCoords = TriangulatorPoints.sampleCircle(
            coordinates[0] - origin[0],
            coordinates[1] - origin[1],
            100,
            res
        ).flat();

        const flatIds = [];
        for (let i = 1; i <= res; i++) {
            flatIds.push(0, i, i % res + 1);
        }

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a MultiPoint feature to a mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiPoint
     * @param {number[]} origin The origin point for translation
     * @returns {{ flatCoords: number[], flatIds: number[] }[]} An array containing the flat coordinates and indices
     */
    static multiPointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiPoint>feature.geometry;

        const res = 10;

        const meshes = [];
        for (const coord of coordinates) {
            const flatCoords = TriangulatorPoints.sampleCircle(
                coord[0] - origin[0],
                coord[1] - origin[1],
                100,
                res
            ).flat();

            const flatIds = [];
            for (let i = 1; i <= res; i++) {
                flatIds.push(0, i, i % res + 1);
            }

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

    /**
     * Samples points on a circle.
     * @param {number} centerX The x-coordinate of the circle's center
     * @param {number} centerY The y-coordinate of the circle's center
     * @param {number} radius The radius of the circle
     * @param {number} numPoints The number of points to sample on the circle
     * @returns {[number, number][]} An array of sampled points as [x, y] tuples
     */
    static sampleCircle(centerX: number, centerY: number, radius: number, numPoints: number): [number, number][] {
        const points: [number, number][] = [[centerX, centerY]];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI; // Calculate angle in radians
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            points.push([x, y]);
        }
        return points;
    }
}