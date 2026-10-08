/**
 * @module triangulator-points
 * Point geometry helpers for GeoJSON features.
 *
 * This module converts point-bearing GeoJSON into packed point-instance
 * centers for sprite-style rendering in `autk-map`.
 *
 * Coordinates are always shifted into local space using the shared origin.
 */

import {
    FeatureCollection,
    Feature,
    GeometryCollection
} from 'geojson';

import { LayerComponent } from './types-mesh';

export interface PointInstancesData {
    instances: Float32Array;
    components: LayerComponent[];
}

/**
 * Converts point-based GeoJSON features into packed point instances.
 *
 * The class walks a feature collection in order and supports `Point`,
 * `MultiPoint`, and point-bearing `GeometryCollection` geometries while
 * skipping unsupported features with a warning.
 */
export class TriangulatorPoints {
    /**
     * Builds point-instance data for a feature collection.
     *
     * @param geojson - Source feature collection containing point geometries.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Packed instance centers and per-feature component metadata.
     * @throws Never throws. Unsupported features are skipped with a console warning.
     */
    static buildInstances(geojson: FeatureCollection, origin: number[]): PointInstancesData {
        const instances: number[] = [];
        const components: LayerComponent[] = [];

        const collection: Feature[] = geojson.features;
        for (let fId = 0; fId < collection.length; fId++) {
            const feature = collection[fId];
            if (!feature.geometry) {
                TriangulatorPoints.warnSkippedFeature(fId, null);
                continue;
            }

            const before = instances.length / 2;
            if (feature.geometry.type === 'Point') {
                TriangulatorPoints.pushPointInstance(instances, feature.geometry.coordinates, origin);
            } else if (feature.geometry.type === 'MultiPoint') {
                for (const coordinates of feature.geometry.coordinates) {
                    TriangulatorPoints.pushPointInstance(instances, coordinates, origin);
                }
            } else if (feature.geometry.type === 'GeometryCollection') {
                TriangulatorPoints.pushGeometryCollectionInstances(instances, feature, origin, fId);
            } else {
                TriangulatorPoints.warnSkippedFeature(fId, feature.geometry.type);
                continue;
            }

            const instanceCount = instances.length / 2 - before;
            if (instanceCount === 0) {
                continue;
            }

            components.push({
                nPoints: instanceCount,
                nTriangles: instanceCount * 2,
                featureIndex: fId,
                featureId: feature.id,
            });
        }

        return {
            instances: new Float32Array(instances),
            components,
        };
    }


    /**
     * Appends supported children of a `GeometryCollection` to the packed instance centers.
     */
    private static pushGeometryCollectionInstances(instances: number[], feature: Feature, origin: number[], featureIndex: number): void {
        const { geometries } = <GeometryCollection>feature.geometry;
        for (const geom of geometries) {
            if (geom.type === 'Point') {
                TriangulatorPoints.pushPointInstance(instances, geom.coordinates, origin);
            } else if (geom.type === 'MultiPoint') {
                for (const coordinates of geom.coordinates) {
                    TriangulatorPoints.pushPointInstance(instances, coordinates, origin);
                }
            } else {
                TriangulatorPoints.warnSkippedGeometryCollectionChild(featureIndex, geom.type);
            }
        }
    }

    /** Appends one point instance center in local coordinates. */
    private static pushPointInstance(instances: number[], coordinates: number[], origin: number[]): void {
        if (coordinates.length < 2) {
            return;
        }
        instances.push(coordinates[0] - origin[0], coordinates[1] - origin[1]);
    }


    /**
     * Emits a warning when a feature does not contain a supported point geometry.
     *
     * @param featureIndex - Index of the skipped feature in the source collection.
     * @param geometryType - Encountered geometry type, or `null` when geometry is missing.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedFeature(featureIndex: number, geometryType: string | null): void {
        console.warn(
            `[autk-core] TriangulatorPoints skipped feature ${featureIndex}: expected Point or MultiPoint geometry, got ${geometryType ?? 'null'}.`
        );
    }

    /**
     * Emits a warning when a `GeometryCollection` child is not a supported point geometry.
     *
     * @param featureIndex - Index of the parent feature in the source collection.
     * @param geometryType - Encountered unsupported child geometry type.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedGeometryCollectionChild(featureIndex: number, geometryType: string): void {
        console.warn(
            `[autk-core] TriangulatorPoints skipped GeometryCollection child in feature ${featureIndex}: expected Point or MultiPoint geometry, got ${geometryType}.`
        );
    }

}
