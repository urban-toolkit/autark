import { FeatureCollection, Feature } from "geojson";

import { ILayerBorder, ILayerBorderComponent } from "./interfaces";
import { Triangulator } from "./triangulator";

/**
 * Class for triangulating borders from GeoJSON features.
 * It provides methods to convert different geometry types into borders.
 */
export class TriangulatorBorders extends Triangulator {
    /**
     * Converts GeoJSON features into a collection of borders.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static buildBorder(geojson: FeatureCollection, origin: number[]): [ILayerBorder[], ILayerBorderComponent[]] {
        const border: ILayerBorder[] = [];
        const comps: ILayerBorderComponent[] = [];

        let borders: { flatCoords: number[], flatIds: number[] }[] = [];

        const collection: Feature[] = geojson['features'];
        for (let fId=0; fId<collection.length; fId++) {
            // gets the feature
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                borders = Triangulator.lineStringToBorder(feature, origin);

            } else if (feature.geometry.type === 'MultiLineString') {
                borders = Triangulator.multiLineStringToBorder(feature, origin);

            } else if (feature.geometry.type === 'Polygon') {
                borders = Triangulator.polygonToBorder(feature, origin);

            } else if (feature.geometry.type === 'MultiPolygon') {
                borders = Triangulator.multiPolygonToBorder(feature, origin);
            }
            else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nLines = 0;

            for (const polyline of borders) {
                border.push({
                    position: polyline.flatCoords,
                    indices: polyline.flatIds
                });

                nPoints += polyline.flatCoords.length / 2;
                nLines += polyline.flatIds.length / 2;
            }

            comps.push({nPoints, nLines});
        }

        return [border, comps];
    }
}
