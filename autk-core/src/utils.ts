import { FeatureCollection } from 'geojson';
import { LayerGeometry } from './types-mesh';

/**
 * Resolves a dot-path from an unknown object.
 */
export function valueAtPath(item: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
    }, item);
}

/**
 * Returns true when the value can be treated as a finite numeric scalar.
 */
export function isNumericLike(value: unknown): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed !== '' && Number.isFinite(Number(trimmed));
    }
    return false;
}

/**
 * Computes the central origin of a GeoJSON FeatureCollection.
 */
export function computeOrigin(geojson: FeatureCollection): [number, number] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    const expand = (coord: number[]) => {
        if (coord[0] < minX) minX = coord[0];
        if (coord[0] > maxX) maxX = coord[0];
        if (coord[1] < minY) minY = coord[1];
        if (coord[1] > maxY) maxY = coord[1];
    };

    for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        expandGeometry(geom, expand);
    }

    if (!Number.isFinite(minX)) return [0, 0];
    return [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
}

function expandGeometry(geom: any, expand: (c: number[]) => void): void {
    if (geom.type === 'Point') {
        expand(geom.coordinates);
    } else if (geom.type === 'LineString') {
        for (const c of geom.coordinates) expand(c);
    } else if (geom.type === 'MultiLineString') {
        for (const line of geom.coordinates) for (const c of line) expand(c);
    } else if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const c of ring) expand(c);
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates)
            for (const ring of poly) for (const c of ring) expand(c);
    } else if (geom.type === 'GeometryCollection') {
        for (const sub of geom.geometries) expandGeometry(sub, expand);
    }
}

/**
 * Flattens an array of LayerGeometry pieces into continuous typed arrays
 * suitable for direct WebGPU rendering.
 * 
 * Automatically pads 2D position arrays (like from TriangulatorPolygons) to 3D.
 */
export function flattenMesh(geometries: LayerGeometry[]): { positions: Float32Array; indices: Uint32Array } {
    let totalVerts = 0;
    let totalIndices = 0;
    for (const g of geometries) {
        const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
        const vertsInPiece = is2D ? g.position.length / 2 : g.position.length / 3;
        totalVerts += vertsInPiece * 3;
        totalIndices += (g.indices?.length ?? 0);
    }

    const positions = new Float32Array(totalVerts);
    const indices = new Uint32Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    let vertexCount = 0;

    for (const g of geometries) {
        const is2D = g.position.length % 2 === 0 && g.position.length % 3 !== 0;
        
        if (is2D) {
            // Manual padding for 2D positions
            for (let i = 0, j = 0; i < g.position.length; i += 2, j += 3) {
                positions[vOffset + j] = g.position[i];
                positions[vOffset + j + 1] = g.position[i + 1];
                positions[vOffset + j + 2] = 0; // Pad Z
            }
        } else {
            // Fast binary copy for 3D positions
            positions.set(g.position, vOffset);
        }

        if (g.indices) {
            for (let i = 0; i < g.indices.length; i++) {
                indices[iOffset + i] = g.indices[i] + vertexCount;
            }
            iOffset += g.indices.length;
        }

        const vertsAdded = (is2D ? g.position.length / 2 : g.position.length / 3);
        vOffset += vertsAdded * 3;
        vertexCount += vertsAdded;
    }

    return { positions, indices };
}
