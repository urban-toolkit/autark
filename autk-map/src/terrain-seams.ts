/**
 * @module terrain-seams
 * Stitching between terrain patches of different quadtree depth.
 *
 * Every patch is a 32-cell grid, so a patch beside a larger (coarser) one has
 * edge vertices with no partner on the neighbour's edge, and the two surfaces
 * can open a crack. Each patch records, per edge, how many levels coarser its
 * neighbour is. The vertex shader then moves the patch's edge vertices onto the
 * neighbour's coarser spacing, interpolating the height between the two
 * vertices it snaps to, so both edges are the same polyline.
 */

/** The part of a terrain block the seam search reads and writes. */
export interface SeamBlock {
    /** Local-space minimum X. */
    x: number;
    /** Local-space minimum Y. */
    y: number;
    /** Edge length. */
    size: number;
    /** Levels the neighbour across the minimum-X edge is coarser, or 0. */
    seamXMin: number;
    /** Levels the neighbour across the maximum-X edge is coarser, or 0. */
    seamXMax: number;
    /** Levels the neighbour across the minimum-Y edge is coarser, or 0. */
    seamYMin: number;
    /** Levels the neighbour across the maximum-Y edge is coarser, or 0. */
    seamYMax: number;
}

/**
 * Sets each block's seam values from its neighbours.
 *
 * Blocks are the leaves of a quadtree, so every size is a root size halved some
 * number of times and every block is aligned to its own size. A neighbour that is
 * the same size, finer, culled or outside the terrain gives 0. A larger one gives
 * the base-2 logarithm of the size ratio, so a neighbour two levels up gives 2.
 *
 * @param blocks - Leaf blocks. Their seam fields are overwritten.
 * @returns Nothing.
 * @throws Never throws.
 * @example
 * assignSeams(blocks);
 */
export function assignSeams(blocks: SeamBlock[]): void {
    const sizes = [...new Set(blocks.map((b) => b.size))].sort((a, b) => b - a);
    const leaves = new Map<string, SeamBlock>();
    for (const block of blocks) leaves.set(leafKey(block.size, block.x, block.y), block);

    const coarserBy = (block: SeamBlock, px: number, py: number): number => {
        for (const size of sizes) {
            if (size <= block.size) break;
            const neighbour = leaves.get(leafKey(size, Math.floor(px / size) * size, Math.floor(py / size) * size));
            if (neighbour) return Math.round(Math.log2(neighbour.size / block.size));
        }
        return 0;
    };

    for (const block of blocks) {
        const half = block.size / 2;
        // Sample just outside the middle of each edge; the middle is inside any larger neighbour.
        const nudge = block.size * 1e-6;
        block.seamXMin = coarserBy(block, block.x - nudge, block.y + half);
        block.seamXMax = coarserBy(block, block.x + block.size + nudge, block.y + half);
        block.seamYMin = coarserBy(block, block.x + half, block.y - nudge);
        block.seamYMax = coarserBy(block, block.x + half, block.y + block.size + nudge);
    }
}

function leafKey(size: number, x: number, y: number): string {
    return `${size}/${x}/${y}`;
}

/**
 * Where an edge vertex goes when its neighbour is coarser: the two points on the
 * edge, in world coordinates along it, that the vertex interpolates between, and
 * the weight of the upper one. CPU twin of `seamHeight` in
 * `shaders/terrain.vert.wgsl`; keep the two in step.
 *
 * The neighbour's vertices sit at whole multiples of its spacing, `cell * 2^levels`,
 * because every block is aligned to its own size, so they are found from the
 * vertex's world position alone. That holds for any gap: when the neighbour's
 * spacing is wider than the whole patch, the two points lie outside it.
 *
 * @param start - World coordinate of the patch's first vertex along the edge.
 * @param cell - Spacing between the patch's own vertices.
 * @param index - Vertex index along the edge, `0` to the cell count.
 * @param levels - Levels the neighbour is coarser; `0` leaves the vertex alone.
 * @returns The lower and upper world coordinate and the weight of the upper one.
 * @throws Never throws.
 * @example
 * morphEdge(1024, 8, 5, 1); // { lower: 1056, upper: 1072, weight: 0.5 }: the neighbour's vertices are 16 apart
 */
export function morphEdge(start: number, cell: number, index: number, levels: number): { lower: number; upper: number; weight: number } {
    const position = start + index * cell;
    if (levels <= 0) return { lower: position, upper: position, weight: 0 };
    const spacing = cell * 2 ** levels;
    const lower = Math.floor(position / spacing) * spacing;
    return { lower, upper: lower + spacing, weight: (position - lower) / spacing };
}
