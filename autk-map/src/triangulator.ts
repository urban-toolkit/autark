import { ILayerBorder, ILayerComponent, ILayerGeometry } from "./interfaces";

import { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

import earcut from 'earcut';

export abstract class Triangulator {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static buildMesh(_geojson: FeatureCollection, _origin: number[], _bbox: Feature<Polygon>): [ILayerGeometry[], ILayerComponent[]] {
        return [[], []]
    };

    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);

        return [{ flatCoords, flatIds }];
    } 

    static lineStringToBorder(feature: Feature, origin: number[]): ILayerBorder[] {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = Triangulator.generateBorderIds(flatCoords.length / 2);

        return [{ position: flatCoords, indices: flatIds }];
    }

    //------

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

    //------

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

    //------

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

    // ---- Aux functions

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

    protected static generateBorderIds(nCoords: number): number[] {
        const ids = [];

        for (let i = 0; i < nCoords - 1; i++) {
            ids.push(i, i + 1);
        }
        ids.push(nCoords - 1, 0);
        return ids;
    }
}