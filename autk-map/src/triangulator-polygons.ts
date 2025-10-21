import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";

import { ILayerBorder, ILayerBorderComponent, ILayerComponent, ILayerGeometry } from "./interfaces";

import earcut from "earcut";

/**
 * Class for triangulating polygons from GeoJSON features.
 * It provides methods to convert different geometry types into polygon meshes.
 */
export class TriangulatorPolygons {
    /**
     * Builds a mesh from GeoJSON features representing polygons.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[] = [];
        for (let fId=0; fId<collection.length; fId++) {
            // gets the feature
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolygons.lineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolygons.multiLineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'Polygon') {
                meshes = TriangulatorPolygons.polygonToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiPolygon') {
                meshes = TriangulatorPolygons.multiPolygonToMesh(feature, origin);

            } else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nTriangles = 0;

            for (const triangulation of meshes) {
                mesh.push({
                    position: triangulation.flatCoords,
                    indices: triangulation.flatIds
                });

                nPoints += triangulation.flatCoords.length / 2;
                nTriangles += triangulation.flatIds.length / 3;
            }

            comps.push({nPoints, nTriangles});
        }

        return [mesh, comps];
    }
    /**
     * Converts GeoJSON features into a collection of borders.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static buildBorder(geojson: FeatureCollection, origin: number[]): [ILayerBorder[], ILayerBorderComponent[]] {
        const border: ILayerBorder[] = [];
        const comps: ILayerBorderComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let borders: { flatCoords: number[], flatIds: number[] }[] = [];

        for (let fId=0; fId<collection.length; fId++) {
            // gets the feature
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                borders = TriangulatorPolygons.lineStringToBorderMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiLineString') {
                borders = TriangulatorPolygons.multiLineStringToBorderMesh(feature, origin);

            } else if (feature.geometry.type === 'Polygon') {
                borders = TriangulatorPolygons.polygonToBorderMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiPolygon') {
                borders = TriangulatorPolygons.multiPolygonToBorderMesh(feature, origin);
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

    //---------------------------------------------------------------------------

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static lineStringToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a MultiLineString feature to a mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiLineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerGeometry[]} An array of geometries
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
     * Converts a MultiLineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiLineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static multiLineStringToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const borders = [];
        for (const lineString of coordinates) {

            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);

            borders.push({ flatCoords, flatIds });
        }

        return borders;
    }

    /**
     * Converts a Polygon feature to a mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a Polygon
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerGeometry[]} An array of geometries
     */
    static polygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;

        // copy the coordinates
        const coords = coordinates[0].map((cord: number[]) => cord);

        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a Polygon feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a Polygon
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static polygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;

        // copy the coordinates
        const coords = coordinates[0].map((cord: number[]) => cord);

        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);

        return [{ flatCoords, flatIds }];
    }


    /**
     * Converts a MultiPolygon feature to a mesh representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiPolygon
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerGeometry[]} An array of geometries
     */
    static multiPolygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const meshes = [];

        const { coordinates } = <MultiPolygon>feature.geometry;

        for (const polygon of coordinates) {
            const coords = polygon[0].map((cord: number[]) => cord);

            const holes = [];
            for (let i = 1; i < polygon.length; i++) {
                holes.push(coords.length);
                polygon[i].forEach((cord: number[]) => coords.push(cord));
            }

            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = earcut(flatCoords);

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

    /**
     * Converts a MultiPolygon feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a MultiPolygon
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static multiPolygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const borders = [];

        const { coordinates } = <MultiPolygon>feature.geometry;

        for (const polygon of coordinates) {
            const coords = polygon[0].map((cord: number[]) => cord);

            const holes = [];
            for (let i = 1; i < polygon.length; i++) {
                holes.push(coords.length);
                polygon[i].forEach((cord: number[]) => coords.push(cord));
            }

            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);

            borders.push({ flatCoords, flatIds });
        }

        return borders;
    }

    /**
     * Generates border indices for a given number of coordinates.
     * @param {number} nCoords The number of coordinates
     * @returns {number[]} An array of border indices
     */
    protected static generateBorderIds(nCoords: number): number[] {
        const ids = [];

        for (let i = 0; i < nCoords - 1; i++) {
            ids.push(i, i + 1);
        }
        ids.push(nCoords - 1, 0);
        return ids;
    }    

}
