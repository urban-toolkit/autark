import { Feature, FeatureCollection, LineString } from 'geojson';
import { booleanClockwise } from '@turf/turf';

import { ILayerComponent, ILayerGeometry } from "./interfaces";

export abstract class Triangulator {

    protected static fixOrientation(features: Feature[]): Feature[] {
        for (const feature of features) {
            let { coordinates } = <LineString>feature.geometry;

            // makes the linestrings orientation consistent
            if ( booleanClockwise(coordinates) ){
                coordinates = coordinates.reverse();
            }
        }

        return features;
    }

    protected static closeFeatures(features: Feature[]): Feature[] {
        for (const feature of features) {
            const { coordinates } = <LineString>feature.geometry;
            // fix the linestring
            const len = coordinates.length;
            if (coordinates[0][0] !== coordinates[len - 1][0] || coordinates[0][1] !== coordinates[len - 1][1]) {
                coordinates.push(coordinates[0]);
            }
        }

        return features;
    }

    // TODO: remove this function
    protected static translateFeatures(geojson: FeatureCollection, origin: number[]) {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static buildMesh(_geojson: FeatureCollection, _origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };
}