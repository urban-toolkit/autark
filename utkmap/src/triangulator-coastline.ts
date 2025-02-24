import earcut from "earcut";

import { difference, featureCollection, multiPolygon, polygon } from "@turf/turf";
import { FeatureCollection, Feature, LineString, Position } from "geojson";

import { AABB } from "./aabb";
import { Triangulator } from "./triangulator";
import { ILayerComponent, ILayerGeometry } from "./interfaces";

export abstract class TriangulatorCoastline extends Triangulator {

    static  buildMesh2(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);
        const groups: Feature[][] = this.groupParts(geojson);

        console.log(groups);

        // for (let gId = 0; gId < groups.length; gId++) {
        //     // creates a new componenet
        //     const component: ILayerComponent = {
        //         nPoints: 0,
        //         nTriangles: 0
        //     };


        // }

        return [mesh, comps];
    }

    static groupParts(geojson: FeatureCollection): Feature[][] {
        const fixed = Triangulator.fixOrientation(geojson.features);

        // builds the AABB
        const aabb = new AABB();
        aabb.buildFeatureBoxes(fixed);

        const features = [];
        for (const box of aabb.boxes) {
            const group = box[1].feats;

            // empty group
            if (group.length === 0) {
                continue;
            }

            // add to the features list
            features.push([...group]);
        }

        return features;
    }


    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);

        const merge: Position[][] = [];
        const collection: Feature[] = geojson['features'];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            const frst  = coordinates[0];
            const last  = coordinates[coordinates.length - 1];

            if (frst[0] === last[0] && frst[1] === last[1]) {
                console.log("skip for now. Closed linestring.")
                continue;
            }

            let found = false;
            for (const parts of merge) {
                if (parts[0][0] === last[0] && parts[0][1] === last[1]) {
                    parts.unshift(...coordinates);
                    found = true;

                    break;
                }
                if (parts[parts.length - 1][0] === frst[0] && parts[parts.length - 1][1] === frst[1]) {
                    parts.push(...coordinates);
                    found = true;

                    break;
                }
            }

            if (!found) {
                merge.push(coordinates);
            }
        }

        let lastLen = -1;
        while (merge.length !== 1 && lastLen !== merge.length) {
            const coordinates = merge[0];

            const frst  = coordinates[0];
            const last  = coordinates[coordinates.length - 1];

            lastLen = merge.length;

            for (let pId = 1; pId < merge.length; pId++) {
                const parts = merge[pId];

                if (parts[0][0] === last[0] && parts[0][1] === last[1]) {
                    coordinates.push(...parts);
                    merge.splice(pId, 1);

                    break;
                }
                if (parts[parts.length - 1][0] === frst[0] && parts[parts.length - 1][1] === frst[1]) {
                    coordinates.unshift(...parts);
                    merge.splice(pId, 1);

                    break;
                }
            }
        }

        const BOX_SIZE = -1800;
        const box = polygon([
            [
                [-BOX_SIZE,-BOX_SIZE],
                [-BOX_SIZE, BOX_SIZE],
                [ BOX_SIZE, BOX_SIZE],
                [ BOX_SIZE,-BOX_SIZE],
                [-BOX_SIZE,-BOX_SIZE],
            ]
        ]);

        merge[0].push(merge[0][0]);
        const coast = polygon(merge);
        const dif = difference(featureCollection([box, coast]));

        if (dif === null) {
            console.error("Box and costline difference is null.");
            return [mesh, comps];
        }

        if (dif instanceof multiPolygon) {
            return [mesh, comps];
        }

        const difCoords = <Position[]>dif.geometry.coordinates[0];
        const difCoordsFlat = difCoords.flat();

        console.log(difCoords);
        console.log(difCoordsFlat);

        const flatIds = earcut(difCoordsFlat);
        const flatCoords = difCoords.map(
            (cord: number[]) => [cord[0], cord[1], 0]
        ).flat();

        mesh.push({
            position: flatCoords,
            indices: flatIds
        });

        comps.push({
            nPoints: flatCoords.length / 3,
            nTriangles: flatIds.length / 3
        });


        // for (const parts of merge) {
        //     const flatIds = earcut(parts.flat());
        //     const flatCoords = parts.map((cord: number[]) => [cord[0], cord[1], 0]).flat();

        //     mesh.push({
        //         position: flatCoords,
        //         indices: flatIds
        //     });

        //     comps.push({
        //         nPoints: flatCoords.length / 3,
        //         nTriangles: flatIds.length / 3
        //     });
        // }

        return [mesh, comps];
    }
}
