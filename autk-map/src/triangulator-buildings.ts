
import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";

import { ILayerComponent, ILayerGeometry } from "./interfaces";
import { extrudePolygons } from "poly-extrude";

/**
 * Class for triangulating buildings from GeoJSON features.
 * It provides methods to convert different geometry types into building meshes.
 */
export class TriangulatorBuildings {
    /**
     * Builds a mesh from GeoJSON features representing buildings.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
        const mesh: ILayerGeometry[] = [];
        const comps: ILayerComponent[] = [];

        // translate based on origin
        const groups: Feature[][] = this.groupBuildings(geojson);

        let meshes: { flatCoords: number[], flatIds: number[] }[] = [];

        // iterate over groups
        for (let gId = 0; gId < groups.length; gId++) {

            let nPoints = 0;
            let nTriangles = 0;

            // for each feature of the group
            for (let fId=0; fId<groups[gId].length; fId++) {
                // gets the feature
                const feature = groups[gId][fId];

                // get the heights
                const heightInfo = TriangulatorBuildings.computeBuildingHeights(feature);
                if (!heightInfo.length) { continue; }

                if (feature.geometry.type === 'LineString') {
                    meshes = TriangulatorBuildings.lineStringToBuildingMesh(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'MultiLineString') {
                    meshes = TriangulatorBuildings.multiLineStringToBuilding(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'Polygon') {
                    meshes = TriangulatorBuildings.polygonToBuilding(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'MultiPolygon') {
                    meshes = TriangulatorBuildings.multiPolygonToBuilding(feature, heightInfo, origin);

                } else {
                    console.warn('Unsupported geometry type:', feature.geometry.type);
                    continue;
                }

                for (const triangulation of meshes) {
                    mesh.push({
                        position: triangulation.flatCoords,
                        indices: triangulation.flatIds
                    });

                    nPoints += triangulation.flatCoords.length / 3;
                    nTriangles += triangulation.flatIds.length / 3;
                }
            }

            comps.push({ nPoints, nTriangles });
        }

        return [mesh, comps];
    }

    //---------------------------------------------------------------------------

    /**
     * Groups buildings based on their id.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @returns {Feature[][]} An array of grouped features
     */
    private static groupBuildings(geojson: FeatureCollection): Feature[][] {

        const groups: { [key: string]: Feature[] } = {};
        for (const feat of geojson.features) {
            let key = feat.properties ? feat.properties.building_id as string : '-1';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(feat);
        }

        return Object.values(groups);
    }

    /**
     * Computes the heights of a building feature.
     * @param {Feature} feature The GeoJSON feature representing a building
     * @returns {number[]} An array containing the minimum and maximum heights
     */
    private static computeBuildingHeights(feature: Feature): number[] {
        const z_SCALE = 1.0;
        const FLOOR_HEIGHT = 3.4; // in meters

        const props = feature.properties;

        // unavailable building info
        if (props === null) {
            return [];
        }

        // height computation
        let height = 0;
        if ('height' in props) {
            height = props['height'];
        }
        else if ('levels' in props) {
            height = FLOOR_HEIGHT * props['levels'];
        }
        else if ('building:levels' in props) {
            height = FLOOR_HEIGHT * props['building:levels'];
        }

        // min height computation
        let min_height = 0;
        if ('min_height' in props) {
            min_height = props['min_height'];
        }
        else if ('min_level' in props && props['min_level'] >= 0) {
            min_height = FLOOR_HEIGHT * props['min_level'];
        }
        else if ('building:min_level' in props) {
            min_height = FLOOR_HEIGHT * props['building:min_level'];
        }

        return [z_SCALE * min_height, z_SCALE * height];
    }

    //---------------------------------------------------------------------------

    /**
     * Converts a LineString feature to a border representation.
     * @param {Feature} feature The GeoJSON feature representing a LineString
     * @param {number[]} origin The origin point for translation
     * @returns {ILayerBorder[]} An array of borders
     */
    static lineStringToBuildingMesh(feature: Feature, heightInfo: number[], origin: number[]): { flatCoords: number[], flatIds: number[] }[] {
        const { coordinates } = <LineString>feature.geometry;

        const coords = coordinates.map((cord: number[]) => [cord[0] - origin[0], cord[1] - origin[1]]);
        const result = extrudePolygons([[coords]], { depth: heightInfo[1] - heightInfo[0] });

        const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
            if (id % 3 === 2) return cord + heightInfo[0];
            return cord;
        });
        const flatIds = Array.from(result.indices);

        return [{ flatCoords, flatIds }];
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
            const result = extrudePolygons([[coords]],{ depth: heightInfo[1] - heightInfo[0] });

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

        const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });

        const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
            if (id % 3 === 2) return cord + heightInfo[0];
            return cord;
        });
        const flatIds = Array.from(result.indices);

        return [{ flatCoords, flatIds }];
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

            const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });

            const flatCoords = Array.from(result.position).map((cord: number, id: number) => {
                if (id % 3 === 2) return cord + heightInfo[0];
                return cord;
            });
            const flatIds = Array.from(result.indices);
            
            meshes.push({ flatCoords, flatIds });
        }

        return meshes;
    }

}