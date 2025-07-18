import { polygonize } from "@turf/polygonize";
import { FeatureCollection, Feature, LineString } from "geojson";

import { Triangulator } from "./triangulator";
import { ILayerComponent, ILayerGeometry } from "./interfaces";

/**
 * Class for triangulating surfaces from GeoJSON features.
 * It provides methods to convert different geometry types into surface meshes.
 */
export abstract class TriangulatorSureface extends Triangulator {

    /**
     * Builds a mesh from GeoJSON features representing land surface.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @param {Feature<Polygon | MultiPolygon>} bbox The bounding box feature
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        let meshes: { flatCoords: number[], flatIds: number[] }[] = [];

        const polys = polygonize(geojson as FeatureCollection<LineString>);

        const collection: Feature[] = polys['features'];
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