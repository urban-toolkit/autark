import { FeatureCollection, Feature } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorFeatures2D extends Triangulator {

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

            comps.push({
                nPoints,
                nTriangles
            });
        }

        return [mesh, comps];
    }

}
