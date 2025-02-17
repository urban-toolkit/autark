import earcut from 'earcut';

import { ILayerGeometry } from "./interfaces";
import { Feature, FeatureCollection, LineString, Position } from 'geojson';


export abstract class Triangulator {

    static createFeaturesLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
        const mesh: ILayerGeometry[] = [];
        const collection: Feature[] = geojson['features'];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], 0])
                .flat()
                .map((el: number, id: number) => {
                    return el - origin[id % 3];
                });

            const flatIds = earcut(coordinates.flat())

            mesh.push({
                position: flatCoords,
                indices: flatIds
            });
        }

        return mesh;
    }

    // static createRoadsLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
    //     return [];
    // }


    static createBuildingsLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
        const mesh: ILayerGeometry[] = [];
        const collection: Feature[] = geojson['features'];

        const debug = [];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            // fix the orientation
            const rawCoords = Triangulator.orientCoordinates(coordinates);

            // checks if is a valid feature
            if (!this.isValidBuilding(feature)) {
                continue;
            }

            // get the heights
            const heightInfo = Triangulator.getBuildingHeight(feature);
            if (!heightInfo.length) { continue; }

            // number of vertices
            const nVertsOnFeature = rawCoords.length;

            // floor ----------------------------------------------------------------------
            const flatCoords = rawCoords.map((cord: number[]) => [cord[0], cord[1], heightInfo[0]])
                .flat()
                .map((el, id: number) => {
                    return el - origin[id % 3];
                });

            // roof ----------------------------------------------------------------------
            const flatCoordsRoof = flatCoords.map((el: number, id: number) => {
                return (id % 3 === 2 ? heightInfo[1] : el);
            });
            for (let eId = 0; eId < flatCoordsRoof.length; eId++) {
                flatCoords.push(flatCoordsRoof[eId]);
            }

            const flatIdsRoof = earcut(rawCoords.flat()).map((el: number) => el + nVertsOnFeature);

            // walls ----------------------------------------------------------------------
            const flatCoordsWall = flatCoords.map((el: number) => el);

            for (let eId = 0; eId < flatCoordsWall.length; eId++) {
                flatCoords.push(flatCoordsWall[eId]);
            }

            for (let vId = 0; vId < nVertsOnFeature; vId++) {
                const v0 = (2 * nVertsOnFeature) + vId;
                const v1 = (2 * nVertsOnFeature) + (vId + 1) % nVertsOnFeature;

                const v2 = v0 + nVertsOnFeature;
                const v3 = v1 + nVertsOnFeature;

                flatIdsRoof.push(...[v0, v1, v2, v2, v1, v3]);
            }

            mesh.push({
                position: flatCoords,
                indices: flatIdsRoof
            });

            debug.push(feature);

            if( mesh.length === 24 ) {
                console.log(debug);
                return mesh;
            }
        }

        return mesh;
    }

    private static orientCoordinates(coordinates: Position[]): Position[] {

        const len = coordinates.length;

        const x1 = coordinates[0][0] - coordinates[len -1][0];
        const y1 = coordinates[0][1] - coordinates[len -1][1];

        const x2 = coordinates[0][0] - coordinates[Math.floor(len / 2)][0];
        const y2 = coordinates[0][1] - coordinates[Math.floor(len / 2)][1];

        // x1y2 - x2y1
        if( Math.sign(x1*y2 - x2*y1) >= 0 ) {
            return coordinates;
        }
        else {
            return coordinates.reverse();
        }
    }

    private static isValidBuilding(feature: Feature): boolean {
        const props = feature.properties;

        // unavailable building info
        if (props === null) {
            return false;
        }

        // skip the roofs for now
        if (props['building'] === 'roof' || props['building:part'] === 'roof') {
            // console.error("roof")
            // console.log(props);

            return false;
        }

        if ('building' in props && 'building:part' in props && 'roof:shape' in props) {
            console.error("CONTAINS ROOF")
            console.log(props);
            return true;
        }

        if ('building:part' in props && props['building:part'] === 'no') {
            // console.log("parts === no")
            // console.log(props);
            
            return true;
        }
        if ('building:part' in props && props['building:part'] === 'yes') {
            // console.log("parts === yes")
            // console.log(props);
            
            return true;
        }

        return false;
    }

    private static getBuildingHeight(feature: Feature): number[] {
        const FLOOR_HEIGHT = 3.4; // in meters
        const z_SCALE = 0.75;

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
        else {
            console.error(`Cannot compute height.`);
            console.log(props);

            return [];
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
        else {
            // console.error(`Cannot compute min_height.`);
            // console.log(props);

            // return [];
        }

        return [z_SCALE * min_height, z_SCALE * height];
    }
}