import { LayerGeometry } from './types-mesh';

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
            for (let i = 0, j = 0; i < g.position.length; i += 2, j += 3) {
                positions[vOffset + j] = g.position[i];
                positions[vOffset + j + 1] = g.position[i + 1];
                positions[vOffset + j + 2] = 0;
            }
        } else {
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
