/**
 * Converts OSM building GeometryCollections into extruded 3-D mesh geometry for WebGPU rendering.
 * Each feature contains a GeometryCollection of part polygons with `height`, `levels`, or `min_height` properties.
 * Delegates roof geometry to `triangulator-roofs`.
 * @module triangulator-buildings
 */

import { 
    FeatureCollection,
    Feature, 
    LineString, 
    MultiLineString, 
    MultiPolygon, 
    Polygon, 
    GeometryCollection, 
    GeoJsonProperties 
} from "geojson";

import { LayerComponent, LayerGeometry } from "./types-mesh";

import { buildBuildingPartMesh, MeshData } from "./triangulator-roofs";

/**
 * Triangulator for extruded building geometry based on OSM-style building features. Each building feature is expected 
 * to contain a `GeometryCollection` of part geometries plus aligned part metadata in `feature.properties.parts`.
 * Building heights are derived from OSM tags like `height`, `levels`, and `min_height`.
 * The resulting mesh includes wall geometry; roof geometry is delegated to `triangulator-roofs`.
 */
export class TriangulatorBuildings {
    /**
     * Builds extruded building geometry for an OSM-style building collection.
     *
     * Each feature is expected to contain a `GeometryCollection` of building
     * part geometries plus aligned part metadata in `feature.properties.parts`.
     *
     * @param geojson - Source building feature collection.
     * @param origin - World-space origin used to convert coordinates into local XY space.
     * @returns A tuple containing building geometry chunks and their per-feature component metadata.
     */
    static buildMesh(geojson: FeatureCollection, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        for (let fId = 0; fId < geojson.features.length; fId++) {
            const feature = geojson.features[fId];
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
                let chunks: MeshData[] = [];

                if (partGeom.type === 'LineString') {
                    const { coordinates } = <LineString>partFeature.geometry;
                    const ring: [number, number][] = coordinates.map(c => TriangulatorBuildings.toLocal(c, origin));
                    chunks = buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], partFeature.properties);
                } else if (partGeom.type === 'MultiLineString') {
                    const { coordinates } = <MultiLineString>partFeature.geometry;
                    for (const lineString of coordinates) {
                        const ring: [number, number][] = lineString.map(c => TriangulatorBuildings.toLocal(c, origin));
                        chunks.push(...buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], partFeature.properties));
                    }
                } else if (partGeom.type === 'Polygon') {
                    const { coordinates } = <Polygon>partFeature.geometry;
                    const rings: [number, number][][] = coordinates.map(ring =>
                        ring.map(c => TriangulatorBuildings.toLocal(c, origin))
                    );
                    chunks = buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], partFeature.properties);
                } else if (partGeom.type === 'MultiPolygon') {
                    const { coordinates } = <MultiPolygon>partFeature.geometry;
                    for (const polygon of coordinates) {
                        const rings: [number, number][][] = polygon.map(ring =>
                            ring.map(c => TriangulatorBuildings.toLocal(c, origin))
                        );
                        chunks.push(...buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], partFeature.properties));
                    }
                } else {
                    console.warn('Unsupported geometry type in building part:', partGeom.type);
                    continue;
                }

                for (const chunk of chunks) {
                    mesh.push({ 
                        position: new Float32Array(chunk.flatCoords), 
                        indices: new Uint32Array(chunk.flatIds),
                        featureIndex: fId,
                    });
                    nPoints += chunk.flatCoords.length / 3;
                    nTriangles += chunk.flatIds.length / 3;
                }
            }

            comps.push({ nPoints, nTriangles, featureIndex: fId, featureId: feature.id });
        }

        return [mesh, comps];
    }

    /**
     * Resolves wall base and top heights from OSM-style building properties.
     *
     * Height tags take precedence over level-count tags. Invalid or degenerate
     * height combinations return an empty array.
     *
     * @param props - Building-part properties to inspect.
     * @returns A two-element array `[minHeight, height]`, or an empty array when
     * no valid height range can be derived.
     */
    private static computeBuildingHeights(props: GeoJsonProperties): number[] {
        const FLOOR_HEIGHT = 3.4;

        if (props === null) return [];

        const num = (v: unknown): number => parseFloat(String(v)) || 0;

        let height = 0;
        if ('height' in props) height = num(props['height']);
        else if ('levels' in props) height = FLOOR_HEIGHT * num(props['levels']);
        else if ('building:levels' in props) height = FLOOR_HEIGHT * num(props['building:levels']);

        let min_height = 0;
        if ('min_height' in props) min_height = num(props['min_height']);
        else if ('min_level' in props && num(props['min_level']) >= 0) min_height = FLOOR_HEIGHT * num(props['min_level']);
        else if ('building:min_level' in props) min_height = FLOOR_HEIGHT * num(props['building:min_level']);

        if (height <= min_height) return [];
        return [min_height, height];
    }

    /**
     * Converts a world-space coordinate into local planar coordinates.
     *
     * @param coord - World-space coordinate with at least XY components.
     * @param origin - World-space origin used as the local offset basis.
     * @returns Local planar coordinate `[x, y]` relative to `origin`.
     */
    private static toLocal(coord: number[], origin: number[]): [number, number] {
        return [coord[0] - origin[0], coord[1] - origin[1]];
    }
}
