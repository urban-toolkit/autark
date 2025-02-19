import earcut from 'earcut';
import { booleanClockwise } from '@turf/boolean-clockwise';

import { AABB } from './util';
import { ILayerGeometry } from "./interfaces";

import { Feature, FeatureCollection, LineString } from 'geojson';

export class Triangulator {

    static createFeaturesLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
        const mesh: ILayerGeometry[] = [];

        // translate based on origin
        this.translateFeatures(geojson, origin);
        const collection: Feature[] = geojson['features'];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
            const flatIds = earcut(coordinates.flat())

            mesh.push({
                position: flatCoords,
                indices: flatIds
            });
        }

        return mesh;
    }

    static createBuildingsLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
        const mesh: ILayerGeometry[] = [];

        // translate based on origin
        this.translateFeatures(geojson, origin);
        const collection: Feature[] = this.groupBuildings(geojson);

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            // number of vertices
            const nVertsOnFeature = coordinates.length;

            // get the heights
            const heightInfo = Triangulator.getBuildingHeight(feature);
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

            // Add feature to mesh list
            mesh.push({
                position: flatCoords,
                indices: flatIds
            });
        }

        return mesh;
    }

    static groupBuildings(geojson: FeatureCollection): Feature[] {
        const aabb = new AABB();
        aabb.build(geojson);

        const features = [];

        for (const box of aabb.boxes) {
            let group = box[1].feats;

            // checks if is a valid feature
            group = Triangulator.removeRedundancy(group);

            // make the orientation consistent
            group = Triangulator.adjustGeometry(group);

            // add to the features list
            features.push(...group);
        }

        return features;
    }

    private static translateFeatures(geojson: FeatureCollection, origin: number[]) {
        const collection = geojson['features'];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            for(let cId=0; cId < coordinates.length; cId++) {
                const coords = coordinates[cId];
                coords[0] -= origin[0];
                coords[1] -= origin[1];
            }
        }
    }

    private static removeRedundancy(features: Feature[]): Feature[] {

        const filtered = features.filter( (feat: Feature) => {
            if (feat.properties === null) {
                return false;
            }
    
            if (feat.properties['building'] === 'roof' || feat.properties['building:part'] === 'roof') {
                return false;
            }

            if ( !('height' in feat.properties) && !('levels' in feat.properties) && !('building:levels' in feat.properties) ) {
                return false;
            }

            return true;
        });

        return filtered;
    }

    private static adjustGeometry(features: Feature[]): Feature[] {

        for (const feature of features) {
            let { coordinates } = <LineString>feature.geometry;

            // makes the linestrings orientation consistent
            if ( booleanClockwise(coordinates) ){
                coordinates = coordinates.reverse();
            }

            // removes the last vertex if duplicated
            let len = coordinates.length;
            if (coordinates[0][0] === coordinates[len - 1][0] && coordinates[0][1] === coordinates[len - 1][1]) {
                coordinates.pop();
                len -= 1;
            }
        }

        return features;
    }

    private static getBuildingHeight(feature: Feature): number[] {
        const FLOOR_HEIGHT = 3.4; // in meters
        const z_SCALE = 1.0;

        const props = feature.properties;

        // unavailable building info
        if (props === null) {
            return [];
        }

        // height computation
        let height = 0;
        if (('height' in props)) {
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
        if (('min_height' in props)) {
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