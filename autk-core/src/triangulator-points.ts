/**
 * Converts GeoJSON Point and MultiPoint features into triangulated mesh data for WebGPU rendering.
 * Points are tessellated as circle fans with a fixed resolution for consistent screen-space appearance.
 * @module triangulator-points
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
 * Triangulator for point geometries. Generates triangulated marker meshes for `Point`, `MultiPoint`, 
 * and supported `GeometryCollection` features.  Each point is tessellated as a circle fan with a fixed resolution, 
 * ensuring consistent screen-space size regardless of zoom level. Unsupported geometries are skipped with a warning.
 */
export class TriangulatorPoints {
    /**
     * Builds triangulated point-marker geometry for a feature collection.
     *
     * Supported geometries are `Point`, `MultiPoint`, and `GeometryCollection`
     * containing those geometry types.
     *
     * @param geojson - Source feature collection containing point geometries.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing point-marker geometry chunks and their
     * per-feature component metadata.
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
     * Converts a single `Point` feature into triangulated marker geometry.
     *
     * @param feature - Source feature with `Point` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated marker meshes for the feature.
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
     * Converts a `MultiPoint` feature into triangulated marker geometry.
     *
     * Each point is tessellated independently into its own circle fan.
     *
     * @param feature - Source feature with `MultiPoint` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated marker meshes for each point in the collection.
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
     * Converts supported children of a `GeometryCollection` into triangulated point-marker meshes.
     *
     * Unsupported child geometries are skipped with a warning.
     *
     * @param feature - Source feature with `GeometryCollection` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param featureIndex - Index of the parent feature in the source collection.
     * @returns Triangulated marker meshes for all supported child geometries.
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
     * The returned point order is suitable for triangle-fan index generation.
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
