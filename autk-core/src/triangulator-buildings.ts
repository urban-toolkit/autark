import { FeatureCollection, Feature, LineString, MultiLineString, MultiPolygon, Polygon, GeometryCollection, GeoJsonProperties } from "geojson";

import { LayerComponent, LayerGeometry } from "./mesh-types";
import { extrudePolygons } from "poly-extrude";
import { buildBuildingPartMesh, MeshData } from "./triangulator-roofs";

type Vec2 = [number, number];

/** Roof shapes that require custom geometry beyond a simple flat extrusion. */
const NON_FLAT_ROOFS = new Set(['gabled', 'hipped', 'pyramidal', 'pyramid', 'skillion', 'half-hipped', 'mansard', 'saltbox', 'cone', 'dome', 'round']);

const globalRoofShapeCounts: Record<string, number> = {};
let globalLogTimeout: ReturnType<typeof setTimeout> | null = null;

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
                
                const shape = String(partProps['roof:shape'] || 'flat');
                globalRoofShapeCounts[shape] = (globalRoofShapeCounts[shape] || 0) + 1;
                if (!globalLogTimeout) {
                    globalLogTimeout = setTimeout(() => {
                        console.log('ALL encountered roof shapes:', { ...globalRoofShapeCounts });
                        globalLogTimeout = null;
                    }, 1000);
                }

                const heightInfo = TriangulatorBuildings.computeBuildingHeights(partProps);
                if (!heightInfo.length) { continue; }

                const partFeature: Feature = { type: 'Feature', geometry: partGeom, properties: partProps };
                let chunks: MeshData[];

                if (partGeom.type === 'LineString') {
                    chunks = TriangulatorBuildings.lineStringToBuilding(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'MultiLineString') {
                    chunks = TriangulatorBuildings.multiLineStringToBuilding(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'Polygon') {
                    chunks = TriangulatorBuildings.polygonToBuilding(partFeature, heightInfo, origin);
                } else if (partGeom.type === 'MultiPolygon') {
                    chunks = TriangulatorBuildings.multiPolygonToBuilding(partFeature, heightInfo, origin);
                } else {
                    console.warn('Unsupported geometry type in building part:', partGeom.type);
                    continue;
                }

                for (const chunk of chunks) {
                    mesh.push({ position: chunk.flatCoords, indices: chunk.flatIds });
                    nPoints += chunk.flatCoords.length / 3;
                    nTriangles += chunk.flatIds.length / 3;
                }
            }

            comps.push({ nPoints, nTriangles });
        }

        return [mesh, comps];
    }

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

        if (height <= min_height) return [];   // skip degenerate parts
        return [min_height, height];
    }

    private static toLocal(coord: number[], origin: number[]): Vec2 {
        return [coord[0] - origin[0], coord[1] - origin[1]];
    }

    /** True when this building part has a non-flat roof shape that needs custom geometry. */
    private static hasNonFlatRoof(props: GeoJsonProperties): boolean {
        return NON_FLAT_ROOFS.has(String(props?.['roof:shape'] ?? ''));
    }

    // ─── Flat-roof fallback (original extrudePolygons path) ───────────────────

    static lineStringToBuilding(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        if (TriangulatorBuildings.hasNonFlatRoof(feature.properties)) {
            const { coordinates } = <LineString>feature.geometry;
            const ring: Vec2[] = coordinates.map(c => TriangulatorBuildings.toLocal(c, origin));
            return buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], feature.properties);
        }
        return TriangulatorBuildings.extrudeLineString(feature, heightInfo, origin);
    }

    static multiLineStringToBuilding(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        const { coordinates } = <MultiLineString>feature.geometry;
        const chunks: MeshData[] = [];
        for (const lineString of coordinates) {
            if (TriangulatorBuildings.hasNonFlatRoof(feature.properties)) {
                const ring: Vec2[] = lineString.map(c => TriangulatorBuildings.toLocal(c, origin));
                chunks.push(...buildBuildingPartMesh([ring], heightInfo[0], heightInfo[1], feature.properties));
            } else {
                const coords = lineString.map(c => [c[0] - origin[0], c[1] - origin[1]]);
                const result = extrudePolygons([[coords]], { depth: heightInfo[1] - heightInfo[0] });
                const flatCoords = Array.from(result.position).map((v: number, id: number) => id % 3 === 2 ? v + heightInfo[0] : v);
                chunks.push({ flatCoords, flatIds: Array.from(result.indices) });
            }
        }
        return chunks;
    }

    static polygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        if (TriangulatorBuildings.hasNonFlatRoof(feature.properties)) {
            const { coordinates } = <Polygon>feature.geometry;
            const rings: Vec2[][] = coordinates.map(ring =>
                ring.map(c => TriangulatorBuildings.toLocal(c, origin))
            );
            return buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], feature.properties);
        }
        return TriangulatorBuildings.extrudePolygon(feature, heightInfo, origin);
    }

    static multiPolygonToBuilding(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        const { coordinates } = <MultiPolygon>feature.geometry;
        const chunks: MeshData[] = [];
        for (const polygon of coordinates) {
            if (TriangulatorBuildings.hasNonFlatRoof(feature.properties)) {
                const rings: Vec2[][] = polygon.map(ring =>
                    ring.map(c => TriangulatorBuildings.toLocal(c, origin))
                );
                chunks.push(...buildBuildingPartMesh(rings, heightInfo[0], heightInfo[1], feature.properties));
            } else {
                const coords = polygon.map(ring => ring.map(c => [c[0] - origin[0], c[1] - origin[1]]));
                const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });
                const flatCoords = Array.from(result.position).map((v: number, id: number) => id % 3 === 2 ? v + heightInfo[0] : v);
                chunks.push({ flatCoords, flatIds: Array.from(result.indices) });
            }
        }
        return chunks;
    }

    // ─── Original extrudePolygons helpers ─────────────────────────────────────

    private static extrudeLineString(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        const { coordinates } = <LineString>feature.geometry;
        const coords = coordinates.map(c => [c[0] - origin[0], c[1] - origin[1]]);
        const result = extrudePolygons([[coords]], { depth: heightInfo[1] - heightInfo[0] });
        const flatCoords = Array.from(result.position).map((v: number, id: number) => id % 3 === 2 ? v + heightInfo[0] : v);
        return [{ flatCoords, flatIds: Array.from(result.indices) }];
    }

    private static extrudePolygon(feature: Feature, heightInfo: number[], origin: number[]): MeshData[] {
        const { coordinates } = <Polygon>feature.geometry;
        const coords: number[][][] = coordinates.map(ring =>
            ring.map(c => [c[0] - origin[0], c[1] - origin[1]])
        );
        const result = extrudePolygons([coords], { depth: heightInfo[1] - heightInfo[0] });
        const flatCoords = Array.from(result.position).map((v: number, id: number) => id % 3 === 2 ? v + heightInfo[0] : v);
        return [{ flatCoords, flatIds: Array.from(result.indices) }];
    }
}
