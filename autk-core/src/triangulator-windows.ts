import { Feature, FeatureCollection, GeoJsonProperties, Geometry, Point } from 'geojson';

import { LayerComponent, LayerGeometry } from './types-mesh';

const BUILDING_WINDOW_TARGET_SPACING = 6;
const BUILDING_WINDOW_CELL_FILL = 1;
const DEFAULT_BUILDING_HEIGHT = 20;
const DEFAULT_FLOOR_HEIGHT = 3.4;

export interface BuildingWindowLayoutEntry {
    windowId: string;
    sourceFeatureIndex: number;
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

export class TriangulatorBuildingWithWindows {
    static buildMesh(geojson: FeatureCollection, origin: number[], floors: number): [LayerGeometry[], LayerComponent[]] {
        const geometry: LayerGeometry[] = [];
        const components: LayerComponent[] = [];
        const layout = this.buildWindowLayout(geojson, floors);

        for (let sourceFeatureIndex = 0; sourceFeatureIndex < geojson.features.length; sourceFeatureIndex++) {
            const feature = geojson.features[sourceFeatureIndex];
            const hull = this.computeConvexHull(feature);
            if (!hull) continue;

            this.addRoofGeometry({
                geometry,
                components,
                hull,
                roofZ: this.resolveHeight(feature),
                origin,
                featureIndex: sourceFeatureIndex,
            });
        }

        for (const window of layout.windows) {
            const tangent: [number, number, number] = [-window.normal[1], window.normal[0], 0];
            const halfWidth = window.width * 0.5;
            const halfHeight = window.height * 0.5;

            this.addQuadGeometry({
                geometry,
                components,
                corners: [
                    toLocal([
                        window.center[0] - tangent[0] * halfWidth,
                        window.center[1] - tangent[1] * halfWidth,
                        window.center[2] - halfHeight,
                    ], origin),
                    toLocal([
                        window.center[0] + tangent[0] * halfWidth,
                        window.center[1] + tangent[1] * halfWidth,
                        window.center[2] - halfHeight,
                    ], origin),
                    toLocal([
                        window.center[0] + tangent[0] * halfWidth,
                        window.center[1] + tangent[1] * halfWidth,
                        window.center[2] + halfHeight,
                    ], origin),
                    toLocal([
                        window.center[0] - tangent[0] * halfWidth,
                        window.center[1] - tangent[1] * halfWidth,
                        window.center[2] + halfHeight,
                    ], origin),
                ],
                featureIndex: window.sourceFeatureIndex,
                featureId: window.windowId,
            });
        }

        return [geometry, components];
    }

    static buildWindowLayout(source: FeatureCollection, floors: number): BuildingWindowLayoutResult {
        const safeFloors = Math.max(1, Math.floor(floors));
        const features: Array<Feature<Point>> = [];
        const windows: BuildingWindowLayoutEntry[] = [];

        source.features.forEach((feature, sourceFeatureIndex) => {
            const hull = this.computeConvexHull(feature);
            if (!hull || hull.length < 3) return;

            const buildingHeight = this.resolveHeight(feature);
            const floorHeight = Math.max(1, buildingHeight / safeFloors);
            const orientation = computeRingArea(hull) >= 0 ? 1 : -1;

            for (let edgeIndex = 0; edgeIndex < hull.length; edgeIndex++) {
                const start = hull[edgeIndex];
                const end = hull[(edgeIndex + 1) % hull.length];
                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const length = Math.hypot(dx, dy);
                if (length < 1e-6) continue;

                const dirX = dx / length;
                const dirY = dy / length;
                const normalX = orientation >= 0 ? dirY : -dirY;
                const normalY = orientation >= 0 ? -dirX : dirX;
                const windowsOnEdge = Math.max(1, Math.floor(length / BUILDING_WINDOW_TARGET_SPACING));
                const edgeStep = length / windowsOnEdge;
                const windowWidth = Math.max(1.2, edgeStep * BUILDING_WINDOW_CELL_FILL);
                const windowHeight = Math.max(1.4, floorHeight * BUILDING_WINDOW_CELL_FILL);

                for (let floorIndex = 0; floorIndex < safeFloors; floorIndex++) {
                    const z = Math.min(buildingHeight - 0.5, (floorIndex + 0.5) * floorHeight);
                    for (let windowIndex = 0; windowIndex < windowsOnEdge; windowIndex++) {
                        const distanceAlongEdge = edgeStep * (windowIndex + 0.5);
                        const center: [number, number, number] = [
                            start[0] + dirX * distanceAlongEdge,
                            start[1] + dirY * distanceAlongEdge,
                            Math.max(0.5, z),
                        ];
                        const normal: [number, number, number] = [normalX, normalY, 0];
                        const windowId = `${sourceFeatureIndex}:${edgeIndex}:${floorIndex}:${windowIndex}`;
                        const entry: BuildingWindowLayoutEntry = {
                            windowId,
                            sourceFeatureIndex,
                            edgeIndex,
                            floorIndex,
                            windowIndex,
                            center,
                            normal,
                            width: windowWidth,
                            height: windowHeight,
                            buildingHeight,
                        };

                        windows.push(entry);
                        features.push({
                            type: 'Feature',
                            id: windowId,
                            geometry: { type: 'Point', coordinates: center },
                            properties: {
                                windowId,
                                sourceFeatureIndex,
                                edgeIndex,
                                floorIndex,
                                windowIndex,
                                center,
                                normal,
                                width: windowWidth,
                                height: windowHeight,
                                buildingHeight,
                            },
                        });
                    }
                }
            }
        });

        return { collection: { type: 'FeatureCollection', features }, windows };
    }

