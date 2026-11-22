import type { Feature, Geometry, Position } from 'geojson';

/** Pack the feature count, one root index per feature, then preorder nodes (kind, point start, point end, subtree end). */
export function packGeometry(features: readonly Feature<Geometry | null>[]) {
    const roots: number[] = [];
    const nodes: number[] = [];
    const points: number[] = [];

    function append(kind: number, positions: readonly Position[] = [], children?: () => void): void {
        const offset = nodes.length;
        const start = points.length / 4;
        nodes.push(kind, start, 0, 0);
        for (const [x, y, z] of positions) {
            points.push(x, y, z ?? 0, z === undefined ? 2 : 3);
        }
        children?.();
        nodes[offset + 2] = points.length / 4;
        nodes[offset + 3] = nodes.length / 4;
    }

    function visit(geometry: Geometry | null): void {
        if (!geometry) { append(0); return; }
        switch (geometry.type) {
            case 'Point': append(1, geometry.coordinates.length ? [geometry.coordinates] : []); break;
            case 'MultiPoint': append(2, geometry.coordinates); break;
            case 'LineString': append(3, geometry.coordinates); break;
            case 'MultiLineString':
                append(4, [], () => geometry.coordinates.forEach(line => append(3, line)));
                break;
            case 'Polygon':
                append(5, [], () => geometry.coordinates.forEach(ring => append(8, ring)));
                break;
            case 'MultiPolygon':
                append(6, [], () => geometry.coordinates.forEach(coordinates => visit({ type: 'Polygon', coordinates })));
                break;
            case 'GeometryCollection':
                append(7, [], () => geometry.geometries.forEach(visit));
                break;
        }
    }

    for (const feature of features) {
        roots.push(nodes.length / 4);
        visit(feature.geometry);
    }
    const topology = new Uint32Array(1 + roots.length + nodes.length);
    topology[0] = roots.length;
    topology.set(roots, 1);
    topology.set(nodes, 1 + roots.length);
    // WebGPU requires a physical element even if all feature geometries are empty.
    return { topology, points: points.length ? new Float32Array(points) : new Float32Array(4) };
}
