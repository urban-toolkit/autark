/**
 * Converts GeoJSON Polygon and MultiPolygon features into triangulated mesh data for WebGPU rendering.
 * Supports flat polygon fill meshes and per-ring border outlines for line rendering.
 * Hole rings are handled via earcut's hole index array.
 * @module triangulator-polygons
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
 * Triangulator for polygonal GeoJSON features. Generates triangulated fill meshes and border line meshes
 * for supported geometry types, including `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`,
 * and `GeometryCollection` containing those geometry types. Unsupported geometries are skipped with
 * a warning. Border meshes are emitted as line segments suitable for outline rendering.
 */
export class TriangulatorPolygons {
    /**
     * Builds triangulated fill geometry for a feature collection.
     *
     * Supported geometries are `LineString`, `MultiLineString`, `Polygon`,
     * `MultiPolygon`, and `GeometryCollection` containing those geometry types.
     *
     * @param geojson - Source feature collection.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing fill geometry chunks and their per-feature component metadata.
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
     * Builds border geometry for a feature collection.
     *
     * Borders are emitted as line segments suitable for outline rendering.
     *
     * @param geojson - Source feature collection.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing border geometry chunks and their per-feature border metadata.
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
     * @param feature - Source feature with `LineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated fill meshes for the feature.
     */
    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);
        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a `LineString` feature into border line geometry.
     *
     * @param feature - Source feature with `LineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Border line meshes for the feature.
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
     * @param feature - Source feature with `MultiLineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated fill meshes for each constituent line string.
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
     * @param feature - Source feature with `MultiLineString` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Border line meshes for each constituent line string.
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
     * Converts a `Polygon` feature into triangulated fill geometry.
     *
     * @param feature - Source feature with `Polygon` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated fill meshes for the polygon, including holes.
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
     * Converts a `Polygon` feature into border line geometry.
     *
     * One border mesh is produced for each ring, including holes.
     *
     * @param feature - Source feature with `Polygon` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Border line meshes for all polygon rings.
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
     * @param feature - Source feature with `MultiPolygon` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Triangulated fill meshes for each polygon in the collection.
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
     * @param feature - Source feature with `MultiPolygon` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns Border line meshes for all rings in all polygons.
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
     * Converts supported children of a `GeometryCollection` into triangulated fill geometry.
     *
     * Unsupported child geometries are skipped with a warning.
     *
     * @param feature - Source feature with `GeometryCollection` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param featureIndex - Index of the parent feature in the source collection.
     * @returns Triangulated fill meshes for all supported child geometries.
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
     * Converts supported children of a `GeometryCollection` into border line geometry.
     *
     * Unsupported child geometries are skipped with a warning.
     *
     * @param feature - Source feature with `GeometryCollection` geometry.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @param featureIndex - Index of the parent feature in the source collection.
     * @returns Border line meshes for all supported child geometries.
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
     * @param featureIndex - Index of the skipped feature in the source collection.
     * @param geometryType - Encountered geometry type, or `null` when geometry is missing.
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
     * @param featureIndex - Index of the parent feature in the source collection.
     * @param geometryType - Encountered unsupported child geometry type.
     * @returns Nothing. A warning is written to the console.
     */
    private static warnSkippedGeometryCollectionChild(featureIndex: number, geometryType: string): void {
        console.warn(
            `[autk-core] TriangulatorPolygons skipped GeometryCollection child in feature ${featureIndex}: expected LineString, MultiLineString, Polygon, or MultiPolygon geometry, got ${geometryType}.`
        );
    }

    /**
     * Generates line indices for an open polyline border.
     *
     * @param nCoords - Number of vertices in the border polyline.
     * @returns Sequential line index pairs connecting adjacent vertices.
     */
    protected static generateOpenBorderIds(nCoords: number): number[] {
        const ids = [];
        for (let i = 0; i < nCoords - 1; i++) ids.push(i, i + 1);
        return ids;
    }

    /**
     * Generates line indices for a closed polygon-ring border.
     *
     * Explicitly closed rings reuse the first unique vertex instead of adding a
     * duplicate closing edge vertex.
     *
     * @param ring - Polygon ring used to derive closed border connectivity.
     * @returns Line index pairs describing a closed border loop.
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
