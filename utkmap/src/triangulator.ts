import earcut from 'earcut';

import { ILayerGeometry } from "./interfaces";
import { Feature, FeatureCollection, LineString } from 'geojson';


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

        console.log(collection);

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;
            const props = feature.properties;

            if (props === null || props['building:part'] === 'yes') {
                continue;
            }

            const height = props['height'];
            const minHeight = 0;

            // number of vertices
            const nVertsOnFeature = coordinates.length;

            // floor ----------------------------------------------------------------------
            const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], minHeight / 2 ])
                .flat()
                .map((el, id: number) => {
                    return el - origin[id % 3];
                });

            // roof ----------------------------------------------------------------------
            const flatCoordsRoof = flatCoords.map((el: number, id: number) => {
                return (id % 3 == 2 ? (height / 2) : el);
            });
            for (let eId = 0; eId < flatCoordsRoof.length; eId++) {
                flatCoords.push(flatCoordsRoof[eId]);
            }

            const flatIdsRoof = earcut(coordinates.flat()).map((el: number) => el + nVertsOnFeature);

            // walls ----------------------------------------------------------------------
            const flatCoordsWall = flatCoords.map((el: number) => el);

            for (let eId = 0; eId < flatCoordsWall.length; eId++) {
                flatCoords.push(flatCoordsWall[eId]);
            }

            for (let vId = 0; vId < nVertsOnFeature ; vId++) {
                const v0 = (2 * nVertsOnFeature) +  vId ;
                const v1 = (2 * nVertsOnFeature) + (vId + 1) % nVertsOnFeature;

                const v2 = v0 + nVertsOnFeature;
                const v3 = v1 + nVertsOnFeature;

                flatIdsRoof.push(...[v0,v1,v2,v2,v1,v3]);
            }

            mesh.push({
                position: flatCoords,
                indices: flatIdsRoof
            });

            // if (mesh.length == 100) {
            //     return mesh;
            // }
        }

        return mesh;
    }
}