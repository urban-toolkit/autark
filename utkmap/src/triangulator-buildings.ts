import earcut from "earcut";

import { FeatureCollection, Feature, LineString } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";
import { AABB } from "./aabb";

export class TriangulatorBuildings extends Triangulator {
    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        this.translateFeatures(geojson, origin);
        const groups: Feature[][] = this.groupBuildings(geojson);

        // iterate over groups
        for (let gId = 0; gId < groups.length; gId++) {
            // creates a new componenet
            const component: ILayerComponent = {
                nPoints: 0,
                nTriangles: 0
            };

            // for each feature of the group
            for (const feature of groups[gId]) {
                const { coordinates } = <LineString>feature.geometry;

                // number of vertices
                const nVertsOnFeature = coordinates.length;

                // get the heights
                const heightInfo = TriangulatorBuildings.computeBuildingHeights(feature);
                if (!heightInfo.length) { continue; }

                // floor ----------------------------------------------------------------------
                const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], heightInfo[0]]).flat();
                const flatIds = earcut(coordinates.flat());
                // ----------------------------------------------------------------------------

                // roof -----------------------------------------------------------------------
                const flatCoordsRoof = flatCoords.map((el: number, id: number) => {
                    return (id % 3 === 2 ? heightInfo[1] : el);
                });
                for (let eId = 0; eId < flatCoordsRoof.length; eId++) {
                    flatCoords.push(flatCoordsRoof[eId]);
                }

                const flatIdsRoof = earcut(coordinates.flat()).map((el: number) => el + nVertsOnFeature);
                flatIdsRoof.forEach((el: number) => flatIds.push(el));
                // ----------------------------------------------------------------------------

                // walls ----------------------------------------------------------------------
                for (let eId = 0; eId < nVertsOnFeature; eId++) {
                    // current
                    flatCoords.push(flatCoords[3 * eId + 0]);
                    flatCoords.push(flatCoords[3 * eId + 1]);
                    flatCoords.push(flatCoords[3 * eId + 2]);

                    // next
                    flatCoords.push(flatCoords[3 * ((eId + 1) % nVertsOnFeature) + 0]);
                    flatCoords.push(flatCoords[3 * ((eId + 1) % nVertsOnFeature) + 1]);
                    flatCoords.push(flatCoords[3 * ((eId + 1) % nVertsOnFeature) + 2]);
                }

                for (let eId = 0; eId < nVertsOnFeature; eId++) {
                    // current
                    flatCoords.push(flatCoordsRoof[3 * eId + 0]);
                    flatCoords.push(flatCoordsRoof[3 * eId + 1]);
                    flatCoords.push(flatCoordsRoof[3 * eId + 2]);

                    // next
                    flatCoords.push(flatCoordsRoof[3 * ((eId + 1) % nVertsOnFeature) + 0]);
                    flatCoords.push(flatCoordsRoof[3 * ((eId + 1) % nVertsOnFeature) + 1]);
                    flatCoords.push(flatCoordsRoof[3 * ((eId + 1) % nVertsOnFeature) + 2]);
                }

                for (let vId = 0; vId < 2 * nVertsOnFeature - 1; vId += 2) {
                    const v0 = (2 * nVertsOnFeature) + vId;
                    const v1 = (2 * nVertsOnFeature) + vId + 1;

                    const v2 = v0 + 2 * nVertsOnFeature;
                    const v3 = v1 + 2 * nVertsOnFeature;

                    flatIds.push(...[v0, v1, v2, v2, v1, v3]);
                }
                // ----------------------------------------------------------------------------

                // Add mesh to geometry list
                mesh.push({
                    position: flatCoords,
                    indices: flatIds
                });

                // updates the component
                component.nPoints += flatCoords.length / 3;
                component.nTriangles += flatIds.length / 3;
            }

            // add component to components list
            comps.push(component);
        }

        return [mesh, comps];
    }

    static groupBuildings(geojson: FeatureCollection): Feature[][] {
        // checks if is a valid feature
        let filtered = TriangulatorBuildings.removeInvalidBuildingParts(geojson.features);

        // make the orientation consistent
        filtered = Triangulator.closeFeatures(filtered);
        filtered = Triangulator.fixOrientation(filtered);

        // builds the AABB
        const aabb = new AABB();
        aabb.buildFeatureBoxes(filtered);

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

    private static removeInvalidBuildingParts(features: Feature[]): Feature[] {

        const filtered = features.filter((feat: Feature) => {
            if (feat.properties === null) {
                return false;
            }

            if (feat.properties['building'] === 'roof' || feat.properties['building:part'] === 'roof') {
                return false;
            }

            if (!('height' in feat.properties) && !('levels' in feat.properties) && !('building:levels' in feat.properties)) {
                return false;
            }

            return true;
        });

        return filtered;
    }

    private static computeBuildingHeights(feature: Feature): number[] {
        const z_SCALE = 1.0;
        const FLOOR_HEIGHT = 3.4; // in meters

        const props = feature.properties;

        // unavailable building info
        if (props === null) {
            return [];
        }

        // height computation
        let height = 0;
        if ('height' in props) {
            height = props['height'];
        }
        else if ('levels' in props) {
            height = FLOOR_HEIGHT * props['levels'];
        }
        else if ('building:levels' in props) {
            height = FLOOR_HEIGHT * props['building:levels'];
        }

        // min height computation
        let min_height = 0;
        if ('min_height' in props) {
            min_height = props['min_height'];
        }
        else if ('min_level' in props) {
            min_height = FLOOR_HEIGHT * props['min_level'];
        }
        else if ('building:min_level' in props) {
            min_height = FLOOR_HEIGHT * props['building:min_level'];
        }

        return [z_SCALE * min_height, z_SCALE * height];
    }

}