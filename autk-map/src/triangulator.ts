import { ILayerBorder, ILayerComponent, ILayerGeometry } from "./interfaces";

import { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

import earcut from 'earcut';

export abstract class Triangulator {

    /**
     * Builds a mesh from GeoJSON features.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @param {Feature<Polygon | MultiPolygon>} bbox The bounding box feature
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(_geojson: FeatureCollection, _origin: number[], _bbox: Feature<Polygon>): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };

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
    static lineStringToBorder(feature: Feature, origin: number[]): ILayerBorder[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

        return [{ position: flatCoords, indices: flatIds }];
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
    static multiLineStringToBorder(feature: Feature, origin: number[]): ILayerBorder[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const borders = [];
        for (const lineString of coordinates) {

            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

            borders.push({ position: flatCoords, indices: flatIds });
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
    static polygonToBorder(feature: Feature, origin: number[]): ILayerBorder[] {
        const { coordinates } = <Polygon>feature.geometry;

        // copy the coordinates
        const coords = coordinates[0].map((cord: number[]) => cord);

        // TODO: handle holes
        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

        return [{ position: flatCoords, indices: flatIds }];
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
    static multiPolygonToBorder(feature: Feature, origin: number[]): ILayerBorder[] {
        const borders = [];

        const { coordinates } = <MultiPolygon>feature.geometry;

        for (const polygon of coordinates) {
            const coords = polygon[0].map((cord: number[]) => cord);

            // TODO: handle holes
            const holes = [];
            for (let i = 1; i < polygon.length; i++) {
                holes.push(coords.length);
                polygon[i].forEach((cord: number[]) => coords.push(cord));
            }

            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

            borders.push({ position: flatCoords, indices: flatIds });
        }

        return borders;
    }

    /**
     * Translates the features in the GeoJSON collection based on the origin.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     */
    protected static translateFeatures(geojson: FeatureCollection, origin: number[]) {
        const collection = geojson['features'];

        for (const feature of collection) {
            const { coordinates } = <LineString>feature.geometry;

            for(let cId=0; cId < coordinates.length; cId++) {
                const coords = coordinates[cId];
                coords[0] -= origin[0];
                coords[1] -= origin[1];
            }
        }
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