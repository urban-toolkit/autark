/**
 * @module triangulator-windows
 * Procedural roofs and facade windows on original building parts, without convex hulls.
 */
import { Feature, FeatureCollection, GeoJsonProperties, Geometry, Point } from 'geojson';
import { LayerComponent, LayerGeometry } from './types-mesh';
import { computeRingArea, normalizeRing } from './utils-geometry';
import { getBuildingParts } from './building-feature';
import { flatRoof } from './triangulator-roofs';

const BUILDING_WINDOW_TARGET_SPACING = 6;
const DEFAULT_BUILDING_HEIGHT = 20;
const DEFAULT_FLOOR_HEIGHT = 3.4;

/** Metadata for one facade window, associated with its original building component. */
export interface BuildingWindowLayoutEntry {
    windowId: string;
    sourceFeatureIndex: number;
    geometryIndex: number;
    polygonIndex: number;
    ringIndex: number;
    edgeIndex: number;
    floorIndex: number;
    windowIndex: number;
    center: [number, number, number];
    normal: [number, number, number];
    width: number;
    height: number;
    buildingHeight: number;
}

export interface BuildingWindowLayoutResult {
    collection: FeatureCollection<Point>;
    windows: BuildingWindowLayoutEntry[];
}

/** Generates per-part roofs and windows while retaining one source feature identity. */
export class TriangulatorBuildingWithWindows {
    /**
     * Triangulates flat roofs (including holes) and facade windows on original parts.
     * @throws If building geometry or part metadata is ambiguous or unsupported.
     */
    static buildMesh(geojson: FeatureCollection, origin: number[], floors: number): [LayerGeometry[], LayerComponent[]] {
        const geometry: LayerGeometry[] = [];
        const components: LayerComponent[] = [];
        for (let featureIndex = 0; featureIndex < geojson.features.length; featureIndex++) {
            const feature = geojson.features[featureIndex];
            for (const part of this.footprints(feature)) {
                const rings = part.rings.map(ring => ring.map(p => [p[0] - origin[0], p[1] - origin[1]] as [number, number]));
                const roof = flatRoof(rings, part.height);
                geometry.push({ position: new Float32Array(roof.flatCoords), indices: new Uint32Array(roof.flatIds), featureIndex });
                components.push({ nPoints: roof.flatCoords.length / 3, nTriangles: roof.flatIds.length / 3,
                    featureIndex, featureId: feature.id });
            }
        }

        const layout = this.buildWindowLayout(geojson, floors);
        for (const window of layout.windows) {
            const tangent = [-window.normal[1], window.normal[0]];
            const halfWidth = window.width * 0.5;
            const halfHeight = window.height * 0.5;
            const position = new Float32Array([
                window.center[0] - tangent[0] * halfWidth - origin[0], window.center[1] - tangent[1] * halfWidth - origin[1], window.center[2] - halfHeight,
                window.center[0] + tangent[0] * halfWidth - origin[0], window.center[1] + tangent[1] * halfWidth - origin[1], window.center[2] - halfHeight,
                window.center[0] + tangent[0] * halfWidth - origin[0], window.center[1] + tangent[1] * halfWidth - origin[1], window.center[2] + halfHeight,
                window.center[0] - tangent[0] * halfWidth - origin[0], window.center[1] - tangent[1] * halfWidth - origin[1], window.center[2] + halfHeight,
            ]);
            geometry.push({ position, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), featureIndex: window.sourceFeatureIndex });
            components.push({ nPoints: 4, nTriangles: 2, featureIndex: window.sourceFeatureIndex, featureId: window.windowId });
        }
        return [geometry, components];
    }

    /**
     * Places windows on original outer and courtyard rings, at each part's height/base.
     * IDs include component/ring indices, avoiding collisions between parts.
     * @throws If building geometry or part metadata is ambiguous or unsupported.
     */
    static buildWindowLayout(source: FeatureCollection, floors: number): BuildingWindowLayoutResult {
        if (!Number.isFinite(floors)) throw new Error('Window floors must be finite');
        const safeFloors = Math.max(1, Math.floor(floors));
        const features: Array<Feature<Point>> = [];
        const windows: BuildingWindowLayoutEntry[] = [];
        source.features.forEach((feature, sourceFeatureIndex) => {
            for (const part of this.footprints(feature)) {
                const floorHeight = (part.height - part.base) / safeFloors;
                part.rings.forEach((rawRing, ringIndex) => {
                    const ring = normalizeRing(rawRing);
                    const orientation = (computeRingArea(ring) >= 0 ? 1 : -1) * (ringIndex === 0 ? 1 : -1);
                    for (let edgeIndex = 0; edgeIndex < ring.length; edgeIndex++) {
                        const start = ring[edgeIndex];
                        const end = ring[(edgeIndex + 1) % ring.length];
                        const dx = end[0] - start[0];
                        const dy = end[1] - start[1];
                        const length = Math.hypot(dx, dy);
                        if (length < 1e-6) continue;
                        const dirX = dx / length;
                        const dirY = dy / length;
                        const normal: [number, number, number] = [orientation * dirY, -orientation * dirX, 0];
                        const windowsOnEdge = Math.max(1, Math.floor(length / BUILDING_WINDOW_TARGET_SPACING));
                        const edgeStep = length / windowsOnEdge;
                        for (let floorIndex = 0; floorIndex < safeFloors; floorIndex++) {
                            for (let windowIndex = 0; windowIndex < windowsOnEdge; windowIndex++) {
                                const distance = edgeStep * (windowIndex + 0.5);
                                const center: [number, number, number] = [start[0] + dirX * distance, start[1] + dirY * distance,
                                    part.base + (floorIndex + 0.5) * floorHeight];
                                const windowId = `${sourceFeatureIndex}:${part.geometryIndex}:${part.polygonIndex}:${ringIndex}:${edgeIndex}:${floorIndex}:${windowIndex}`;
                                const entry: BuildingWindowLayoutEntry = {
                                    windowId, sourceFeatureIndex, geometryIndex: part.geometryIndex, polygonIndex: part.polygonIndex,
                                    ringIndex, edgeIndex, floorIndex, windowIndex, center, normal,
                                    width: edgeStep, height: floorHeight, buildingHeight: part.height,
                                };
                                windows.push(entry);
                                features.push({ type: 'Feature', id: windowId, geometry: { type: 'Point', coordinates: center }, properties: { ...entry } });
                            }
                        }
                    }
                });
            }
        });
        return { collection: { type: 'FeatureCollection', features }, windows };
    }

    /** Returns the maximum effective part height, with the existing missing-height fallback. */
    static resolveHeight(feature: Feature<Geometry | null, GeoJsonProperties>): number {
        const heights = getBuildingParts(feature).map(part => {
            const props = part.properties;
            const rawHeight = props.height ?? props['building:height'];
            if (rawHeight !== undefined) {
                const height = Number.parseFloat(String(rawHeight));
                return Number.isFinite(height) ? Math.max(0, height) : DEFAULT_BUILDING_HEIGHT;
            }
            const levels = Number.parseFloat(String(props.levels ?? props['building:levels'] ?? ''));
            return Number.isFinite(levels) ? Math.max(0, levels * DEFAULT_FLOOR_HEIGHT) : DEFAULT_BUILDING_HEIGHT;
        });
        return heights.length ? Math.max(...heights) : DEFAULT_BUILDING_HEIGHT;
    }

    /** Resolves polygon/ring components and effective heights without constructing new footprints. */
    private static footprints(feature: Feature): Array<{
        rings: number[][][];
        geometryIndex: number;
        polygonIndex: number;
        height: number;
        base: number;
    }> {
        const result: Array<{ rings: number[][][]; geometryIndex: number; polygonIndex: number; height: number; base: number }> = [];
        for (const part of getBuildingParts(feature)) {
            const geometry = part.geometry;
            const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon' ? geometry.coordinates
                : geometry.type === 'LineString' ? [[geometry.coordinates]]
                : geometry.type === 'MultiLineString' ? geometry.coordinates.map(ring => [ring]) : [];
            const height = this.resolveHeight({ type: 'Feature', geometry, properties: part.properties });
            const props = part.properties;
            const base = Math.max(0, props.min_height !== undefined ? Number.parseFloat(String(props.min_height)) || 0
                : (Number.parseFloat(String(props.min_level ?? props['building:min_level'] ?? '0')) || 0) * DEFAULT_FLOOR_HEIGHT);
            if (height <= base) continue;
            polygons.forEach((rings, polygonIndex) => {
                if (rings[0]?.length >= 3) result.push({ rings, geometryIndex: part.geometryIndex, polygonIndex, height, base });
            });
        }
        return result;
    }
}
