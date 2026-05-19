/**
 * @module triangulator-polygons
 * GeoJSON polygon triangulation and border mesh generation.
 *
 * This module converts supported GeoJSON geometries into local-space mesh data
 * for fill and outline rendering. Coordinates are translated by the supplied
 * origin before triangulation so the generated buffers can be consumed in the
 * map's shared local coordinate space. Polygon and multipolygon holes are
 * flattened into a single vertex list and passed to `earcut` with hole offsets;
 * line geometries are emitted as per-vertex border index pairs.
 */

import { 
    FeatureCollection,
    Feature,
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
    GeometryCollection
} from "geojson";

import { 
    LayerBorder,
    LayerBorderComponent,
    LayerComponent,
    LayerGeometry
} from "./types-mesh";

import earcut from "earcut";

/**
 * Triangulates polygonal GeoJSON features into fill and border mesh chunks.
 *
 * `TriangulatorPolygons` accepts `LineString`, `MultiLineString`, `Polygon`,
 * `MultiPolygon`, and `GeometryCollection` features containing those geometry
 * types. Fill meshes are triangulated with `earcut` after translating vertices
 * into local coordinates relative to the supplied origin. Border meshes are
 * generated as line-index pairs, with open borders for line strings and closed
 * rings for polygon outlines and holes. Unsupported or missing geometries are
 * skipped with a warning.
 */
