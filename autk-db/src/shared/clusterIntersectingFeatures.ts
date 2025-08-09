import { booleanIntersects, bbox as turfBbox } from '@turf/turf';
import RBush from 'rbush';
import { Geometry } from 'geojson';

/**
 * Computes connected components (clusters) of intersecting geometries and returns
 * a mapping from feature id to cluster id. The input array must contain an
 * application-level identifier for each geometry. Cluster ids are stable only
 * within a single invocation and start at 0.
 */
export function computeIntersectingClusterIds(
  items: Array<{ id: number | string; geometry: Geometry | null | undefined }>,
): Map<string, number> {
  const validItems = items.map((it, idx) => ({ ...it, __idx: idx })).filter((it) => it.geometry != null) as Array<{
    id: number | string;
    geometry: Geometry;
    __idx: number;
  }>;

  const n = validItems.length;
  if (n === 0) return new Map();

  // Union-find structure
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Build R-tree of bboxes
  interface RTreeItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    idx: number; // index within validItems
  }
  const rtree = new RBush<RTreeItem>();
  const itemsForTree: RTreeItem[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const [minX, minY, maxX, maxY] = turfBbox(validItems[i].geometry as any);
    itemsForTree[i] = { minX, minY, maxX, maxY, idx: i };
  }
  rtree.load(itemsForTree);

  // Intersections among nearby candidates
  for (let i = 0; i < n; i++) {
    const aItem = itemsForTree[i];
    const candidates = rtree.search(aItem);
    for (const cand of candidates) {
      const j = cand.idx;
      if (j <= i) continue;
      try {
        if (booleanIntersects(validItems[i].geometry as any, validItems[j].geometry as any)) {
          union(i, j);
        }
      } catch {
        // ignore invalid geometries
      }
    }
  }

  // Assign compact cluster ids
  const rootToClusterId = new Map<number, number>();
  let nextClusterId = 0;
  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!rootToClusterId.has(root)) rootToClusterId.set(root, nextClusterId++);
    const clusterId = rootToClusterId.get(root)!;
    const appId = String(validItems[i].id);
    result.set(appId, clusterId);
  }

  return result;
}
