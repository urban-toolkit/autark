import { FeatureCollection, Feature, BBox } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";

/**
 * Class for triangulating polygons from GeoJSON features.
 * It provides methods to convert different geometry types into polygon meshes.
 */
export class TriangulatorPolygons extends Triangulator {
    /**
     * Builds a mesh from GeoJSON features representing polygons.
     * @param {number} nx The number of divisions in the x-direction
     * @param {number} ny The number of divisions in the y-direction
     * @param {BBox} bbox The bounding box defining the area to triangulate
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildGrid(nx: number, ny: number, bbox: BBox) : { flatCoords: number[], flatIds: number[] } {
        const flatCoords = [];
        const flatIds = [];

        const xStep = (bbox[2] - bbox[0]) / nx;
        const yStep = (bbox[3] - bbox[1]) / ny;

        for (let i = 0; i <= nx; i++) {
            for (let j = 0; j <= ny; j++) {
                flatCoords.push(bbox[0] + i * xStep, bbox[1] + j * yStep);
            }
        }

        for (let i = 0; i < nx; i++) {
            for (let j = 0; j < ny; j++) {
                const a = i * (ny + 1) + j;
                const b = a + 1;
                const c = a + ny + 1;
                const d = c + 1;

                flatIds.push(a, b, c, b, d, c);
            }
        }

        return { flatCoords, flatIds };
    }

    /**
     * Builds a mesh from GeoJSON features representing polygons.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        let meshes: { flatCoords: number[], flatIds: number[] }[] = [];

        const collection: Feature[] = geojson['features'];
        for (let fId=0; fId<collection.length; fId++) {
            // gets the feature
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                meshes = Triangulator.lineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = Triangulator.multiLineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'Polygon') {
                meshes = Triangulator.polygonToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiPolygon') {
                meshes = Triangulator.multiPolygonToMesh(feature, origin);

            }
            else {
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

            comps.push({nPoints, nTriangles});
        }

        return [mesh, comps];
    }
}
