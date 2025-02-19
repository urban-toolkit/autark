import earcut from "earcut";

import { FeatureCollection, Feature, LineString } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorFeatures2D extends Triangulator {

    static buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);

        let collection: Feature[] = geojson['features'];
        collection = Triangulator.fixFeatureGeometry(collection);

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
            const flatIds = earcut(coordinates.flat())

            mesh.push({
                position: flatCoords,
                indices: flatIds
            });

            comps.push({
                nPoints: flatCoords.length / 3,
                nTriangles: flatIds.length / 3
            });
        }

        return [mesh, comps];
    }
}
