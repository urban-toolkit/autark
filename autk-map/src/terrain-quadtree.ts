/**
 * @module terrain-quadtree
 * Quadtree traversal that picks the terrain patches to draw.
 *
 * Kept free of GPU and camera types so the budget behaviour can be tested alone.
 */

/** A square quadtree block. */
export interface QuadBlock {
    /** Local-space minimum X. */
    x: number;
    /** Local-space minimum Y. */
    y: number;
    /** Edge length. */
    size: number;
    /** Quadtree level; 0 is the finest. */
    level: number;
}

/** What {@link traverseQuadtree} asks about each block. */
export interface QuadtreeRules<T extends QuadBlock> {
    /** Makes a block. */
    create(x: number, y: number, size: number, level: number): T;
    /** `false` drops the block and everything under it (outside the terrain, or out of view). */
    visible(block: T): boolean;
    /** `true` when the block wants finer patches than it has. */
    wantsSplit(block: T): boolean;
    /** Most blocks that may be returned. */
    maxLeaves: number;
}

/**
 * Walks the quadtree from its roots and returns the leaf blocks to draw.
 *
 * A block splits only when it wants to and the split still fits the budget:
 * splitting replaces one block with four, so it needs room for the leaves
 * already chosen, the blocks still waiting, and three more. When the budget is
 * tight the traversal keeps the coarser block, so the visible area stays
 * covered; it never drops blocks that are waiting. The result can exceed
 * `maxLeaves` only when there are more visible roots than that.
 *
 * @param roots - Root blocks, level and size already set.
 * @param rules - Visibility, split decision and budget.
 * @returns The leaves, in no particular order.
 * @throws Never throws.
 * @example
 * const leaves = traverseQuadtree(roots, { create, visible, wantsSplit, maxLeaves: 4096 });
 */
export function traverseQuadtree<T extends QuadBlock>(roots: T[], rules: QuadtreeRules<T>): T[] {
    const stack = [...roots];
    const leaves: T[] = [];
    while (stack.length > 0) {
        const block = stack.pop()!;
        if (!rules.visible(block)) continue;
        if (block.level > 0 && rules.wantsSplit(block) && leaves.length + stack.length + 4 <= rules.maxLeaves) {
            const size = block.size * 0.5;
            const level = block.level - 1;
            stack.push(
                rules.create(block.x, block.y, size, level),
                rules.create(block.x + size, block.y, size, level),
                rules.create(block.x, block.y + size, size, level),
                rules.create(block.x + size, block.y + size, size, level),
            );
        } else {
            leaves.push(block);
        }
    }
    return leaves;
}
