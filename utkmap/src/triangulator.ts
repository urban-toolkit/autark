import { Feature, FeatureCollection, LineString } from 'geojson';
import { booleanClockwise } from '@turf/turf';

import { ILayerComponent, ILayerGeometry } from "./interfaces";

export abstract class Triangulator {

    protected static fixFeatureGeometry(features: Feature[]): Feature[] {

        for (const feature of features) {
            let { coordinates } = <LineString>feature.geometry;

            // makes the linestrings orientation consistent
            if ( booleanClockwise(coordinates) ){
                coordinates = coordinates.reverse();
            }
        }

        return features;
    }

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

    static buildMesh(_geojson: FeatureCollection, _origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };
}