import { FeatureCollection, Feature, Point, MultiPoint, GeometryCollection } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

export class TriangulatorPoints {
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId = 0; fId < collection.length; fId++) {
            const feature = collection[fId];

            if (feature.geometry.type === 'Point') {
                meshes = TriangulatorPoints.pointToMesh(feature, origin);
            } else if (feature.geometry.type === 'MultiPoint') {
                meshes = TriangulatorPoints.multiPointToMesh(feature, origin);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPoints.geometryCollectionToMesh(feature, origin);
            } else {
                console.warn('Unsupported geometry type:', feature.geometry.type);
                continue;
            }

            let nPoints = 0;
            let nTriangles = 0;

            for (const triangulation of meshes) {
                mesh.push({ 
                    position: new Float32Array(triangulation.flatCoords), 
                    indices: new Uint32Array(triangulation.flatIds) 
                });
                nPoints += triangulation.flatCoords.length / 2;
                nTriangles += triangulation.flatIds.length / 3;
            }
            comps.push({ nPoints, nTriangles });
        }

        return [mesh, comps];
    }

    static pointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Point>feature.geometry;
        const res = 40;
        const flatCoords = TriangulatorPoints.sampleCircle(
            coordinates[0] - origin[0], coordinates[1] - origin[1], 100, res
        ).flat();
        const flatIds = [];
        for (let i = 1; i <= res; i++) flatIds.push(0, i, i % res + 1);
        return [{ flatCoords, flatIds }];
    }

    static multiPointToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiPoint>feature.geometry;
        const res = 10;
        const meshes = [];
        for (const coord of coordinates) {
            const flatCoords = TriangulatorPoints.sampleCircle(
                coord[0] - origin[0], coord[1] - origin[1], 100, res
            ).flat();
            const flatIds = [];
            for (let i = 1; i <= res; i++) flatIds.push(0, i, i % res + 1);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    static geometryCollectionToMesh(feature: Feature, origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'Point') meshes.push(...TriangulatorPoints.pointToMesh(syntheticFeature, origin));
            else if (geom.type === 'MultiPoint') meshes.push(...TriangulatorPoints.multiPointToMesh(syntheticFeature, origin));
        }
        return meshes;
    }

    static sampleCircle(centerX: number, centerY: number, radius: number, numPoints: number): [number, number][] {
        const points: [number, number][] = [[centerX, centerY]];
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
        }
        return points;
    }
}
