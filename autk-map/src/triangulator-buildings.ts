
import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon, GeometryCollection, GeoJsonProperties } from "geojson";

import { LayerComponent, LayerGeometry } from "./interfaces";
import { extrudePolygons } from "poly-extrude";

/**
 * Class for triangulating buildings from GeoJSON features.
 * Each feature must have a GeometryCollection geometry (one sub-geometry per building part)
 * and a 'parts' property array whose indices align with geometry.geometries.
 */
export class TriangulatorBuildings {
    /**
     * Builds a mesh from GeoJSON features representing buildings.
     * Each feature is one building; its geometry is a GeometryCollection of part polygons
     * and its properties.parts array holds the per-part OSM properties (height, min_height, etc.).
     * One LayerComponent is emitted per building feature.
     *
     * @param {FeatureCollection} geojson The GeoJSON feature collection
     * @param {number[]} origin The origin point for translation
     * @returns {[LayerGeometry[], LayerComponent[]]} An array of geometries and components
     */
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
                let meshes: { flatCoords: number[], flatIds: number[] }[] = [];

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
     * Computes the extrusion heights for a building part from its OSM properties.
     * @param {GeoJsonProperties} props The properties of the building part
     * @returns {number[]} [min_height, max_height], or empty array if properties are null
     */
    private static computeBuildingHeights(props: GeoJsonProperties): number[] {
        const z_SCALE = 1.0;
        const FLOOR_HEIGHT = 3.4; // in meters

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
