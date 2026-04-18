import { FeatureCollection, Feature, LineString, MultiLineString, GeometryCollection } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

import { offsetPolyline } from './utils-geo';
import earcut from 'earcut';

export class TriangulatorPolylines {
    static offset: number = 5;

    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const collection: Feature[] = geojson['features'];

        let meshes: { flatCoords: number[], flatIds: number[] }[];
        for (let fId = 0; fId < collection.length; fId++) {
            const feature = collection[fId];

            if (feature.geometry.type === 'LineString') {
                meshes = TriangulatorPolylines.lineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else if (feature.geometry.type === 'MultiLineString') {
                meshes = TriangulatorPolylines.multiLineStringToPolyline(feature, origin, TriangulatorPolylines.offset);
            } else if (feature.geometry.type === 'GeometryCollection') {
                meshes = TriangulatorPolylines.geometryCollectionToPolyline(feature, origin, TriangulatorPolylines.offset);
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
            comps.push({ nPoints, nTriangles });
        }
        return [mesh, comps];
    }

    static lineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const base = <LineString>feature.geometry;
        const localCoords = base.coordinates.map((coord: number[]) => [coord[0] - origin[0], coord[1] - origin[1]]);
        const polygon = offsetPolyline(localCoords, offset);
        if (polygon.length < 4) {
            return [];
        }

        const flatIds = earcut(polygon.flat());
        const flatCoords = polygon.map((coord: number[]) => [coord[0], coord[1]]).flat();

        return [{ flatCoords, flatIds }];
    }

    static multiLineStringToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;

        const meshes = [];
        for (const ls of coordinates) {
            const localCoords = ls.map((coord: number[]) => [coord[0] - origin[0], coord[1] - origin[1]]);
            const polygon = offsetPolyline(localCoords, offset);
            if (polygon.length < 4) {
                continue;
            }

            const flatIds = earcut(polygon.flat());
            const flatCoords = polygon.map((coord: number[]) => [coord[0], coord[1]]).flat();

            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

    static geometryCollectionToPolyline(feature: Feature, origin: number[], offset: number): { flatCoords: number[], flatIds: number[] }[] {
        const { geometries } = <GeometryCollection>feature.geometry;
        const meshes = [];
        for (const geom of geometries) {
            const syntheticFeature = { ...feature, geometry: geom } as Feature;
            if (geom.type === 'LineString') {
                meshes.push(...TriangulatorPolylines.lineStringToPolyline(syntheticFeature, origin, offset));
            } else if (geom.type === 'MultiLineString') {
                meshes.push(...TriangulatorPolylines.multiLineStringToPolyline(syntheticFeature, origin, offset));
            }
        }
        return meshes;
    }
}
