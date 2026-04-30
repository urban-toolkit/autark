/**
 * @module triangulator-windows
 * Procedural building roof and facade window generation.
 *
 * This module reduces building footprints to convex hulls, resolves effective
 * building heights from common GeoJSON/OSM metadata, and derives a procedural
 * facade layout from hull edges and requested floor counts. It then emits roof
 * fan geometry and indexed window quads that can be consumed by downstream
 * mesh pipelines.
 */

import { Feature, FeatureCollection, GeoJsonProperties, Geometry, Point } from 'geojson';

import { LayerComponent, LayerGeometry } from './types-mesh';
import { computePointConvexHull, computeRingArea, normalizeRing } from './utils-geometry';

/** Target spacing, in local planar units, between generated facade windows. */
const BUILDING_WINDOW_TARGET_SPACING = 6;
/** Fraction of each facade cell width and height occupied by the window quad. */
const BUILDING_WINDOW_CELL_FILL = 1;
/** Fallback building height used when no height metadata can be resolved. */
const DEFAULT_BUILDING_HEIGHT = 20;
/** Fallback floor-to-floor height used when deriving height from level counts. */
const DEFAULT_FLOOR_HEIGHT = 3.4;

/**
 * Metadata for one generated facade window.
 *
 * Each entry is derived from a convex hull edge and floor index, and mirrors a
 * GeoJSON point feature in the returned layout collection.
 */
export interface BuildingWindowLayoutEntry {
    /** Stable identifier for the generated window instance. */
    windowId: string;
    /** Index of the source feature that produced this window. */
    sourceFeatureIndex: number;
    /** Index of the hull edge on which the window is placed. */
    edgeIndex: number;
    /** Zero-based floor index of the window. */
    floorIndex: number;
    /** Zero-based window index within its edge and floor. */
    windowIndex: number;
    /** World-space window center `[x, y, z]`. */
    center: [number, number, number];
    /** Outward-facing facade normal `[x, y, z]`. */
    normal: [number, number, number];
    /** Window width in local planar units. */
    width: number;
    /** Window height in local vertical units. */
    height: number;
    /** Resolved building height used when generating the window. */
    buildingHeight: number;
}

/**
 * Window-layout result for a building collection.
 */
export interface BuildingWindowLayoutResult {
    /** GeoJSON point features representing generated window centers. */
    collection: FeatureCollection<Point>;
    /** Detailed metadata for each generated window instance. */
    windows: BuildingWindowLayoutEntry[];
}

/**
 * Triangulates simplified building roofs and procedural facade windows.
 *
 * The class extracts supported building footprints, reduces them to convex
 * hulls, resolves a usable building height, and derives a facade layout by
 * sampling hull edges across the requested floor count. Roof geometry is
 * emitted as a triangulated fan at the resolved height, while window geometry
 * is emitted as indexed quads centered on the generated layout entries.
 *
 * @example
 * const [geometry, components] = TriangulatorBuildingWithWindows.buildMesh(
 *   buildings,
 *   origin,
 *   floors,
 * );
 */