export class TriangulatorPolygons {
    /**
     * Builds triangulated fill geometry for a feature collection.
     *
     * @param geojson Source feature collection.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns A tuple of mesh chunks and per-feature component counts.
     * @throws Never throws. Unsupported features are skipped with a console warning.
     * @example
     * const [meshes, comps] = TriangulatorPolygons.buildMesh(polyFC, origin);
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId=0; fId<collection.length; fId++) {
            const feature = collection[fId];
            if (!feature.geometry) {
                TriangulatorPolygons.warnSkippedFeature(fId, null);
                continue;
            }

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolygons.lineStringToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolygons.multiLineStringToMesh(feature, origin);
            } else if (feature.geometry.type === 'Polygon') {
                meshes = TriangulatorPolygons.polygonToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPolygon') {
                meshes = TriangulatorPolygons.multiPolygonToMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPolygons.geometryCollectionToMesh(feature, origin, fId);
            } else {
                TriangulatorPolygons.warnSkippedFeature(fId, feature.geometry.type);
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
     * Builds border line geometry for a feature collection.
     *
     * @param geojson Source feature collection.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns A tuple of border chunks and per-feature border counts.
     * @throws Never throws. Unsupported features are skipped with a console warning.
     * @example
     * const [borders, borderComps] = TriangulatorPolygons.buildBorder(polyFC, origin);
     */
    static buildBorder(geojson: FeatureCollection, origin: number[]): [LayerBorder[], LayerBorderComponent[]] {
        const border: LayerBorder[] = [];
        const comps: LayerBorderComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let borders: { flatCoords: number[], flatIds: number[] }[];

        for (let fId=0; fId<collection.length; fId++) {
            const feature = collection[fId];
            if (!feature.geometry) {
                TriangulatorPolygons.warnSkippedFeature(fId, null);
                continue;
            }

            if (feature.geometry.type === 'LineString') {
                borders = TriangulatorPolygons.lineStringToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiLineString') {
                borders = TriangulatorPolygons.multiLineStringToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'Polygon') {
                borders = TriangulatorPolygons.polygonToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPolygon') {
                borders = TriangulatorPolygons.multiPolygonToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                borders = TriangulatorPolygons.geometryCollectionToBorderMesh(feature, origin, fId);
            } else {
                TriangulatorPolygons.warnSkippedFeature(fId, feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nLines = 0;

            for (const polyline of borders) {
                border.push({ 
                    position: new Float32Array(polyline.flatCoords), 
                    indices: new Uint32Array(polyline.flatIds) 
                });
                nPoints += polyline.flatCoords.length / 2;
                nLines += polyline.flatIds.length / 2;
            }

            comps.push({nPoints, nLines});
        }

        return [border, comps];
    }

    /**
     * Converts a `LineString` feature into triangulated fill geometry.
     *
     * @param feature Source feature with `LineString` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Triangulated fill meshes for the feature.
     * @throws Never throws.
     * @example
     * const [mesh] = TriangulatorPolygons.lineStringToMesh(lineFeature, origin);
     */
    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);
        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `LineString` feature into open border line geometry.
     *
     * @param feature Source feature with `LineString` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Border line meshes for the feature.
     * @throws Never throws.
     * @example
     * const [border] = TriangulatorPolygons.lineStringToBorderMesh(lineFeature, origin);
     */
    static lineStringToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = TriangulatorPolygons.generateOpenBorderIds(flatCoords.length / 2);
        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `MultiLineString` feature into triangulated fill geometry.
     *
     * @param feature Source feature with `MultiLineString` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Triangulated fill meshes for each constituent line string.
     * @throws Never throws.
     * @example
     * const meshes = TriangulatorPolygons.multiLineStringToMesh(mlsFeature, origin);
     */
    static multiLineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;
        const meshes = [];
        for (const lineString of coordinates) {
            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = earcut(flatCoords);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    /**
     * Converts a `MultiLineString` feature into border line geometry.
     *
     * @param feature Source feature with `MultiLineString` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Border line meshes for each constituent line string.
     * @throws Never throws.
     * @example
     * const borders = TriangulatorPolygons.multiLineStringToBorderMesh(mlsFeature, origin);
     */
    static multiLineStringToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;
        const borders = [];
        for (const lineString of coordinates) {
            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = TriangulatorPolygons.generateOpenBorderIds(flatCoords.length / 2);
            borders.push({ flatCoords, flatIds });
        }
        return borders;
    }

    /**
     * Converts a `Polygon` feature into triangulated fill geometry with hole support.
     *
     * @param feature Source feature with `Polygon` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Triangulated fill meshes for the polygon, including holes.
     * @throws Never throws.
     * @example
     * const [mesh] = TriangulatorPolygons.polygonToMesh(polyFeature, origin);
     */
    static polygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;
        const coords = coordinates[0].map((cord: number[]) => cord);
        const holes: number[] = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }

        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords, holes.length > 0 ? holes : undefined);
        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `Polygon` feature into closed border line geometry.
     *
     * @param feature Source feature with `Polygon` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Border line meshes for all polygon rings.
     * @throws Never throws.
     * @example
     * const borders = TriangulatorPolygons.polygonToBorderMesh(polyFeature, origin);
     */
    static polygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;
        return coordinates.map((ring: number[][]) => {
            const flatCoords = ring.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = TriangulatorPolygons.generateClosedBorderIds(ring);
            return { flatCoords, flatIds };
        });
    }

    /**
     * Converts a `MultiPolygon` feature into triangulated fill geometry.
     *
     * @param feature Source feature with `MultiPolygon` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Triangulated fill meshes for each polygon in the collection.
     * @throws Never throws.
     * @example
     * const meshes = TriangulatorPolygons.multiPolygonToMesh(mpFeature, origin);
     */
    static multiPolygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const meshes = [];
        const { coordinates } = <MultiPolygon>feature.geometry;
        for (const polygon of coordinates) {
            const coords = polygon[0].map((cord: number[]) => cord);
            const holes: number[] = [];
            for (let i = 1; i < polygon.length; i++) {
                holes.push(coords.length);
                polygon[i].forEach((cord: number[]) => coords.push(cord));
            }
            
            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = earcut(flatCoords, holes.length > 0 ? holes : undefined);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    /**
     * Converts a `MultiPolygon` feature into border line geometry.
     *
     * @param feature Source feature with `MultiPolygon` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @returns Border line meshes for all rings in all polygons.
     * @throws Never throws.
     * @example
     * const borders = TriangulatorPolygons.multiPolygonToBorderMesh(mpFeature, origin);
     */
    static multiPolygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const borders = [];
        const { coordinates } = <MultiPolygon>feature.geometry;
        for (const polygon of coordinates) {
            for (const ring of polygon) {
                const flatCoords = ring.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
                const flatIds = TriangulatorPolygons.generateClosedBorderIds(ring);
                borders.push({ flatCoords, flatIds });
            }
        }
        return borders;
    }

    /**
     * Flattens supported children of a `GeometryCollection` into fill meshes.
     *
     * @param feature Source feature with `GeometryCollection` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @param featureIndex Index of the parent feature in the source collection.
     * @returns Triangulated fill meshes for all supported child geometries.
     * @throws Never throws. Unsupported children are skipped with a console warning.
     * @example
     * const meshes = TriangulatorPolygons.geometryCollectionToMesh(gcFeature, origin, 0);
     */
    static geometryCollectionToMesh(feature: Feature, origin: number[], featureIndex: number): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') meshes.push(...TriangulatorPolygons.lineStringToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiLineString') meshes.push(...TriangulatorPolygons.multiLineStringToMesh(syntheticFeature, origin));
            else if (geom.type === 'Polygon') meshes.push(...TriangulatorPolygons.polygonToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPolygon') meshes.push(...TriangulatorPolygons.multiPolygonToMesh(syntheticFeature, origin));
            else TriangulatorPolygons.warnSkippedGeometryCollectionChild(featureIndex, geom.type);
        }
        return meshes;
    }

    /**
     * Flattens supported children of a `GeometryCollection` into border meshes.
     *
     * @param feature Source feature with `GeometryCollection` geometry.
     * @param origin World-space origin used to derive local XY coordinates.
     * @param featureIndex Index of the parent feature in the source collection.
     * @returns Border line meshes for all supported child geometries.
     * @throws Never throws. Unsupported children are skipped with a console warning.
     * @example
     * const borders = TriangulatorPolygons.geometryCollectionToBorderMesh(gcFeature, origin, 0);
     */
    static geometryCollectionToBorderMesh(feature: Feature, origin: number[], featureIndex: number): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const borders = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') borders.push(...TriangulatorPolygons.lineStringToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiLineString') borders.push(...TriangulatorPolygons.multiLineStringToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'Polygon') borders.push(...TriangulatorPolygons.polygonToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPolygon') borders.push(...TriangulatorPolygons.multiPolygonToBorderMesh(syntheticFeature, origin));
            else TriangulatorPolygons.warnSkippedGeometryCollectionChild(featureIndex, geom.type);
        }
        return borders;
    }

    /**
     * Emits a warning when a feature does not contain a supported geometry type.
     *
     * @param featureIndex Index of the skipped feature in the source collection.
     * @param geometryType Encountered geometry type, or `null` when geometry is missing.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedFeature(featureIndex: number, geometryType: string | null): void {
        console.warn(
            `[autk-core] TriangulatorPolygons skipped feature ${featureIndex}: expected LineString, MultiLineString, Polygon, or MultiPolygon geometry, got ${geometryType ?? 'null'}.`
        );
    }

    /**
     * Emits a warning when a `GeometryCollection` child is not a supported geometry type.
     *
     * @param featureIndex Index of the parent feature in the source collection.
     * @param geometryType Encountered unsupported child geometry type.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedGeometryCollectionChild(featureIndex: number, geometryType: string): void {
        console.warn(
            `[autk-core] TriangulatorPolygons skipped GeometryCollection child in feature ${featureIndex}: expected LineString, MultiLineString, Polygon, or MultiPolygon geometry, got ${geometryType}.`
        );
    }

    /**
     * Generates line index pairs for an open polyline border.
     *
     * @param nCoords Number of vertices in the border polyline.
     * @returns Sequential line index pairs `[0,1, 1,2, ...]`.
     * @throws Never throws.
     * @example
     * generateOpenBorderIds(3);  // [0, 1, 1, 2]
     */
    protected static generateOpenBorderIds(nCoords: number): number[] {
        const ids = [];
        for (let i = 0; i < nCoords - 1; i++) ids.push(i, i + 1);
        return ids;
    }

    /**
     * Generates line index pairs for a closed polygon-ring border.
     *
     * @param ring Polygon ring used to derive closed border connectivity.
     * @returns Line index pairs including the closing edge back to the first vertex.
     * @throws Never throws. Rings with fewer than 2 vertices return an empty array.
     * @example
     * generateClosedBorderIds([[0,0], [10,0], [10,10], [0,10], [0,0]]);
     * // → [0, 1, 1, 2, 2, 3, 3, 0]
     */
    protected static generateClosedBorderIds(ring: number[][]): number[] {
        const pointCount = ring.length;
        if (pointCount < 2) {
            return [];
        }

        const isExplicitlyClosed = pointCount > 1
            && ring[0][0] === ring[pointCount - 1][0]
            && ring[0][1] === ring[pointCount - 1][1]
            && (ring[0][2] ?? 0) === (ring[pointCount - 1][2] ?? 0);
        const uniquePointCount = isExplicitlyClosed ? pointCount - 1 : pointCount;
        const ids = TriangulatorPolygons.generateOpenBorderIds(uniquePointCount);

        if (uniquePointCount > 1) {
            ids.push(uniquePointCount - 1, 0);
        }

        return ids;
    }
}
