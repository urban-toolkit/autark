import { FeatureCollection, Feature } from "geojson";

import { ILayerBorder } from "./interfaces";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorBorders extends Triangulator {

    static buildBorder(geojson: FeatureCollection, origin: number[]): ILayerBorder[] {
        const border: ILayerBorder[] = [];

        const collection: Feature[] = geojson['features'];
        for (let fId=0; fId<collection.length; fId++) {
            // gets the feature
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                border.push(...Triangulator.lineStringToBorder(feature, origin));

            } else if (feature.geometry.type === 'MultiLineString') {
                border.push(...Triangulator.multiLineStringToBorder(feature, origin));

            } else if (feature.geometry.type === 'Polygon') {
                border.push(...Triangulator.polygonToBorder(feature, origin));

            } else if (feature.geometry.type === 'MultiPolygon') {
                border.push(...Triangulator.multiPolygonToBorder(feature, origin));
            }
            else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }
        }

        return border;
    }
}
