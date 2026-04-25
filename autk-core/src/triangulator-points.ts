/**
 * @module triangulator-points
 * Point-marker triangulation helpers for GeoJSON features.
 *
 * This module converts `Point`, `MultiPoint`, and supported
 * `GeometryCollection` children into triangle-fan marker meshes suitable for
 * WebGPU rendering. Coordinates are shifted into local space using the shared
 * origin before sampling each marker circle.
 */

import { 
    FeatureCollection,
    Feature,
    Point,
    MultiPoint,
    GeometryCollection 
} from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

/**
 * Converts point-based GeoJSON features into triangulated marker meshes.
 *
 * The class walks a feature collection in order and emits one or more
 * triangle-fan meshes per supported feature. `Point` and `MultiPoint`
 * geometries are converted directly; `GeometryCollection` features are
 * flattened to supported point children, while unsupported geometries are
 * skipped with a warning.
 *
 * @example
 * const [meshes, components] = TriangulatorPoints.buildMesh(collection, origin);
 */
export class TriangulatorPoints {
    /**
     * Builds triangulated point-marker geometry for a feature collection.
     *
     * Each supported feature is converted into one or more local-space marker
     * meshes by subtracting the provided origin from the source coordinates and
     * sampling a fixed-radius circle fan. Unsupported features and missing
     * geometries are skipped.
     *
     * `GeometryCollection` features are flattened by child geometry type: only
     * `Point` and `MultiPoint` children are triangulated, and all other child
     * geometries are ignored with a warning.
     *
     * @param geojson - Source feature collection containing point geometries.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing the generated mesh chunks and per-feature
     * component metadata, both aligned to the input feature order.
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId = 0; fId < collection.length; fId++) {
            const feature = collection[fId];
            if (!feature.geometry) {
                TriangulatorPoints.warnSkippedFeature(fId, null);
                continue;
            }

            if (feature.geometry.type === 'Point') {
                meshes = TriangulatorPoints.pointToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPoint') {
                meshes = TriangulatorPoints.multiPointToMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPoints.geometryCollectionToMesh(feature, origin, fId);
            } else {
                TriangulatorPoints.warnSkippedFeature(fId, feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nTriangles = 0;

            for (const triangulation of meshes) {
                mesh.push({ 
                    position: new Float32Array(triangulation.flatCoords), 
                    indices: new Uint32Array(triangulation.flatIds),
                    featureIndex: fId,
                });
                nPoints += triangulation.flatCoords.length / 2;
                nTriangles += triangulation.flatIds.length / 3;
            }
            comps.push({ nPoints, nTriangles, featureIndex: fId, featureId: feature.id });
        }

        return [mesh, comps];
    }

    /**
     * Converts a single `Point` feature into a triangle-fan marker mesh.
     *
     * The point is translated into local space by subtracting `origin`, then
     * sampled as a fixed-radius circle with a fixed perimeter resolution.
     *
     * @param feature - Source feature with `Point` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A single mesh chunk for the point marker.
     */
    static pointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Point>feature.geometry;
        const res = 40;
        const flatCoords = TriangulatorPoints.sampleCircle(
            coordinates[0] - origin[0], coordinates[1] - origin[1], 100, res
        ).flat();
        const flatIds = [];
        for (let i = 1; i <= res; i++) flatIds.push(0, i, i % res + 1);
        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `MultiPoint` feature into triangle-fan marker meshes.
     *
     * Each coordinate is translated into local space independently and emitted
     * as its own marker mesh.
     *
     * @param feature - Source feature with `MultiPoint` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns One mesh chunk per point in the collection.
     */
    static multiPointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiPoint>feature.geometry;
        const res = 10;
        const meshes = [];
        for (const coord of coordinates) {
            const flatCoords = TriangulatorPoints.sampleCircle(
                coord[0] - origin[0], coord[1] - origin[1], 100, res
            ).flat();
            const flatIds = [];
            for (let i = 1; i <= res; i++) flatIds.push(0, i, i % res + 1);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    /**
     * Converts supported children of a `GeometryCollection` into marker meshes.
     *
     * Only `Point` and `MultiPoint` children are triangulated. Other child
     * geometry types are skipped with a warning and do not contribute to the
     * returned mesh list.
     *
     * @param feature - Source feature with `GeometryCollection` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param featureIndex - Index of the parent feature in the source collection.
     * @returns Mesh chunks for all supported child geometries in collection order.
     */
    static geometryCollectionToMesh(feature: Feature, origin: number[], featureIndex: number): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'Point') meshes.push(...TriangulatorPoints.pointToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPoint') meshes.push(...TriangulatorPoints.multiPointToMesh(syntheticFeature, origin));
            else TriangulatorPoints.warnSkippedGeometryCollectionChild(featureIndex, geom.type);
        }
        return meshes;
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

    /**
     * Samples a circle as a center point plus evenly spaced perimeter vertices.
     *
     * The returned point order is suitable for triangle-fan index generation,
     * with the center vertex first and the perimeter vertices ordered around
     * the circumference.
     *
     * @param centerX - Circle center X coordinate.
     * @param centerY - Circle center Y coordinate.
     * @param radius - Circle radius in local planar units.
     * @param numPoints - Number of perimeter sample points.
     * @returns Ordered center/perimeter vertices describing the sampled circle.
     */
    static sampleCircle(centerX: number, centerY: number, radius: number, numPoints: number): [number, number][] {
        const points: [number, number][] = [[centerX, centerY]];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
        }
        return points;
    }
}
