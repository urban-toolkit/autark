/**
 * TransformExecutor - Executes data transformations
 */

import type { AutkDb } from '@urban-toolkit/autk-db';
import type { Transform } from './types.js';

export class TransformExecutor {
  /**
   * Execute a single transform.
   */
  async executeTransform(db: AutkDb, transform: Transform): Promise<void> {
    switch (transform.type) {
      case 'spatialJoin':
        await this.executeSpatialJoin(db, transform);
        break;
      default:
        throw new Error(`Unknown transform type: ${(transform as Transform).type}`);
    }
  }

  /**
   * Execute spatial join transform.
   *
   * IMPORTANT: This mutates the root table in place (MVP semantics).
   */
  private async executeSpatialJoin(
    db: AutkDb,
    transform: Extract<Transform, { type: 'spatialJoin' }>
  ): Promise<void> {
    // Build aggregation config
    // Map 'op' field to 'aggregateFn' as expected by SpatialQueryParams
    const groupBy = transform.groupBy?.map((agg) => ({
      column: agg.column,
      aggregateFn: agg.op,
      normalize: agg.normalize,
    }));

    // Build near config if present
    const nearConfig = transform.near ? {
      distance: transform.near.distance,
      useCentroid: transform.near.useCentroid ?? true,
    } : undefined;

    // Execute spatial join
    // Note: This mutates the root table in place
    await db.spatialQuery({
      tableRootName: transform.root,
      tableJoinName: transform.join,
      near: nearConfig,
      groupBy,
    });

    // After this, the root table (e.g., "neighborhoods") has new properties:
    // properties.sjoin.count.tree_count, etc.
  }
}
