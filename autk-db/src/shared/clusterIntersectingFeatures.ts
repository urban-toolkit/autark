import { booleanIntersects, bbox as turfBbox } from '@turf/turf';
import RBush from 'rbush';
import { FeatureCollection, GeometryCollection, Geometry } from 'geojson';

/**
 * Groups intersecting features into clusters.
 * For each cluster it returns a wrapper Feature whose geometry is a GeometryCollection
 * of the original geometries and whose properties.parts contains the original feature
 * properties.
 */
export function clusterIntersectingFeatures(collection: FeatureCollection): FeatureCollection {
  const features = collection.features;
  const n = features.length;

  // Union-find structure
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  /* ------------------------------------------------------------------
   * Build an R-tree of all feature bounding boxes for fast candidate lookup
   * ------------------------------------------------------------------ */
  interface RTreeItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    idx: number; // index of the feature in the array
  }

  const rtree = new RBush<RTreeItem>();
  const items: RTreeItem[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const [minX, minY, maxX, maxY] = turfBbox(features[i] as any);
    const item: RTreeItem = { minX, minY, maxX, maxY, idx: i };
    items[i] = item;
  }

  rtree.load(items);

  /* ------------------------------------------------------------------
   * Iterate each feature and only test real intersection against nearby
   * candidates returned by the R-tree, drastically reducing comparisons.
   * ------------------------------------------------------------------ */
  for (let i = 0; i < n; i++) {
    const aItem = items[i];
    // Search R-tree for items whose bbox intersects with aItem
    const candidates = rtree.search(aItem);
    for (const cand of candidates) {
      const j = cand.idx;
      if (j <= i) continue; // avoid duplicate checks & self

      try {
        if (booleanIntersects(features[i] as any, features[j] as any)) {
          union(i, j);
        }
      } catch {
        /* ignore invalid geometries */
      }
    }
  }

  // Collect indices per component
  const clusters: Map<number, number[]> = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  const wrapperFeatures = Array.from(clusters.values()).map((indices) => {
    const geoms: Geometry[] = indices.map((idx) => features[idx].geometry).filter((g): g is Geometry => g != null);

    const geomCollection: GeometryCollection = {
      type: 'GeometryCollection',
      geometries: geoms,
    };

    return {
      type: 'Feature',
      geometry: geomCollection,
      properties: {
        parts: indices.map((idx) => features[idx].properties ?? {}),
        size: indices.length,
      },
    } as const;
  });

  return { type: 'FeatureCollection', features: wrapperFeatures } as FeatureCollection;
}