    static resolveFootprint(feature: Feature<Geometry | null, GeoJsonProperties>): number[][] | null {
        const geometry = feature.geometry;
        if (!geometry) return null;

        let bestRing: number[][] | null = null;
        let bestArea = -1;

        const consider = (ring: number[][] | undefined) => {
            if (!ring || ring.length < 3) return;
            const normalized = normalizeRing(ring);
            if (normalized.length < 3) return;
            const area = Math.abs(computeRingArea(normalized));
            if (area > bestArea) {
                bestArea = area;
                bestRing = normalized;
            }
        };

        visitFootprintRings(geometry, consider);
        return bestRing;
    }

    static resolveHeight(feature: Feature<Geometry | null, GeoJsonProperties>): number {
        const rootProps = (feature.properties ?? {}) as Record<string, unknown>;
        const parts = Array.isArray(rootProps.parts) ? (rootProps.parts as GeoJsonProperties[]) : [];

        const parseHeight = (props?: GeoJsonProperties): number | null => {
            if (!props) return null;
            const rawHeight = Number.parseFloat(String(props.height ?? props['building:height'] ?? ''));
            const rawLevels = Number.parseFloat(String(props['building:levels'] ?? props.levels ?? ''));
            if (Number.isFinite(rawHeight) && rawHeight > 0) return rawHeight;
            if (Number.isFinite(rawLevels) && rawLevels > 0) return rawLevels * DEFAULT_FLOOR_HEIGHT;
            return null;
        };

        const partHeights = parts.map((part) => parseHeight(part)).filter((value): value is number => value !== null);
        if (partHeights.length > 0) {
            return Math.max(...partHeights);
        }

        return parseHeight(rootProps as GeoJsonProperties) ?? DEFAULT_BUILDING_HEIGHT;
    }

    static computeConvexHull(feature: Feature<Geometry | null, GeoJsonProperties>): number[][] | null {
        const footprintPoints = collectBuildingFootprintPoints(feature);
        if (footprintPoints.length < 3) {
            return null;
        }

        const hull = computeConvexHull(footprintPoints);
        return hull.length >= 3 ? hull : null;
    }

    private static addRoofGeometry(params: {
        geometry: LayerGeometry[];
        components: LayerComponent[];
        hull: number[][];
        roofZ: number;
        origin: number[];
        featureIndex: number;
    }): void {
        if (params.hull.length < 3) {
            return;
        }

        const position = new Float32Array(params.hull.length * 3);
        const indices = new Uint32Array((params.hull.length - 2) * 3);

        params.hull.forEach(([x, y], index) => {
            const local = toLocal([x, y, params.roofZ], params.origin);
            position.set(local, index * 3);
        });

        let offset = 0;
        for (let i = 1; i < params.hull.length - 1; i++) {
            indices[offset++] = 0;
            indices[offset++] = i;
            indices[offset++] = i + 1;
        }

        params.geometry.push({ position, indices, featureIndex: params.featureIndex });
        params.components.push({
            nPoints: params.hull.length,
            nTriangles: params.hull.length - 2,
            featureIndex: params.featureIndex,
        });
    }

    private static addQuadGeometry(params: {
        geometry: LayerGeometry[];
        components: LayerComponent[];
        corners: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
        featureIndex: number;
        featureId?: string;
    }): void {
        const position = new Float32Array(params.corners.flat());
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        params.geometry.push({ position, indices, featureIndex: params.featureIndex });
        params.components.push({
            nPoints: 4,
            nTriangles: 2,
            featureIndex: params.featureIndex,
            featureId: params.featureId,
        });
    }
}

function collectBuildingFootprintPoints(feature: Feature<Geometry | null, GeoJsonProperties>): number[][] {
    const geometry = feature.geometry;
    if (!geometry) {
        return [];
    }

    const points: number[][] = [];
    visitFootprintRings(geometry, (ring) => {
        if (!ring || ring.length < 3) return;
        const normalized = normalizeRing(ring);
        if (normalized.length < 3) return;
        for (const point of normalized) {
            points.push(point);
        }
    });
    return points;
}

function visitFootprintRings(geometry: Geometry, visit: (ring: number[][] | undefined) => void): void {
    if (geometry.type === 'Polygon') {
        visit(geometry.coordinates[0]);
        return;
    }
    if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
            visit(polygon[0]);
        }
        return;
    }
    if (geometry.type === 'GeometryCollection') {
        for (const child of geometry.geometries) {
            if (child) visitFootprintRings(child, visit);
        }
    }
}

function toLocal(point: [number, number, number], origin: number[]): [number, number, number] {
    return [point[0] - origin[0], point[1] - origin[1], point[2]];
}

function normalizeRing(ring: number[][]): number[][] {
    if (ring.length < 2) return [...ring];
    const normalized = [...ring];
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
        normalized.pop();
    }
    return normalized;
}

function computeConvexHull(points: number[][]): number[][] {
    const unique = Array.from(new Map(
        normalizeRing(points).map((point) => [`${point[0]},${point[1]}`, point as [number, number]])
    ).values());

    if (unique.length <= 3) {
        return unique.map(([x, y]) => [x, y]);
    }

    unique.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

    const lower: Array<[number, number]> = [];
    for (const point of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: Array<[number, number]> = [];
    for (let i = unique.length - 1; i >= 0; i--) {
        const point = unique[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper].map(([x, y]) => [x, y]);
}

function cross(a: [number, number], b: [number, number], c: [number, number]): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function computeRingArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return area * 0.5;
}
