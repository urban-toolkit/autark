import earcut from 'earcut';

import { ILayerGeometry } from "./interfaces";
import { Feature, FeatureCollection, LineString } from 'geojson';


export abstract class Triangulator {

    static createTrianglesLayerMesh(geojson: FeatureCollection, origin: number[]): ILayerGeometry[] {
        const mesh: ILayerGeometry[] = [];
        const collection: Feature[] =  geojson['features'];

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

    // static createBuidlingsLayerMesh(features: unknown) {

    //     return [{
    //         position: [],
    //         indices: []
    //     }];

    // }

}