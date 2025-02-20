import earcut from "earcut";

import { FeatureCollection, Feature, LineString } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";
import { booleanClockwise } from "@turf/turf";

export abstract class TriangulatorCoastline extends Triangulator {

    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);

        let collection: Feature[] = geojson['features'];
        collection = Triangulator.fixFeatureGeometry(collection);

        const merge = [];
        for (const feature of collection) {
            let { coordinates } = <LineString>feature.geometry;

            // makes the linestrings orientation consistent
            if ( booleanClockwise(coordinates) ){
                coordinates = coordinates.reverse();
            }

            merge.push(...coordinates);
        }

        const flatIds = earcut(merge.flat());
        const flatCoords = merge.map((cord: number[]) => [cord[0], cord[1], 0]).flat();

        mesh.push({
            position: flatCoords,
            indices: flatIds
        });

        comps.push({
            nPoints: flatCoords.length / 3,
            nTriangles: flatIds.length / 3
        });

        console.log(mesh);

        return [mesh, comps];
    }
}
