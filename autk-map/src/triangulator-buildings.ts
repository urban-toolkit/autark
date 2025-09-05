
import { FeatureCollection, Feature } from "geojson";
import { Triangulator } from "./triangulator";

import { ILayerComponent, ILayerGeometry } from "./interfaces";

/**
 * Class for triangulating buildings from GeoJSON features.
 * It provides methods to convert different geometry types into building meshes.
 */
export class TriangulatorBuildings extends Triangulator {
    /**
     * Builds a mesh from GeoJSON features representing buildings.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[ILayerGeometry[], ILayerComponent[]]} An array of geometries and components
     */
    static override buildMesh(geojson: FeatureCollection, origin: number[]): [ILayerGeometry[], ILayerComponent[]] {
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
                    meshes = Triangulator.lineStringToBuilding(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'MultiLineString') {
                    meshes = Triangulator.multiLineStringToBuilding(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'Polygon') {
                    meshes = Triangulator.polygonToBuilding(feature, heightInfo, origin);

                } else if (feature.geometry.type === 'MultiPolygon') {
                    meshes = Triangulator.multiPolygonToBuilding(feature, heightInfo, origin);

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

    /**
     * Groups buildings based on their id.
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @returns {Feature[][]} An array of grouped features
     */
    private static groupBuildings(geojson: FeatureCollection): Feature[][] {
        // checks if is a valid feature
        let filtered = TriangulatorBuildings.removeInvalidBuildingParts(geojson.features);

        const groups: { [key: string]: Feature[] } = {};
        for (const feat of filtered) {
            let key = feat.properties ? feat.properties.building_id as string : '-1';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(feat);
        }

        return Object.values(groups);
    }

    /**
     * Removes invalid building parts from the feature collection.
     * @param {Feature[]} features The array of GeoJSON features
     * @returns {Feature[]} The filtered array of valid features
     */
    private static removeInvalidBuildingParts(features: Feature[]): Feature[] {

        const filtered = features.filter((feat: Feature) => {
            if (feat.properties === null) {
                return false;
            }

            if (feat.properties['building'] === 'roof' || feat.properties['building:part'] === 'roof') {
                return false;
            }

            if (!('height' in feat.properties) && !('levels' in feat.properties) && !('building:levels' in feat.properties)) {
                return false;
            }

            return true;
        });

        return filtered;
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
}