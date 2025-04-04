import earcut from "earcut";

import { FeatureCollection, Feature, LineString, MultiLineString, Polygon, MultiPolygon } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorFeatures2D extends Triangulator {

    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        let collection: Feature[] = geojson['features'];

        // TODO: add support for any geojson
        collection = Triangulator.closeFeatures(collection);
        collection = Triangulator.fixOrientation(collection);

        let triangulations: { flatCoords: number[], flatIds: number[] }[] = [];

        for (const feature of collection) {
            if (feature.geometry.type === 'LineString') {
                triangulations = TriangulatorFeatures2D.lineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiLineString') {
                triangulations = TriangulatorFeatures2D.multiLineStringToMesh(feature, origin);

            } else if (feature.geometry.type === 'Polygon') {
                triangulations = TriangulatorFeatures2D.polygonToMesh(feature, origin);

            } else if (feature.geometry.type === 'MultiPolygon') {
                triangulations = TriangulatorFeatures2D.multiPolygonToMesh(feature, origin);

            }
            else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }

            for (const triangulation of triangulations) {
                mesh.push({
                    position: triangulation.flatCoords,
                    indices: triangulation.flatIds
                });

                comps.push({
                    nPoints: triangulation.flatCoords.length / 3,
                    nTriangles: triangulation.flatIds.length / 3
                });
            }

        }
        return [mesh, comps];
    }

    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const moveCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

        console.log(coordinates)

        const flatIds = earcut(moveCoords);

        return [{ flatCoords, flatIds }];
    }

    static multiLineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const lineString of coordinates) {

            const moveCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
            const flatCoords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

            const flatIds = earcut(moveCoords.flat());

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

        const moveCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

        const flatIds = earcut(moveCoords.flat());

        return [{ flatCoords, flatIds }];
    }

    static multiPolygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const meshes = [];

        console.log('MultiPolygon');
        console.log(feature);

        const { coordinates } = <MultiPolygon>feature.geometry;

        for (const polygon of coordinates) {
            const coords = polygon[0].map((cord: number[]) => cord);

            const holes = [];
            for (let i = 1; i < polygon.length; i++) {
                holes.push(coords.length);
                polygon[i].forEach((cord: number[]) => coords.push(cord));
            }

            const moveCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1], 0]).flat();

            const flatIds = earcut(moveCoords.flat());

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }
}
