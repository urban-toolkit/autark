import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon, GeometryCollection } from "geojson";

import { LayerBorder, LayerBorderComponent, LayerComponent, LayerGeometry } from "./types-mesh";

import earcut from "earcut";

export class TriangulatorPolygons {
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId=0; fId<collection.length; fId++) {
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolygons.lineStringToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolygons.multiLineStringToMesh(feature, origin);
            } else if (feature.geometry.type === 'Polygon') {
                meshes = TriangulatorPolygons.polygonToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPolygon') {
                meshes = TriangulatorPolygons.multiPolygonToMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPolygons.geometryCollectionToMesh(feature, origin);
            } else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
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

            comps.push({nPoints, nTriangles});
        }

        return [mesh, comps];
    }

    static buildBorder(geojson: FeatureCollection, origin: number[]): [LayerBorder[], LayerBorderComponent[]] {
        const border: LayerBorder[] = [];
        const comps: LayerBorderComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let borders: { flatCoords: number[], flatIds: number[] }[];

        for (let fId=0; fId<collection.length; fId++) {
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                borders = TriangulatorPolygons.lineStringToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiLineString') {
                borders = TriangulatorPolygons.multiLineStringToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'Polygon') {
                borders = TriangulatorPolygons.polygonToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPolygon') {
                borders = TriangulatorPolygons.multiPolygonToBorderMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                borders = TriangulatorPolygons.geometryCollectionToBorderMesh(feature, origin);
            } else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
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

    static lineStringToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords);
        return [{ flatCoords, flatIds }];
    }

    static lineStringToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const flatCoords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);
        return [{ flatCoords, flatIds }];
    }

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

    static polygonToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;
        const coords = coordinates[0].map((cord: number[]) => cord);
        const holes: number[] = [];
        for (let i = 1; i < coordinates.length; i++) {
            holes.push(coords.length);
            coordinates[i].forEach((cord: number[]) => coords.push(cord));
        }
        if (holes.length > 0) {
            console.log('[autk-core] Triangulating polygon with holes', {
                featureId: feature.id ?? null,
                holeCount: holes.length,
            });
        }
        const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
        const flatIds = earcut(flatCoords, holes.length > 0 ? holes : undefined);
        return [{ flatCoords, flatIds }];
    }

    static polygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;
        return coordinates.map((ring: number[][]) => {
            const flatCoords = ring.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);
            return { flatCoords, flatIds };
        });
    }

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
            if (holes.length > 0) {
                console.log('[autk-core] Triangulating multipolygon part with holes', {
                    featureId: feature.id ?? null,
                    holeCount: holes.length,
                });
            }
            const flatCoords = coords.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
            const flatIds = earcut(flatCoords, holes.length > 0 ? holes : undefined);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    static multiPolygonToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const borders = [];
        const { coordinates } = <MultiPolygon>feature.geometry;
        for (const polygon of coordinates) {
            for (const ring of polygon) {
                const flatCoords = ring.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]).flat();
                const flatIds = TriangulatorPolygons.generateBorderIds(flatCoords.length / 2);
                borders.push({ flatCoords, flatIds });
            }
        }
        return borders;
    }

    static geometryCollectionToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') meshes.push(...TriangulatorPolygons.lineStringToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiLineString') meshes.push(...TriangulatorPolygons.multiLineStringToMesh(syntheticFeature, origin));
            else if (geom.type === 'Polygon') meshes.push(...TriangulatorPolygons.polygonToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPolygon') meshes.push(...TriangulatorPolygons.multiPolygonToMesh(syntheticFeature, origin));
        }
        return meshes;
    }

    static geometryCollectionToBorderMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const borders = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') borders.push(...TriangulatorPolygons.lineStringToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiLineString') borders.push(...TriangulatorPolygons.multiLineStringToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'Polygon') borders.push(...TriangulatorPolygons.polygonToBorderMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPolygon') borders.push(...TriangulatorPolygons.multiPolygonToBorderMesh(syntheticFeature, origin));
        }
        return borders;
    }

    protected static generateBorderIds(nCoords: number): number[] {
        const ids = [];
        for (let i = 0; i < nCoords - 1; i++) ids.push(i, i + 1);
        ids.push(nCoords - 1, 0);
        return ids;
    }
}
