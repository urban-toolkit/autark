import { FeatureCollection } from "geojson";

import { IBoundingBox } from "./interfaces";

export class BboxBuilder  {

    static buildBbox(features: FeatureCollection): IBoundingBox {
        if (features.features.length === 0) {
            throw new Error("Feature collection is empty");
        }

        const type = features.features[0].geometry.type;

        switch (type) {
            case "Point":
                return BboxBuilder.buildFromPoints(features);
            case "LineString":
                return BboxBuilder.buildFromLines(features);
            case "MultiLineString":
                return BboxBuilder.buildFromMultiLines(features);
            case "Polygon":
                return BboxBuilder.buildFromPolygons(features);
            case "MultiPolygon":
                return BboxBuilder.buildFromMultiPolygons(features);
            default:
                throw new Error(`Unsupported geometry type: ${type}`);
        }
    }

    static buildFromPoints(points : FeatureCollection) : IBoundingBox {
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of points.features) {
            if (feature.geometry.type === "Point") {
                const coords = feature.geometry.coordinates;

                const x = coords[0];
                const y = coords[1];

                minLon = Math.min(minLon, x);
                minLat = Math.min(minLat, y);
                maxLon = Math.max(maxLon, x);
                maxLat = Math.max(maxLat, y);
            }
        }

        return {
            minLon, minLat, maxLon, maxLat
        };
    }

    static buildFromLines(lines : FeatureCollection) : IBoundingBox {
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of lines.features) {
            if (feature.geometry.type === "LineString") {
                const coordsArray = feature.geometry.coordinates;

                for (const coords of coordsArray) {
                    const x = coords[0];
                    const y = coords[1];

                    minLon = Math.min(minLon, x);
                    minLat = Math.min(minLat, y);
                    maxLon = Math.max(maxLon, x);
                    maxLat = Math.max(maxLat, y);
                }
            }
        }

        return {
            minLon, minLat, maxLon, maxLat
        };
    }

    static buildFromMultiLines(multiLines : FeatureCollection) : IBoundingBox {
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of multiLines.features) {
            if (feature.geometry.type === "MultiLineString") {
                const linesArray = feature.geometry.coordinates;

                for (const coordsArray of linesArray) {
                    for (const coords of coordsArray) {
                        const x = coords[0];
                        const y = coords[1];

                        minLon = Math.min(minLon, x);
                        minLat = Math.min(minLat, y);
                        maxLon = Math.max(maxLon, x);
                        maxLat = Math.max(maxLat, y);
                    }
                }
            }
        }

        return {
            minLon, minLat, maxLon, maxLat
        };
    }

    static buildFromPolygons(polygons : FeatureCollection) : IBoundingBox {
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of polygons.features) {
            if (feature.geometry.type === "Polygon") {
                const ringsArray = feature.geometry.coordinates;

                for (const coordsArray of ringsArray) {
                    for (const coords of coordsArray) {
                        const x = coords[0];
                        const y = coords[1];

                        minLon = Math.min(minLon, x);
                        minLat = Math.min(minLat, y);
                        maxLon = Math.max(maxLon, x);
                        maxLat = Math.max(maxLat, y);
                    }
                }
            }
        }

        return {
            minLon, minLat, maxLon, maxLat
        };
    }

    static buildFromMultiPolygons(multiPolygons : FeatureCollection) : IBoundingBox {
        let minLon = Number.POSITIVE_INFINITY;
        let minLat = Number.POSITIVE_INFINITY;
        let maxLon = Number.NEGATIVE_INFINITY;
        let maxLat = Number.NEGATIVE_INFINITY;

        for (const feature of multiPolygons.features) {
            if (feature.geometry.type === "MultiPolygon") {
                const polygonsArray = feature.geometry.coordinates;

                for (const ringsArray of polygonsArray) {
                    for (const coordsArray of ringsArray) {
                        for (const coords of coordsArray) {
                            const x = coords[0];
                            const y = coords[1];

                            minLon = Math.min(minLon, x);
                            minLat = Math.min(minLat, y);
                            maxLon = Math.max(maxLon, x);
                            maxLat = Math.max(maxLat, y);
                        }
                    }
                }
            }
        }

        return {
            minLon, minLat, maxLon, maxLat
        };
    }
}
