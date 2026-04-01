import { BBox, FeatureCollection } from "geojson";

/**
 * Utility class for computing the geographic bounding box of a GeoJSON feature collection.
 */
export class LayerBbox {
    /**
     * Computes the bounding box of a feature collection.
     *
     * @param features - The GeoJSON feature collection to process.
     * @returns A GeoJSON `BBox` tuple `[minLon, minLat, maxLon, maxLat]`.
     * @throws If the feature collection is empty or contains no valid coordinates.
     */
    static build(features: FeatureCollection): BBox {
        if (features.features.length === 0) {
            throw new Error("Feature collection is empty");
        }

        const allCoords = this.extractCoordinates(features);
        return this.computeBBox(allCoords);
    }

    /**
     * Extracts all coordinate pairs from every feature in the collection,
     * flattening across geometry types and geometry collections.
     *
     * @param features - The GeoJSON feature collection to extract coordinates from.
     * @returns A flat array of `[longitude, latitude]` pairs.
     */
    private static extractCoordinates(features: FeatureCollection): number[][] {
        const coords: number[][] = [];

        for (const feature of features.features) {
            if (feature.geometry) {
                this.processGeometry(feature.geometry, coords);
            }
        }

        return coords;
    }

    /**
     * Recursively extracts coordinates from a geometry, handling `GeometryCollection`
     * by processing each sub-geometry individually.
     *
     * @param geom - A GeoJSON geometry object.
     * @param coords - Accumulator array to push coordinate pairs into.
     */
    private static processGeometry(geom: any, coords: number[][]): void {
        if (geom.type === "GeometryCollection") {
            for (const subGeom of geom.geometries) {
                this.processGeometry(subGeom, coords);
            }
        } else if (geom.coordinates) {
            this.flattenCoordinates(geom.coordinates, coords);
        }
    }

    /**
     * Recursively flattens a nested coordinate array down to individual
     * `[longitude, latitude]` pairs.
     *
     * @param coords - A coordinate value — either a nested array or a leaf `[lon, lat]` pair.
     * @param result - Accumulator array to push leaf coordinate pairs into.
     */
    private static flattenCoordinates(coords: any, result: number[][]): void {
        if (Array.isArray(coords[0])) {
            for (const coord of coords) {
                this.flattenCoordinates(coord, result);
            }
        } else if (typeof coords[0] === "number") {
            result.push(coords);
        }
    }

    /**
     * Computes the bounding box from a flat array of coordinate pairs.
     *
     * @param coords - Array of `[longitude, latitude]` pairs.
     * @returns A GeoJSON `BBox` tuple `[minLon, minLat, maxLon, maxLat]`.
     * @throws If the coordinate array is empty.
     */
    private static computeBBox(coords: number[][]): BBox {
        if (coords.length === 0) {
            throw new Error("No valid coordinates found");
        }

        let minLon = coords[0][0];
        let maxLon = coords[0][0];
        let minLat = coords[0][1];
        let maxLat = coords[0][1];

        for (const [lon, lat] of coords) {
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        }

        return [minLon, minLat, maxLon, maxLat];
    }
}
