import { ILayerBorder, ILayerBorderComponent, ILayerComponent, ILayerGeometry } from "./interfaces";

import { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

import earcut from 'earcut';

import { extrudePolygons } from "poly-extrude";


export abstract class Triangulator {

    /**
     * Builds a mesh from GeoJSON features.
     * @param {FeatureCollection} _geojson The GeoJSON feature collection
     * @param {number[]} _origin The origin point for translation
     * @param {Feature<Polygon | MultiPolygon>} _bbox The bounding box feature
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(_geojson: FeatureCollection, _origin: number[], _bbox: Feature<Polygon>): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };

    /**
     * Builds a mesh border from GeoJSON features.
     * @param {FeatureCollection} _geojson The GeoJSON feature collection
     * @param {number[]} _origin The origin point for translation
     * @param {Feature<Polygon | MultiPolygon>} _bbox The bounding box feature
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildBorder(_geojson: FeatureCollection, _origin: number[], _bbox: Feature<Polygon>): [ILayerBorder[], ILayerBorderComponent[]] {
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
    static lineStringToBorder(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static lineStringToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const coords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
        const result = extrudePolygons([
            [coords]
        ],
        { depth: heightInfo[1] - heightInfo[0] }
        );

        const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
            if (id % 3 === 2) return cord + heightInfo[0];
            return cord;
        });
        const flatIds = Array.from(result.indices);

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
    static multiLineStringToBorder(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const borders = [];
        for (const lineString of coordinates) {

            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

            borders.push({ flatCoords, flatIds });
        }

        return borders;
    }

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static multiLineStringToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const lineString of coordinates) {

            const coords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
            const result = extrudePolygons([
                [coords]
            ],
            { depth: heightInfo[1] - heightInfo[0] }
            );

            const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
                if (id % 3 === 2) return cord + heightInfo[0];
                return cord;
            });
            const flatIds = Array.from(result.indices);
            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
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
    static polygonToBorder(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;

        // copy the coordinates
        const coords = coordinates[0].map((cord: number[]) => cord);

        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

        return [{ flatCoords, flatIds }];
    }

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static polygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;

        const coords = [];
        for (let i = 0; i < coordinates.length; i++) {
            coords.push( coordinates[i].map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]) );
        }

        const result = extrudePolygons([
                coords
            ],
            { depth: heightInfo[1] - heightInfo[0] }
            );

        const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
            if (id % 3 === 2) return cord + heightInfo[0];
            return cord;
        });
        const flatIds = Array.from(result.indices);

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
    static multiPolygonToBorder(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
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
            const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

            borders.push({ flatCoords, flatIds });
        }

        return borders;
    }

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static multiPolygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const meshes = [];

        const { coordinates } = <MultiPolygon>feature.geometry;

        for (const polygon of coordinates) {

            const coords = [];
            for (let i = 0; i < polygon.length; i++) {
                coords.push( polygon[i].map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]) );
            }

            const result = extrudePolygons([
                    coords
                ],
                { depth: heightInfo[1] - heightInfo[0] }
                );

            const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
                if (id % 3 === 2) return cord + heightInfo[0];
                return cord;
            });
            const flatIds = Array.from(result.indices);
            
            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
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