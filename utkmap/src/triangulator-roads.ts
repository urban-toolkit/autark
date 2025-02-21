import earcut from "earcut";
import { lineOffset } from '@turf/turf';

import { FeatureCollection, Feature, LineString } from "geojson";

import { ILayerGeometry, ILayerComponent } from "./interfaces";
import { Triangulator } from "./triangulator";

export class TriangulatorRoads extends Triangulator {

    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);

        let collection: Feature[] = geojson['features'];

        collection = Triangulator.closeFeatures(collection);
        collection = Triangulator.fixOrientation(collection);

        for (const feature of collection) {
            const base = <LineString>feature.geometry;

            const top = lineOffset(base, 1, { units: "meters"}).geometry.coordinates;
            const bot = lineOffset(base,-1, { units: "meters"}).geometry.coordinates;

            bot.forEach((cord: number[]) => top.push(cord));

            const flatIds = earcut(top.flat())
            const flatCoords = top.map((cord: number[]) => [cord[0], cord[1], 0]).flat();

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
    };

}
