import { ILayerComponent, ILayerGeometry } from "./interfaces";

import { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

import earcut from 'earcut';

export abstract class Triangulator {

    // TODO: remove this function
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static buildMesh(_geojson: FeatureCollection, _origin: number[], _bbox: Feature<Polygon>): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };

    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const moveCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

        const flatIds = earcut(moveCoords);
        console.log('flatIds', flatIds);

        return [{ flatCoords, flatIds }];
    } 

    static multiLineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const lineString of coordinates) {

            const moveCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

            const flatIds = earcut(moveCoords);

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

    static polygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;

        // copy the coordinates
        const coords = coordinates[0].map((cord: number[]) => cord);

        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }

        const moveCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

        const flatIds = earcut(moveCoords);

        return [{ flatCoords, flatIds }];
    }

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

            const moveCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

            const flatIds = earcut(moveCoords);

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }
}