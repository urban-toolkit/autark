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
  let nextLeafRow = 0;

  const assignDepth = (nodeId: string, level: number): void => {
    if (visited.has(nodeId)) return void depth.set(nodeId, Math.min(depth.get(nodeId) ?? level, level));
    visited.add(nodeId);
    depth.set(nodeId, level);
    nodesMap.get(nodeId)?.childrenIds.forEach((childId) => {
      if (!nodesMap.has(childId)) return;
      edges.push({ from: nodeId, to: childId });
      assignDepth(childId, level + 1);
    });
  };
  const assignRow = (nodeId: string): number => {
    if (row.has(nodeId)) return row.get(nodeId) ?? 0;
    const validChildren = nodesMap.get(nodeId)?.childrenIds.filter((id) => nodesMap.has(id)) ?? [];
    if (validChildren.length === 0) return row.set(nodeId, nextLeafRow++).get(nodeId) ?? 0;
    const avg = validChildren.map(assignRow).reduce((sum, value) => sum + value, 0) / validChildren.length;
    row.set(nodeId, avg);
    return avg;
  };

  assignDepth(rootId, 0);
  assignRow(rootId);
  nodesMap.forEach((_, nodeId) => {
    if (!depth.has(nodeId)) depth.set(nodeId, 0);
    if (!row.has(nodeId)) row.set(nodeId, nextLeafRow++);
  });

  const layoutNodes = Array.from(nodesMap.entries()).map(([id, node]) => ({
    node,
    depth: depth.get(id) ?? 0,
    row: row.get(id) ?? 0,
    x: 28 + (depth.get(id) ?? 0) * 160,
    y: 24 + (row.get(id) ?? 0) * 64,
  }));
  layoutNodes.sort((a, b) => (a.depth === b.depth ? a.row - b.row : a.depth - b.depth));

  return {
    nodes: layoutNodes,
    edges,
    width: 56 + Math.max(...layoutNodes.map((node) => node.depth), 0) * 160 + 280,
    height: 48 + Math.max(1, ...layoutNodes.map((node) => node.row)) * 64 + 44,
  };
}
