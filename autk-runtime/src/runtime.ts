/**
 * AutarkRuntime - Main runtime class for executing AutarkSpec specifications
 */

import type { AutkDb } from '@urban-toolkit/autk-db';
import type { AutkMap } from '@urban-toolkit/autk-map';
import type { AutkPlot } from '@urban-toolkit/autk-plot';

import type {
  AutarkSpec,
  RuntimeOptions,
  DataSource,
  Transform,
  View,
  Link,
} from './types.js';
import { SpecValidator } from './validator.js';
import { DataLoader } from './data-loader.js';
import { TransformExecutor } from './transform-executor.js';
import { ViewRenderer } from './view-renderer.js';
import { LinkManager } from './link-manager.js';
import { LayoutManager } from './layout-manager.js';

export interface RuntimeMapView {
  name: string;
  map: AutkMap;
}

export interface RuntimePlotView {
  name: string;
  plot: AutkPlot;
}

/**
 * Main runtime class for executing Autark specifications.
 *
 * Usage:
 * ```ts
 * const runtime = await AutarkRuntime.fromSpec(spec, {
 *   container: document.getElementById('app')
 * });
 * ```
 */
export class AutarkRuntime {
  private db?: AutkDb;
  private maps = new Map<string, AutkMap>();
  private plots = new Map<string, AutkPlot>();
  private validator?: SpecValidator;
  private dataLoader: DataLoader;
  private transformExecutor: TransformExecutor;
  private viewRenderer: ViewRenderer;
  private linkManager: LinkManager;
  private layoutManager: LayoutManager;
  private viewContainers = new Map<number, HTMLElement>();

  private constructor(
    private spec: AutarkSpec,
    private options: RuntimeOptions
  ) {
    this.dataLoader = new DataLoader();
    this.transformExecutor = new TransformExecutor();
    this.viewRenderer = new ViewRenderer();
    this.linkManager = new LinkManager();
    this.layoutManager = new LayoutManager();
  }

  /**
   * Create and execute a runtime from a specification.
   *
   * @param spec - AutarkSpec to execute
   * @param options - Runtime configuration options
   * @returns Initialized runtime instance
   */
  static async fromSpec(
    spec: AutarkSpec,
    options: RuntimeOptions = {}
  ): Promise<AutarkRuntime> {
    const runtime = new AutarkRuntime(spec, {
      validate: true,
      onError: 'throw',
      ...options,
    });

    await runtime.execute();
    return runtime;
  }

  /**
   * Main execution pipeline.
   */
  private async execute(): Promise<void> {
    // Phase 1: Validate specification
    if (this.options.validate !== false) {
      this.validator = new SpecValidator();
      await this.validator.validate(this.spec);
    }

    // Phase 2: Validate reference integrity
    this.validateReferences();

    // Phase 3: Initialize database if needed
    if (this.spec.data || this.spec.transforms) {
      this.db = await this.dataLoader.initializeDatabase(this.spec.workspace);
    }

    // Phase 4: Load data sources
    if (this.spec.data && this.db) {
      await this.loadDataSources(this.spec.data);
    }

    // Phase 5: Execute transforms
    if (this.spec.transforms && this.db) {
      await this.executeTransforms(this.spec.transforms);
    }

    // Phase 6: Create DOM layout
    this.createLayout();

    // Phase 7: Render views
    await this.renderViews(this.spec.views);

    // Phase 8: Connect selections and links
    if (this.spec.links) {
      this.connectLinks(this.spec.links);
    }
  }

  /**
   * Validate that all references (data sources, selections, targets) exist.
   */
  private validateReferences(): void {
    const dataSources = new Set(this.spec.data?.map((d) => d.name) || []);

    // Add OSM sub-layer table names
    this.spec.data?.forEach((source) => {
      if (source.type === 'osm') {
        source.layers.forEach((layer) => {
          dataSources.add(`${source.name}_${layer}`);
        });
      }
    });

    // Validate transform references
    this.spec.transforms?.forEach((transform) => {
      if (transform.type === 'spatialJoin') {
        if (!dataSources.has(transform.root)) {
          throw new Error(`Transform references unknown root data source: ${transform.root}`);
        }
        if (!dataSources.has(transform.join)) {
          throw new Error(`Transform references unknown join data source: ${transform.join}`);
        }
      } else if (transform.type === 'heatmap') {
        if (!dataSources.has(transform.source)) {
          throw new Error(`Heatmap transform references unknown source data source: ${transform.source}`);
        }
        dataSources.add(transform.output);
      } else if (transform.type === 'gpgpuCompute') {
        if (!dataSources.has(transform.source)) {
          throw new Error(`GPGPU compute transform references unknown source data source: ${transform.source}`);
        }
        dataSources.add(transform.output);
      } else if (transform.type === 'renderCompute') {
        for (const layer of transform.layers) {
          if (!dataSources.has(layer.source)) {
            throw new Error(`Render compute transform references unknown layer source: ${layer.source}`);
          }
        }
        if (!dataSources.has(transform.viewpoints.source)) {
          throw new Error(`Render compute transform references unknown viewpoints source: ${transform.viewpoints.source}`);
        }
        dataSources.add(transform.output);
      }
    });

    // Validate view source references
    const layerIds = new Set<string>();
    this.spec.views.forEach((view) => {
      if (view.type === 'map') {
        view.layers.forEach((layer) => {
          if (!dataSources.has(layer.source)) {
            throw new Error(`Map layer references unknown data source: ${layer.source}`);
          }
          if (layer.id) {
            layerIds.add(layer.id);
          }
        });
      } else if (view.type === 'histogram') {
        if (!dataSources.has(view.source)) {
          throw new Error(`Histogram references unknown data source: ${view.source}`);
        }
      } else if (view.type === 'scatterplot') {
        if (!dataSources.has(view.source)) {
          throw new Error(`Scatterplot references unknown data source: ${view.source}`);
        }
      } else if (view.type === 'table') {
        if (!dataSources.has(view.source)) {
          throw new Error(`Table references unknown data source: ${view.source}`);
        }
      }
    });

    // Collect selection names
    const selectionNames = new Set<string>();
    this.spec.views.forEach((view) => {
      if (
        (view.type === 'histogram' || view.type === 'scatterplot' || view.type === 'table') &&
        view.selection
      ) {
        selectionNames.add(view.selection.name);
      }
    });

    // Validate link references
    this.spec.links?.forEach((link) => {
      if (!selectionNames.has(link.selection)) {
        throw new Error(`Link references unknown selection: ${link.selection}`);
      }
      if (!layerIds.has(link.target)) {
        throw new Error(`Link references unknown layer ID: ${link.target}`);
      }
    });
  }

