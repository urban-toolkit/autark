/**
 * TransformExecutor - Executes data transformations
 */

import type { AutkDb } from '@urban-toolkit/autk-db';
import { AutkComputeEngine } from '@urban-toolkit/autk-compute';
import type { Transform } from './types.js';

export class TransformExecutor {
  private compute = new AutkComputeEngine();

  /**
   * Execute a single transform.
   */
  async executeTransform(db: AutkDb, transform: Transform): Promise<void> {
    switch (transform.type) {
      case 'spatialJoin':
        await this.executeSpatialJoin(db, transform);
        break;
      case 'heatmap':
        await this.executeHeatmap(db, transform);
        break;
      case 'gpgpuCompute':
        await this.executeGpgpuCompute(db, transform);
        break;
      case 'renderCompute':
        await this.executeRenderCompute(db, transform);
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

  /**
   * Execute heatmap transform.
   *
   * Creates a new heatmap table. Downstream views can reference transform.output.
   */
  private async executeHeatmap(
    db: AutkDb,
    transform: Extract<Transform, { type: 'heatmap' }>
  ): Promise<void> {
    await db.buildHeatmap({
      tableJoinName: transform.source,
      outputTableName: transform.output,
      near: {
        distance: transform.near.distance,
        useCentroid: transform.near.useCentroid ?? true,
      },
      grid: transform.grid,
      groupBy: transform.groupBy?.map((agg) => ({
        column: agg.column,
        aggregateFn: agg.op,
        normalize: agg.normalize,
      })),
    });
  }

  /**
   * Execute GPGPU compute transform.
   *
   * Runs feature-level WGSL compute and materializes the returned collection as
   * a new GeoJSON table.
   */
  private async executeGpgpuCompute(
    db: AutkDb,
    transform: Extract<Transform, { type: 'gpgpuCompute' }>
  ): Promise<void> {
    this.validateWgslBody(transform.wgslBody);

    const collection = await db.getLayer(transform.source);
    if (!collection) {
      throw new Error(`GPGPU compute source not found: ${transform.source}`);
    }

    const result = await this.compute.gpgpuPipeline({
      collection,
      variableMapping: transform.variableMapping,
      attributeArrays: transform.attributeArrays,
      attributeMatrices: transform.attributeMatrices,
      uniforms: transform.uniforms,
      uniformArrays: transform.uniformArrays,
      uniformMatrices: transform.uniformMatrices,
      wgslBody: transform.wgslBody,
      resultField: transform.resultField,
      outputColumns: transform.outputColumns,
    });

    await db.loadGeojson({
      geojsonObject: result,
      outputTableName: transform.output,
      layerType: transform.layerType,
      coordinateFormat: transform.coordinateFormat,
    });
  }

  /**
   * Execute render compute transform.
   *
   * Runs render sampling and materializes the viewpoint result collection as a
   * new GeoJSON table.
   */
  private async executeRenderCompute(
    db: AutkDb,
    transform: Extract<Transform, { type: 'renderCompute' }>
  ): Promise<void> {
    const layers = await Promise.all(transform.layers.map(async (layer) => {
      const collection = await db.getLayer(layer.source);
      if (!collection) {
        throw new Error(`Render compute layer source not found: ${layer.source}`);
      }
      return {
        id: layer.id,
        collection,
        type: layer.type,
        objectIdProperty: layer.objectIdProperty,
      };
    }));

    const viewpointCollection = await db.getLayer(transform.viewpoints.source);
    if (!viewpointCollection) {
      throw new Error(`Render compute viewpoints source not found: ${transform.viewpoints.source}`);
    }

    const result = await this.compute.renderPipeline({
      layers,
      viewpoints: {
        collection: viewpointCollection,
        strategy: transform.viewpoints.strategy,
        sampling: transform.viewpoints.sampling,
      },
      aggregation: transform.aggregation,
      camera: transform.camera,
      tileSize: transform.tileSize,
    });

    await db.loadGeojson({
      geojsonObject: result,
      outputTableName: transform.output,
      layerType: transform.layerType,
      coordinateFormat: transform.coordinateFormat,
    });
  }

  /**
   * Validate the WGSL function body accepted by declarative specs.
   *
   * The compute engine validates generated identifiers and the browser compiler
   * validates WGSL syntax. This guard keeps specs constrained to a function
   * body instead of a full WGSL module.
   */
  private validateWgslBody(wgslBody: string): void {
    const body = wgslBody.trim();
    if (!body) {
      throw new Error('GPGPU compute wgslBody must not be empty');
    }
    if (!/\breturn\b/.test(body)) {
      throw new Error('GPGPU compute wgslBody must return a value');
    }

    const forbiddenPatterns = [
      /@\s*(compute|vertex|fragment|group|binding)\b/,
      /\b(var\s*<\s*(storage|uniform)|fn|enable|requires|override)\b/,
    ];
    if (forbiddenPatterns.some((pattern) => pattern.test(body))) {
      throw new Error('GPGPU compute wgslBody must be a function body, not a full WGSL module');
    }
  }
}
