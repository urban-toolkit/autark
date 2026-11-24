/**
 * Tree of `hierarchy` rows, shared by the treemap and sunburst plots.
 */

import * as d3 from 'd3';

import type { HierarchyNodeRow } from '../transforms';

/** Node of the tree: a hierarchy row, or the unnamed root above the top level. */
export type TreeDatum = {
    /** Hierarchy row of the node, or `null` for the root. */
    row: HierarchyNodeRow | null;
    /** Child nodes. */
    children: TreeDatum[];
};

/**
 * Builds a d3 hierarchy from the rows of the `hierarchy` preset.
 *
 * Leaf sizes are their reduced values, so every node is as large as the sum
 * of its leaves, which equals its own value for additive reducers. Children
 * are ordered by size, largest first.
 *
 * @param rows Nodes of every level, as produced by the preset.
 * @returns Root of the hierarchy, above the top level.
 */
export function treeOf(rows: HierarchyNodeRow[]): d3.HierarchyNode<TreeDatum> {
    const nodes = new Map<string, TreeDatum>(rows.map(row => [row.key, { row, children: [] }]));
    const root: TreeDatum = { row: null, children: [] };
    for (const row of rows) {
        const parent = row.parent ? nodes.get(row.parent) : root;
        parent?.children.push(nodes.get(row.key)!);
    }
    return d3.hierarchy(root, d => d.children.length > 0 ? d.children : undefined)
        .sum(d => d.children.length === 0 && d.row ? Math.max(0, d.row.value) : 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
