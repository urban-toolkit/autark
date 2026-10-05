/**
 * @module triangulator-buildings
 * Triangulates OSM-style building features into extruded mesh geometry.
 *
 * This module converts building `GeometryCollection` features into local-space
 * mesh chunks that can be consumed by the WebGPU layer pipeline. It aligns
 * part geometries with `feature.properties.parts`, resolves wall base and top
 * heights from common OSM tags, and delegates roof generation to
 * `triangulator-roofs`.
 */

import { 
    FeatureCollection,
    Feature, 
    LineString, 
    MultiLineString, 
    MultiPolygon, 
    Polygon, 
    GeoJsonProperties 
} from "geojson";

import { LayerComponent, LayerGeometry } from "./types-mesh";

import { buildBuildingPartMesh, MeshData } from "./triangulator-roofs";
import { getBuildingParts } from './building-feature';

/**
 * Builds extruded mesh geometry for OSM-style buildings.
 *
 * Each feature contains original component geometries associated with
 * `properties.parts[].geometryIndex` (legacy positional metadata is accepted).
 * Parts inherit building attributes and override them individually. For every supported part
 * geometry, the triangulator converts world coordinates into local XY space,
 * resolves wall heights from part metadata, and emits mesh chunks with feature
 * component counts. Roof geometry is delegated to `triangulator-roofs`.
 *
 * @example
 * const [mesh, components] = TriangulatorBuildings.buildMesh(buildings, origin);
 */
export class TriangulatorBuildings {
    /**
     * Builds extruded building geometry for an OSM-style building collection.
     *
     * @param geojson Source building feature collection.
     * @param origin World-space origin used to convert coordinates into local XY space.
     * @param allowZeroHeightBuildings When `true`, parts with missing height tags get a random fallback height.
     * Explicit zero or invalid height tags are never replaced by that fallback.
     * @returns A tuple of mesh chunks and per-feature component metadata.
     * @throws If building geometries or part indices are unsupported or ambiguous.
     * Parts without height metadata are skipped (or given fallback height).
     * @example
     * const [meshes, comps] = TriangulatorBuildings.buildMesh(buildingsFC, origin);
     */
    static buildMesh(geojson: FeatureCollection, origin: number[], allowZeroHeightBuildings: boolean = false): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];
        let skippedNoHeight = 0;

        for (let fId = 0; fId < geojson.features.length; fId++) {
            const feature = geojson.features[fId];
            const parts = getBuildingParts(feature);

            let nPoints = 0;
            let nTriangles = 0;

            for (const part of parts) {
                const partGeom = part.geometry;
                const partProps = part.properties;

                let heightInfo = TriangulatorBuildings.computeBuildingHeights(partProps);
                if (!heightInfo.length) { 
                    skippedNoHeight++;
                    const hasHeightTag = ['height', 'building:height', 'levels', 'building:levels'].some(key => key in partProps);
                    if (!allowZeroHeightBuildings || hasHeightTag) continue;
                    heightInfo = [0, (3 + 4 * Math.random()) * 3.4]; // Fallback only when height metadata is missing
                }

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

        if (skippedNoHeight > 0) {
            console.warn(`[TriangulatorBuildings] ${skippedNoHeight} parts: no valid height metadata`);
        }

        return [mesh, comps];
    }

    /**
     * Resolves wall base and top heights from OSM-style building properties.
     *
     * @param props Building-part properties to inspect (`height`, `min_height`, `levels`, etc.).
     * @returns A two-element array `[minHeight, height]`, or an empty array when
     * no valid height range can be derived.
     * @throws Never throws. Degenerate ranges return an empty array.
     */
    private static computeBuildingHeights(props: GeoJsonProperties): number[] {
        const FLOOR_HEIGHT = 3.4;

        if (props === null) return [];

        const num = (v: unknown): number => parseFloat(String(v)) || 0;

        let height = 0;
        if ('height' in props) height = num(props['height']);
        else if ('building:height' in props) height = num(props['building:height']);
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
     * @param coord World-space coordinate with at least XY components.
     * @param origin World-space origin used as the local offset basis.
     * @returns Local planar coordinate `[x, y]` relative to `origin`.
     * @throws Never throws.
     */
    private static toLocal(coord: number[], origin: number[]): [number, number] {
        return [coord[0] - origin[0], coord[1] - origin[1]];
    }
}