  /**
   * Load all data sources into the database.
   */
  private async loadDataSources(sources: DataSource[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    for (const source of sources) {
      this.reportProgress(`Loading ${source.name}...`);
      await this.dataLoader.loadDataSource(this.db, source);
    }
  }

  /**
   * Execute all transforms in order.
   */
  private async executeTransforms(transforms: Transform[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    for (const transform of transforms) {
      this.reportProgress(`Executing transform...`);
      await this.transformExecutor.executeTransform(this.db, transform);
    }
  }

  /**
   * Create DOM layout structure.
   */
  private createLayout(): void {
    if (!this.options.container) {
      throw new Error('Container option required for rendering views');
    }

    this.viewContainers = this.layoutManager.createLayout(
      this.options.container,
      this.spec.views,
      this.spec.layout
    );
  }

  /**
   * Render all views.
   */
  private async renderViews(views: View[]): Promise<void> {
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const container = this.viewContainers.get(i);

      if (!container) {
        throw new Error(`No container found for view ${i}`);
      }

      this.reportProgress(`Rendering ${view.type} view...`);

      if (view.type === 'map') {
        const map = await this.viewRenderer.renderMap(this.db!, view, container);
        if (view.name) {
          this.maps.set(view.name, map);
        }
        // Store by index as well for link management
        this.maps.set(`_view_${i}`, map);
      } else if (view.type === 'histogram') {
        const plot = await this.viewRenderer.renderHistogram(this.db!, view, container);
        if (view.name) {
          this.plots.set(view.name, plot);
        }
        // Store by index as well for link management
        this.plots.set(`_view_${i}`, plot);
      } else if (view.type === 'scatterplot') {
        const plot = await this.viewRenderer.renderScatterplot(this.db!, view, container);
        if (view.name) {
          this.plots.set(view.name, plot);
        }
        this.plots.set(`_view_${i}`, plot);
      } else if (view.type === 'table') {
        const plot = await this.viewRenderer.renderTable(this.db!, view, container);
        if (view.name) {
          this.plots.set(view.name, plot);
        }
        this.plots.set(`_view_${i}`, plot);
      }
    }
  }

  /**
   * Connect selections and links between views.
   */
  private connectLinks(links: Link[]): void {
    this.linkManager.connectLinks(links, this.spec, this.maps, this.plots);
  }

  /**
   * Report progress if callback is configured.
   */
  private reportProgress(message: string, percent?: number): void {
    if (this.options.onProgress) {
      this.options.onProgress(message, percent);
    }
  }

  /**
   * Update the specification and re-render.
   */
  async updateSpec(spec: AutarkSpec): Promise<void> {
    // Destroy current instance
    await this.destroy();

    // Update spec and re-execute
    this.spec = spec;
    await this.execute();
  }

  /**
   * Clean up all resources.
   */
  async destroy(): Promise<void> {
    // Destroy maps
    for (const map of this.maps.values()) {
      map.destroy();
    }
    this.maps.clear();

    // Destroy plots (if they have cleanup methods)
    this.plots.clear();

    // Clean up links
    this.linkManager.destroy();

    // Clean up layout
    this.layoutManager.destroy();
    this.viewContainers.clear();

    // Close database
    if (this.db) {
      // AutkDb doesn't currently expose a close() method
      // TODO: Add db.close() once implemented
      this.db = undefined;
    }
  }

  /**
   * Get the database instance.
   */
  getDb(): AutkDb | undefined {
    return this.db;
  }

  /**
   * Get a map view by name.
   */
  getMap(name?: string): AutkMap | undefined {
    if (!name) {
      // Return first map if no name specified
      return this.maps.values().next().value;
    }
    return this.maps.get(name);
  }

  /**
   * Get all named map views.
   */
  getMaps(): RuntimeMapView[] {
    return [...this.maps.entries()]
      .filter(([name]) => !name.startsWith('_view_'))
      .map(([name, map]) => ({ name, map }));
  }

  /**
   * Get a plot view by name.
   */
  getPlot(name?: string): AutkPlot | undefined {
    if (!name) {
      // Return first plot if no name specified
      return this.plots.values().next().value;
    }
    return this.plots.get(name);
  }

  /**
   * Get all named plot views.
   */
  getPlots(): RuntimePlotView[] {
    return [...this.plots.entries()]
      .filter(([name]) => !name.startsWith('_view_'))
      .map(([name, plot]) => ({ name, plot }));
  }
}