export class TriangulatorBuildingWithWindows {
    /**
     * Builds renderable roof and window geometry for a building collection.
     *
     * @param geojson - Source building features.
     * @param origin - World-space origin used to convert generated geometry into
     * local coordinates.
     * @param floors - Requested number of procedural floors for window layout.
     * @returns A tuple of geometry chunks and per-feature component metadata.
     * @throws Never throws. Features without a usable hull are skipped.
     * @example
     * const [meshes, comps] = TriangulatorBuildingWithWindows.buildMesh(buildings, origin, 5);
     */
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
                    [window.center[0] - tangent[0] * halfWidth - origin[0], window.center[1] - tangent[1] * halfWidth - origin[1], window.center[2] - halfHeight],
                    [window.center[0] + tangent[0] * halfWidth - origin[0], window.center[1] + tangent[1] * halfWidth - origin[1], window.center[2] - halfHeight],
                    [window.center[0] + tangent[0] * halfWidth - origin[0], window.center[1] + tangent[1] * halfWidth - origin[1], window.center[2] + halfHeight],
                    [window.center[0] - tangent[0] * halfWidth - origin[0], window.center[1] - tangent[1] * halfWidth - origin[1], window.center[2] + halfHeight],
                ],
                featureIndex: window.sourceFeatureIndex,
                featureId: window.windowId,
            });
        }

        return [geometry, components];
    }

    /**
     * Generates a procedural facade-window layout for a building collection.
     *
     * @param source - Source building features.
     * @param floors - Requested number of procedural floors (clamped to ≥1).
     * @returns Generated window metadata as GeoJSON points and detailed layout entries.
     * @throws Never throws. Features without usable hulls are silently skipped.
     * @example
     * const { collection, windows } = TriangulatorBuildingWithWindows.buildWindowLayout(buildings, 5);
     */
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

    /**
     * Resolves an effective building height from feature and part metadata.
     *
     * @param feature - Building feature whose height metadata should be parsed.
     * @returns Resolved building height in world units (falls back to `DEFAULT_BUILDING_HEIGHT`).
     * @throws Never throws.
     * @example
     * const h = TriangulatorBuildingWithWindows.resolveHeight(feature);
     * // h → 50 (from height tag) or 20 (default)
     */
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

    /**
     * Computes a convex hull for the visible building footprint of a feature.
     *
     * Supported polygonal footprint rings are normalized before all points are
     * collected and reduced to a single hull. The hull is used as the shared
     * boundary for roof triangulation and facade-window placement.
     *
     * @param feature - Building feature whose footprint should be reduced to a
     * convex hull.
     * @returns Hull vertices in world coordinates, or `null` when the feature
     * does not contain enough usable footprint points.
     */
    private static computeConvexHull(feature: Feature<Geometry | null, GeoJsonProperties>): number[][] | null {
        const footprintPoints = this.collectBuildingFootprintPoints(feature);
        if (footprintPoints.length < 3) {
            return null;
        }

        const hull = computePointConvexHull(footprintPoints);
        return hull.length >= 3 ? hull : null;
    }

    /**
     * Adds a triangulated roof fan for one convex hull.
     *
     * The hull vertices are converted into local coordinates with a constant Z
     * elevation, then emitted as a triangle fan so the roof cap can be rendered
     * as indexed mesh geometry.
     *
     * @param params - Roof geometry construction parameters.
     * @param params.geometry - Output geometry array to append to.
     * @param params.components - Output component array to append to.
     * @param params.hull - Convex hull vertices in world coordinates.
     * @param params.roofZ - Roof elevation to assign to every hull vertex.
     * @param params.origin - World-space origin used for local conversion.
     * @param params.featureIndex - Source feature index associated with the roof.
     * @returns Nothing. Geometry and component arrays are mutated in place.
     */
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
            position.set([x - params.origin[0], y - params.origin[1], params.roofZ], index * 3);
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

    /**
     * Adds a single quad geometry chunk representing one procedural window.
     *
     * The quad is emitted from four local-space corners using two triangles and
     * inherits the source feature index plus the generated window identifier.
     *
     * @param params - Window quad construction parameters.
     * @param params.geometry - Output geometry array to append to.
     * @param params.components - Output component array to append to.
     * @param params.corners - Quad corner positions in local coordinates.
     * @param params.featureIndex - Source feature index associated with the quad.
     * @param params.featureId - Optional stable identifier for the generated quad.
     * @returns Nothing. Geometry and component arrays are mutated in place.
     */
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

    /**
     * Collects all normalized footprint points from a building feature.
     *
     * Only exterior rings from supported polygonal geometries are traversed.
     * Each ring is normalized before its points are accumulated for convex-hull
     * generation.
     *
     * @param feature - Building feature whose footprint points should be
     * extracted.
     * @returns Normalized footprint points gathered from supported polygonal
     * geometries.
     */
    private static collectBuildingFootprintPoints(feature: Feature<Geometry | null, GeoJsonProperties>): number[][] {
        const geometry = feature.geometry;
        if (!geometry) {
            return [];
        }

        const points: number[][] = [];
        this.visitFootprintRings(geometry, (ring) => {
            if (!ring || ring.length < 3) return;
            const normalized = normalizeRing(ring);
            if (normalized.length < 3) return;
            for (const point of normalized) {
                points.push(point);
            }
        });
        return points;
    }

    /**
     * Visits the exterior footprint ring of each supported building geometry.
     *
     * Polygon, MultiPolygon, and nested GeometryCollection footprints are
     * traversed recursively. Unsupported geometry types are ignored.
     *
     * @param geometry - Geometry to traverse for footprint rings.
     * @param visit - Callback invoked with each discovered exterior ring.
     * @returns Nothing. The provided callback is used for side effects.
     */
    private static visitFootprintRings(geometry: Geometry, visit: (ring: number[][] | undefined) => void): void {
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
                if (child) this.visitFootprintRings(child, visit);
            }
        }
    }

}
