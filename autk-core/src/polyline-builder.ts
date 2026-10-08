import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { LayerComponent, LayerGeometry } from './types-mesh';

/** Width-independent centerline data for shader-expanded polylines. */
export interface PolylineData {
    geometry: LayerGeometry[];
    components: LayerComponent[];
    /** Per centerline node: previous XY and next XY. Each node owns five consecutive topology vertices. */
    attributes: Float32Array;
}

/** Builds centerline topology without buffering polygons or resolving visual widths. */
export class PolylineBuilder {
    /**
     * Builds local XY centerlines for LineString, MultiLineString and nested GeometryCollection.
     * Consecutive duplicate vertices are removed after float32 conversion. Invalid paths and
     * paths with fewer than two distinct points are skipped. Components retain source IDs.
     * Five vertices per node support segment quads and width-independent join triangles.
     */
    static build(geojson: FeatureCollection, origin: number[]): PolylineData {
        const geometry: LayerGeometry[] = [];
        const components: LayerComponent[] = [];
        const attributes: number[] = [];

        for (let featureIndex = 0; featureIndex < geojson.features.length; featureIndex++) {
            const feature = geojson.features[featureIndex];
            const paths: Position[][] = [];
            PolylineBuilder.collectPaths(feature.geometry, paths);
            let nPoints = 0;
            let nTriangles = 0;

            for (const path of paths) {
                const points: number[][] = [];
                let invalid = false;
                for (const coordinate of path) {
                    const x = Math.fround(coordinate[0] - origin[0]);
                    const y = Math.fround(coordinate[1] - origin[1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) {
                        invalid = true;
                        break;
                    }
                    const last = points[points.length - 1];
                    if (!last || last[0] !== x || last[1] !== y) {
                        points.push([x, y]);
                    }
                }
                if (invalid || points.length < 2) { continue; }
                const closed = points.length > 2 && points[0][0] === points[points.length - 1][0]
                    && points[0][1] === points[points.length - 1][1];
                if (closed) { points.pop(); }
                const count = points.length;
                const position: number[] = [];
                const indices: number[] = [];

                for (let i = 0; i < count; i++) {
                    const current = points[i];
                    const previous = points[i === 0 ? (closed ? count - 1 : 0) : i - 1];
                    const next = points[i === count - 1 ? (closed ? 0 : i) : i + 1];
                    attributes.push(previous[0], previous[1], next[0], next[1]);
                    // Incoming left/right, outgoing left/right, then join center.
                    // Side/role are derived from vertex_index in the shader, not stored per vertex.
                    for (let vertex = 0; vertex < 5; vertex++) {
                        position.push(current[0], current[1]);
                    }
                    const base = i * 5;
                    if (closed || (i > 0 && i < count - 1)) {
                        indices.push(base, base + 2, base + 4, base + 1, base + 4, base + 3);
                    }
                    if (closed || i < count - 1) {
                        const end = ((i + 1) % count) * 5;
                        indices.push(base + 2, base + 3, end, base + 3, end + 1, end);
                    }
                }
                geometry.push({ position: new Float32Array(position), indices: new Uint32Array(indices), featureIndex });
                nPoints += position.length / 2;
                nTriangles += indices.length / 3;
            }
            if (nTriangles > 0) {
                components.push({ nPoints, nTriangles, featureIndex, featureId: feature.id });
            }
        }
        return { geometry, components, attributes: new Float32Array(attributes) };
    }

    private static collectPaths(geometry: Geometry | null, paths: Position[][]): void {
        if (!geometry) { return; }
        switch (geometry.type) {
            case 'LineString':
                paths.push(geometry.coordinates);
                break;
            case 'MultiLineString':
                paths.push(...geometry.coordinates);
                break;
            case 'GeometryCollection':
                for (const child of geometry.geometries) {
                    PolylineBuilder.collectPaths(child, paths);
                }
                break;
            default:
                console.warn(`[autk-core] PolylineBuilder skipped ${geometry.type}: expected line geometry.`);
        }
    }
}
