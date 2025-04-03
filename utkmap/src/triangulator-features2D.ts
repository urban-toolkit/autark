import earcut from "earcut";

import { FeatureCollection, Feature, LineString, MultiLineString, Polygon, MultiPolygon } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { Triangulator } from "./triangulator";

export abstract class TriangulatorFeatures2D extends Triangulator {

    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        Triangulator.translateFeatures(geojson, origin);

        let collection: Feature[] = geojson['features'];

        collection = Triangulator.closeFeatures(collection);
        collection = Triangulator.fixOrientation(collection);

        for (const feature of collection) {
            if (feature.geometry.type === 'LineString') {
                const triangulation = TriangulatorFeatures2D.lineSringToMesh(feature);

                mesh.push({
                    position: triangulation.flatCoords,
                    indices: triangulation.flatIds
                });
    
                comps.push({
                    nPoints: triangulation.flatCoords.length / 3,
                    nTriangles: triangulation.flatIds.length / 3
                });
            } else if (feature.geometry.type === 'MultiLineString') {
                const triangulations = TriangulatorFeatures2D.multiLineSringToMesh(feature);

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
            } else if (feature.geometry.type === 'Polygon') {
                const triangulation = TriangulatorFeatures2D.polygonToMesh(feature);

                mesh.push({
                    position: triangulation.flatCoords,
                    indices: triangulation.flatIds
                });
    
                comps.push({
                    nPoints: triangulation.flatCoords.length / 3,
                    nTriangles: triangulation.flatIds.length / 3
                });
            } else if (feature.geometry.type === 'MultiPolygon') {
                const triangulations = TriangulatorFeatures2D.multiPolygonToMesh(feature);

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
            else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }
        }

        return [mesh, comps];
    }

    static lineSringToMesh(feature: Feature): {flatCoords: number[], flatIds: number[]} {
        const { coordinates } = <LineString>feature.geometry;

        const flatCoords = coordinates.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
        const flatIds = earcut(coordinates.flat());

        return {flatCoords, flatIds};
    }

    static multiLineSringToMesh(feature: Feature): {flatCoords: number[], flatIds: number[]}[] {
        const meshes = [];
        const { coordinates } = <MultiLineString>feature.geometry;

        for (const lineString of coordinates) {
            const flatCoords = lineString.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
            const flatIds = earcut(lineString.flat());

            meshes.push({flatCoords, flatIds});
        }

        return meshes;
    }

    static polygonToMesh(feature: Feature): {flatCoords: number[], flatIds: number[]} {
        const { coordinates } = <Polygon>feature.geometry;

        const coords = coordinates[0].map((cord: number[]) => cord);

        const holes = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }

        const flatCoords = coords.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
        const flatIds = earcut(coords.flat());

        return {flatCoords, flatIds};
    }

    static multiPolygonToMesh(feature: Feature): {flatCoords: number[], flatIds: number[]}[] {
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

            const flatCoords = coords.map((cord: number[]) => [cord[0], cord[1], 0]).flat();
            const flatIds = earcut(coords.flat());

            meshes.push({flatCoords, flatIds});
        }

        return meshes;
    }
}
