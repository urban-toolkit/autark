import { FeatureCollection, Feature, LineString, MultiLineString, GeometryCollection } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

import { offsetPolyline } from './utils-geometry';
import earcut from 'earcut';

/**
 * Converts GeoJSON LineString and MultiLineString features into triangulated mesh data for WebGPU rendering.
 * Polylines are converted to closed polygons via planar offset (parallel curve), then triangulated with earcut.
 * @module triangulator-polylines
 */
export class TriangulatorPolylines {
    /** Default half-width, in local planar units, used when buffering source polylines. */
    static offset: number = 5;

    /**
     * Builds triangulated polyline geometry for a GeoJSON feature collection.
     *
     * Supported geometries are `LineString`, `MultiLineString`, and
     * `GeometryCollection` containing those geometry types.
     *
     * @param geojson - Source feature collection containing polyline geometries.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing triangulated geometry chunks and their
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
                TriangulatorPolylines.warnSkippedFeature(fId, null);
                continue;
            }

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolylines.lineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolylines.multiLineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPolylines.geometryCollectionToPolyline(feature, origin, TriangulatorPolylines.offset, fId);
            } else {
                TriangulatorPolylines.warnSkippedFeature(fId, feature.geometry.type);
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
     * Converts a single `LineString` feature into triangulated polyline mesh data.
     *
     * @param feature - Source feature with `LineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param offset - Polyline half-width used for planar buffering.
     * @returns One triangulated polygon mesh, or an empty array when the line
     * cannot produce a valid buffered polygon.
     */
    static lineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const base = <LineString>feature.geometry;
        const localCoords = base.coordinates.map((coord: number[]) => [coord[0] - origin[0], coord[1] - origin[1]]);
        const polygon = offsetPolyline(localCoords, offset);
        if (polygon.length < 4) {
            return [];
        }

        const flatIds = earcut(polygon.flat());
        const flatCoords = polygon.map((coord: number[]) => [coord[0], coord[1]]).flat();

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `MultiLineString` feature into triangulated polyline meshes.
     *
     * Each constituent line string is buffered and triangulated independently.
     *
     * @param feature - Source feature with `MultiLineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param offset - Polyline half-width used for planar buffering.
     * @returns Triangulated meshes for each valid buffered line string.
     */
    static multiLineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const ls of coordinates) {
            const localCoords = ls.map((coord: number[]) => [coord[0] - origin[0], coord[1] - origin[1]]);
            const polygon = offsetPolyline(localCoords, offset);
            if (polygon.length < 4) {
                continue;
            }

            const flatIds = earcut(polygon.flat());
            const flatCoords = polygon.map((coord: number[]) => [coord[0], coord[1]]).flat();

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

    /**
     * Converts supported children of a `GeometryCollection` into triangulated polyline meshes.
     *
     * Unsupported child geometries are skipped with a warning.
     *
     * @param feature - Source feature with `GeometryCollection` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param offset - Polyline half-width used for planar buffering.
     * @param featureIndex - Index of the parent feature in the source collection.
     * @returns Triangulated meshes for all supported child geometries.
     */
    static geometryCollectionToPolyline(feature: Feature, origin: number[], offset: number, featureIndex: number): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') {
                meshes.push(...TriangulatorPolylines.lineStringToPolyline(syntheticFeature, origin, offset));
            } else if (geom.type === 'MultiLineString') {
                meshes.push(...TriangulatorPolylines.multiLineStringToPolyline(syntheticFeature, origin, offset));
            } else {
                TriangulatorPolylines.warnSkippedGeometryCollectionChild(featureIndex, geom.type);
            }
        }
        return meshes;
    }

    /**
     * Emits a warning when a feature does not contain a supported polyline geometry.
     *
     * @param featureIndex - Index of the skipped feature in the source collection.
     * @param geometryType - Encountered geometry type, or `null` when geometry is missing.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedFeature(featureIndex: number, geometryType: string | null): void {
        console.warn(
            `[autk-core] TriangulatorPolylines skipped feature ${featureIndex}: expected LineString or MultiLineString geometry, got ${geometryType ?? 'null'}.`
        );
    }

    /**
     * Emits a warning when a `GeometryCollection` child is not a supported polyline geometry.
     *
     * @param featureIndex - Index of the parent feature in the source collection.
     * @param geometryType - Encountered unsupported child geometry type.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedGeometryCollectionChild(featureIndex: number, geometryType: string): void {
        console.warn(
            `[autk-core] TriangulatorPolylines skipped GeometryCollection child in feature ${featureIndex}: expected LineString or MultiLineString geometry, got ${geometryType}.`
        );
    }
}
