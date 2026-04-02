import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon, GeometryCollection, GeoJsonProperties } from "geojson";

import { LayerComponent, LayerGeometry } from "./mesh-types";
import { extrudePolygons } from "poly-extrude";

export class TriangulatorBuildings {
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        for (const feature of geojson.features) {
            if (feature.geometry?.type !== 'GeometryCollection') {
                console.warn('Expected GeometryCollection for building feature, got:', feature.geometry?.type);
                continue;
            }

            const geometries = (feature.geometry as GeometryCollection).geometries;
            const parts = (feature.properties?.parts ?? []) as GeoJsonProperties[];

            let nPoints = 0;
            let nTriangles = 0;

            for (let i = 0; i < geometries.length; i++) {
                const partGeom = geometries[i];
                const partProps = parts[i] ?? {};
                const heightInfo = TriangulatorBuildings.computeBuildingHeights(partProps);
                if (!heightInfo.length) { continue; }

                const partFeature: Feature = { type: 'Feature', geometry: partGeom, properties: partProps };
                let meshes: { flatCoords: number[], flatIds: number[] }[];

                if (partGeom.type === 'LineString') {
                    meshes = TriangulatorBuildings.lineStringToBuildingMesh(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'MultiLineString') {
                    meshes = TriangulatorBuildings.multiLineStringToBuilding(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'Polygon') {
                    meshes = TriangulatorBuildings.polygonToBuilding(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'MultiPolygon') {
                    meshes = TriangulatorBuildings.multiPolygonToBuilding(partFeature, heightInfo, origin);
                } else {
                    console.warn('Unsupported geometry type in building part:', partGeom.type);
                    continue;
                }

                for (const triangulation of meshes) {
                    mesh.push({ position: triangulation.flatCoords, indices: triangulation.flatIds });
                    nPoints += triangulation.flatCoords.length / 3;
                    nTriangles += triangulation.flatIds.length / 3;
                }
            }

            comps.push({ nPoints, nTriangles });
        }

        return [mesh, comps];
    }

    private static computeBuildingHeights(props: GeoJsonProperties): number[] {
        const z_SCALE = 1.0;
        const FLOOR_HEIGHT = 3.4;

        if (props === null) return [];

        let height = 0;
        if ('height' in props) height = props['height'];
        else if ('levels' in props) height = FLOOR_HEIGHT * props['levels'];
        else if ('building:levels' in props) height = FLOOR_HEIGHT * props['building:levels'];

        let min_height = 0;
        if ('min_height' in props) min_height = props['min_height'];
        else if ('min_level' in props && props['min_level'] >= 0) min_height = FLOOR_HEIGHT * props['min_level'];
        else if ('building:min_level' in props) min_height = FLOOR_HEIGHT * props['building:min_level'];

        return [z_SCALE * min_height, z_SCALE * height];
    }

    static lineStringToBuildingMesh(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;
        const coords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
        const result = extrudePolygons([[coords]], { depth: heightInfo[1] - heightInfo[0] });
        const flatCoords = Array.from(result.position).map((cord: number, id: number) => id % 3 === 2 ? cord + heightInfo[0] : cord);
        const flatIds = Array.from(result.indices);
        return [{ flatCoords, flatIds }];
    }

    static multiLineStringToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <MultiLineString>feature.geometry;
        const meshes = [];
        for (const lineString of coordinates) {
            const coords = lineString.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
            const result = extrudePolygons([[coords]], { depth: heightInfo[1] - heightInfo[0] });
            const flatCoords = Array.from(result.position).map((cord: number, id: number) => id % 3 === 2 ? cord + heightInfo[0] : cord);
            const flatIds = Array.from(result.indices);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }

    static polygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <Polygon>feature.geometry;
        const coords = [];
        for (let i = 0; i < coordinates.length; i++) {
            coords.push(coordinates[i].map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]));
        }
        const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });
        const flatCoords = Array.from(result.position).map((cord: number, id: number) => id % 3 === 2 ? cord + heightInfo[0] : cord);
        const flatIds = Array.from(result.indices);
        return [{ flatCoords, flatIds }];
    }

    static multiPolygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const meshes = [];
        const { coordinates } = <MultiPolygon>feature.geometry;
        for (const polygon of coordinates) {
            const coords = [];
            for (let i = 0; i < polygon.length; i++) {
                coords.push(polygon[i].map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]));
            }
            const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });
            const flatCoords = Array.from(result.position).map((cord: number, id: number) => id % 3 === 2 ? cord + heightInfo[0] : cord);
            const flatIds = Array.from(result.indices);
            meshes.push({ flatCoords, flatIds });
        }
        return meshes;
    }
}
