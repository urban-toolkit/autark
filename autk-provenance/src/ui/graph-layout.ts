import type { AutarkProvenanceState, ProvenanceNode } from '../types';

export type LayoutNode = {
  node: ProvenanceNode<AutarkProvenanceState>;
  x: number;
  y: number;
  depth: number;
  row: number;
};

export type LayoutEdge = {
  from: string;
  to: string;
};

export type GraphLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export function buildGraphLayout(
  nodesMap: Map<string, ProvenanceNode<AutarkProvenanceState>>,
  rootId: string
): GraphLayout {
  const depth = new Map<string, number>();
  const row = new Map<string, number>();
  const visited = new Set<string>();
  const edges: LayoutEdge[] = [];

  function assignDepth(nodeId: string, d: number): void {
    if (visited.has(nodeId)) {
      const prev = depth.get(nodeId);
      if (prev === undefined || d < prev) depth.set(nodeId, d);
      return;
    }
    visited.add(nodeId);
    depth.set(nodeId, d);
    const node = nodesMap.get(nodeId);
    if (!node) return;
    for (const childId of node.childrenIds) {
      if (!nodesMap.has(childId)) continue;
      edges.push({ from: nodeId, to: childId });
      assignDepth(childId, d + 1);
    }
  }

  assignDepth(rootId, 0);

  let nextLeafRow = 0;
  function assignRow(nodeId: string): number {
    if (row.has(nodeId)) return row.get(nodeId) ?? 0;
    const node = nodesMap.get(nodeId);
    if (!node) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
      return row.get(nodeId) ?? 0;
    }

    const validChildren = node.childrenIds.filter((id) => nodesMap.has(id));
    if (validChildren.length === 0) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
      return row.get(nodeId) ?? 0;
    }

    const childRows = validChildren.map(assignRow);
    const avg = childRows.reduce((acc, n) => acc + n, 0) / childRows.length;
    row.set(nodeId, avg);
    return avg;
  }

  assignRow(rootId);

  for (const nodeId of nodesMap.keys()) {
    if (!depth.has(nodeId)) depth.set(nodeId, 0);
    if (!row.has(nodeId)) {
      row.set(nodeId, nextLeafRow);
      nextLeafRow += 1;
    }
  }

  const xGap = 160;
  const yGap = 64;
  const marginX = 28;
  const marginY = 24;

  const layoutNodes: LayoutNode[] = [];
  let maxDepth = 0;
  let maxRow = 0;

  for (const [id, node] of nodesMap.entries()) {
    const d = depth.get(id) ?? 0;
    const r = row.get(id) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    maxRow = Math.max(maxRow, r);
    layoutNodes.push({
      node,
      depth: d,
      row: r,
      x: marginX + d * xGap,
      y: marginY + r * yGap,
    });
  }

  layoutNodes.sort((a, b) => (a.depth === b.depth ? a.row - b.row : a.depth - b.depth));

  const width = marginX * 2 + maxDepth * xGap + 280;
  const height = marginY * 2 + Math.max(1, maxRow) * yGap + 44;

  return { nodes: layoutNodes, edges, width, height };
}
