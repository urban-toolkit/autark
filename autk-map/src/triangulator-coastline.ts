import earcut from "earcut";

import { difference, featureCollection, polygon } from "@turf/turf";
import { FeatureCollection, Feature, LineString, Position, Polygon, MultiPolygon } from "geojson";

import { AABB } from "./aabb";
import { Triangulator } from "./triangulator";
import { ILayerComponent, ILayerGeometry } from "./interfaces";

/**
 * Class for triangulating coastlines from GeoJSON features.
 * It provides methods to convert different geometry types into coastline meshes.
 */
export abstract class TriangulatorCoastline extends Triangulator {
    /**
     * Builds a mesh from GeoJSON features representing coastlines.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @param {Feature<Polygon | MultiPolygon>} bbox The bounding box feature
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static override buildMesh(geojson: FeatureCollection, origin: number[], bbox: Feature<Polygon | MultiPolygon>): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);
        const groups: Feature[][] = this.groupParts(geojson);

        let croppedBox = bbox;

        // iterate over groups
        for (let gId = 0; gId < groups.length; gId++) {

            // invalid group
            if (groups[gId].length === 0) {
                console.error('Invalid coastiline group.');
                continue;
            }

            const merge = this.mergeGroupGeometry(groups[gId]);
            const coastlinePast = polygon([merge]);
            const dif = difference(featureCollection([croppedBox, coastlinePast]));

            if (dif === null) {
                console.error("Box and costline difference is null.");
                continue;
            }
            croppedBox = dif;
        }

        const flatCoords: number[] = [];

        const holes: number[] = [];
        if (croppedBox.geometry.type === "Polygon") {
            (croppedBox.geometry.coordinates as Position[][]).reduce((accum: number, curr: Position[]) => {
                flatCoords.push(...curr.flat());

                const nv = accum + curr.length;
                holes.push(nv);

                return nv;
            }, 0);
        }

        // last hole is from vertex with id holes[id-1] to the end of the flatCoords array 
        holes.pop(); 
        const flatIds = earcut(flatCoords, holes);

        mesh.push({
            position: flatCoords,
            indices: flatIds
        });

        comps.push({
            nPoints: flatCoords.length / 2,
            nTriangles: flatIds.length / 3
        });


        return [mesh, comps];
    }

    /**
     * Merges the geometry of a group of features into a single array of positions.
     * @param {Feature[]} group The array of GeoJSON features
     * @returns {Position[]} An array of merged positions
     */
    private static mergeGroupGeometry(group: Feature[]): Position[] {
        // merged geometry
        const merge: Position[] = [];
        const { coordinates } = <LineString>group[0].geometry;

        merge.push(...coordinates);
        group.splice(0, 1);

        // for each feature of the group
        const cnt = group.length;

        for (let cId = 0; cId < cnt; cId++) {
            const mFrst = merge[0];
            const mLast = merge[merge.length - 1];

            for (let fId = 0; fId < group.length; fId++) {
                const { coordinates } = <LineString>group[fId].geometry;

                const cFrst = coordinates[0];
                const cLast = coordinates[coordinates.length - 1];

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

        const mFrst = merge[0];
        const mLast = merge[merge.length - 1];
        if (mFrst[0] !== mLast[0] || mFrst[1] !== mLast[1]) {
            const vecFrst = [
                merge[0][0] - merge[1][0],
                merge[0][1] - merge[1][1]
            ];

            const vecLast = [
                merge[merge.length - 1][0] - merge[merge.length - 2][0],
                merge[merge.length - 1][1] - merge[merge.length - 2][1]
            ];

            // TODO: PROBABLY NOT THE BEST WAY TO CLOSE THE POLYGON
            // adds two very distant vertex in the direction of the last and first vertex
            const delta = Number.MAX_SAFE_INTEGER;
            merge.push([mLast[0] + delta * vecLast[0], mLast[1] + delta * vecLast[1]]);
            merge.push([mFrst[0] + delta * vecFrst[0], mFrst[1] + delta * vecFrst[1]]);

            // closes the polygon
            merge.push(merge[0]);
        }

        return merge;
    }

    /**
     * Groups the features based on their AABB.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @returns {Feature[][]} An array of grouped features
     */
    private static groupParts(geojson: FeatureCollection): Feature[][] {
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
