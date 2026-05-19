import { FeatureCollection, Feature, LineString, MultiLineString, GeometryCollection } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

import { offsetPolyline } from './utils-geometry';
import earcut from 'earcut';

/**
 * @module triangulator-polylines
 * Polyline triangulation helpers for GeoJSON line geometries.
 *
 * This module converts `LineString`, `MultiLineString`, and supported
 * `GeometryCollection` children into closed buffered polygons in local planar
 * coordinates, then triangulates the resulting rings with `earcut` for mesh
 * rendering.
 */
export class TriangulatorPolylines {
    /** Default half-width, in local planar units, used when buffering source polylines. */
    static offset: number = 5;

    /** OSM road half-widths, in local planar units, keyed by normalized `highway` tag value. */
    static readonly ROAD_HALF_WIDTH_BY_HIGHWAY: Record<string, number> = {
        motorway: 10,
        motorway_link: 3.5,
        trunk: 8,
        trunk_link: 3.5,
        primary: 6,
        primary_link: 3,
        secondary: 5,
        secondary_link: 2.5,
        tertiary: 4,
        tertiary_link: 2,
        unclassified: 3.5,
        residential: 3.5,
        service: 2.5,
        living_street: 2.5,
        road: 3.5,
        track: 1.5,
        path: 0.75,
    };

    /** Default road half-width used when no known `highway` tag value is available. */
    static readonly DEFAULT_ROAD_HALF_WIDTH: number = 3.5;

    /** Optional callback used to resolve a per-feature polyline half-width. */
    static readonly defaultOffsetResolver = (_feature: Feature, _featureIndex: number): number => TriangulatorPolylines.offset;

    /**
     * Builds triangulated polyline geometry for a GeoJSON feature collection.
     *
     * @param geojson Source feature collection containing polyline geometries.
     * @param origin World-space origin subtracted before converting to local planar space.
     * @param resolveOffset Optional per-feature half-width resolver.
     * @returns A tuple of triangulated geometry chunks and per-feature component metadata.
     * @throws Never throws. Unsupported or degenerate features are skipped.
     * @example
     * const [meshes, comps] = TriangulatorPolylines.buildMesh(lineFC, origin);
     */
    static buildMesh(
        geojson: FeatureCollection,
        origin: number[],
        resolveOffset: (feature: Feature, featureIndex: number) => number = TriangulatorPolylines.defaultOffsetResolver,
    ): [LayerGeometry[], LayerComponent[]] {
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

            const resolvedOffset = resolveOffset(feature, fId);
            const offset = Number.isFinite(resolvedOffset) && resolvedOffset > 0
                ? resolvedOffset
                : TriangulatorPolylines.offset;

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolylines.lineStringToPolyline(feature, origin, offset);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolylines.multiLineStringToPolyline(feature, origin, offset);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPolylines.geometryCollectionToPolyline(feature, origin, offset, fId);
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
     * @param feature Source feature with `LineString` geometry.
     * @param origin World-space origin subtracted before buffering.
     * @param offset Polyline half-width used for planar buffering.
     * @returns One triangulated polygon mesh, or an empty array when buffering fails.
     * @throws Never throws. Degenerate buffers return an empty array.
     * @example
     * const [mesh] = TriangulatorPolylines.lineStringToPolyline(feature, origin, 5);
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
     * @param feature Source feature with `MultiLineString` geometry.
     * @param origin World-space origin subtracted before buffering.
     * @param offset Polyline half-width used for planar buffering.
     * @returns Triangulated meshes for each valid buffered line string.
     * @throws Never throws. Invalid buffered lines are silently ignored.
     * @example
     * const meshes = TriangulatorPolylines.multiLineStringToPolyline(feature, origin, 5);
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
     * Flattens supported children of a `GeometryCollection` into polyline meshes.
     *
     * @param feature Source feature with `GeometryCollection` geometry.
     * @param origin World-space origin subtracted before buffering.
     * @param offset Polyline half-width used for planar buffering.
     * @param featureIndex Index of the parent feature in the source collection.
     * @returns Triangulated meshes for all supported child geometries.
     * @throws Never throws. Unsupported children are skipped with a console warning.
     * @example
     * const meshes = TriangulatorPolylines.geometryCollectionToPolyline(feature, origin, 5, 0);
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
     * Resolves a road polyline half-width from OSM `highway` tag semantics.
     *
     * @param feature Source road feature with `highway` property.
     * @returns Polyline half-width in local planar units.
     * @throws Never throws. Falls back to `DEFAULT_ROAD_HALF_WIDTH`.
     * @example
     * const hw = TriangulatorPolylines.resolveRoadHalfWidth(roadFeature);
     * // hw → 10 for motorway, 6 for primary, 3.5 for unknown
     */
    static resolveRoadHalfWidth(feature: Feature): number {
        const highway = TriangulatorPolylines.normalizeRoadHighwayValue(feature.properties?.highway);
        return highway
            ? (TriangulatorPolylines.ROAD_HALF_WIDTH_BY_HIGHWAY[highway] ?? TriangulatorPolylines.DEFAULT_ROAD_HALF_WIDTH)
            : TriangulatorPolylines.DEFAULT_ROAD_HALF_WIDTH;
    }

    /**
     * Normalizes an OSM `highway` tag value for road-width lookup.
     *
     * @param highway Raw `highway` property value (string, semicolon-delimited, or array).
     * @returns Normalized highway token, or `null` when unavailable.
     * @throws Never throws.
     * @example
     * TriangulatorPolylines.normalizeRoadHighwayValue('motorway');  // 'motorway'
     * TriangulatorPolylines.normalizeRoadHighwayValue('primary;secondary');  // 'primary'
     */
    static normalizeRoadHighwayValue(highway: unknown): string | null {
        const values = Array.isArray(highway)
            ? highway
            : typeof highway === 'string'
                ? highway.split(';')
                : [];

        for (const value of values) {
            if (typeof value !== 'string') {
                continue;
            }

            const normalized = value.trim().toLowerCase();
            if (normalized.length > 0) {
                return normalized;
            }
        }

        return null;
    }

    /**
     * Emits a warning when a feature does not contain a supported polyline geometry.
     *
     * @param featureIndex Index of the skipped feature in the source collection.
     * @param geometryType Encountered geometry type, or `null` when geometry is missing.
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
     * @param featureIndex Index of the parent feature in the source collection.
     * @param geometryType Encountered unsupported child geometry type.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedGeometryCollectionChild(featureIndex: number, geometryType: string): void {
        console.warn(
            `[autk-core] TriangulatorPolylines skipped GeometryCollection child in feature ${featureIndex}: expected LineString or MultiLineString geometry, got ${geometryType}.`
        );
    }
}
