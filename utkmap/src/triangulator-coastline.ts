import earcut from "earcut";

import { difference, featureCollection, multiPolygon, polygon } from "@turf/turf";
import { FeatureCollection, Feature, LineString, Position, Polygon } from "geojson";

import { AABB } from "./aabb";
import { Triangulator } from "./triangulator";
import { ILayerComponent, ILayerGeometry } from "./interfaces";


export abstract class TriangulatorCoastline extends Triangulator {

    static override buildMesh(geojson: FeatureCollection, origin: number[], bbox: Feature<Polygon>): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);
        const groups: Feature[][] = this.groupParts(geojson);

        // iterate over groups
        for (let gId = 0; gId < groups.length; gId++) {

            // invalid group
            if (groups[gId].length === 0) {
                console.error('Invalid coastiline group.');
                continue;
            }

            const boxSize = bbox.geometry.coordinates[0][2][0] - bbox.geometry.coordinates[0][0][0]
            const merge = this.mergeGroupGeometry(groups[gId], boxSize);

            const coastlinePast = polygon([merge]);
            
            const dif = difference(featureCollection([bbox, coastlinePast]));
    
            if (dif === null || dif instanceof multiPolygon) {
                console.error("Box and costline difference is null.");
                return [mesh, comps];
            }
    
            const difCoords = <Position[]>dif.geometry.coordinates[0];
            const difCoordsFlat = difCoords.flat();

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
        }

        return [mesh, comps];
    }

    static mergeGroupGeometry(group: Feature[], size: number): Position[] {
            // merged geometry
            const merge: Position[] = [];
            const { coordinates } = <LineString>group[0].geometry;

            merge.push(...coordinates);
            group.splice(0, 1);

            // for each feature of the group
            const cnt = group.length;

            for (let cId = 0; cId < cnt; cId++) {
                const mFrst  = merge[0];
                const mLast  = merge[merge.length - 1];

                for (let fId = 0; fId < group.length; fId++) {
                    const { coordinates } = <LineString>group[fId].geometry;

                    const cFrst  = coordinates[0];
                    const cLast  = coordinates[coordinates.length - 1];

                    if (cFrst[0] === mLast[0] && cFrst[1] === mLast[1]) {
                        merge.push(...coordinates);
                        group.splice(fId, 1);
                        break;
                    }
                    if (cLast[0] === mFrst[0] && cLast[1] === mFrst[1]) {
                        merge.unshift(...coordinates);
                        group.splice(fId, 1);
                        break;
                    }
                }
            }

            const mFrst  = merge[0];
            const mLast  = merge[merge.length - 1];
            if (mFrst[0] !== mLast[0] || mFrst[1] !== mLast[1] )  {
                const vec = [
                    -mLast[1] + mFrst[1],
                    -mFrst[0] + mLast[0]
                ];
                const pos = [
                    0.5 * ( mFrst[0] + mLast[0] ), 
                    0.5 * ( mFrst[1] + mLast[1] )
                ];
                const delta = 2 * size;
                
                // adds a very distant vertex
                merge.push([pos[0] + delta * vec[0], pos[1] + delta * vec[1]]);
                // closes the polygon
                merge.push(merge[0]);
            }

            return merge;
    }

    static groupParts(geojson: FeatureCollection): Feature[][] {
        // builds the AABB
        const aabb = new AABB();
        aabb.buildFeatureBoxes(geojson.features);

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
}
