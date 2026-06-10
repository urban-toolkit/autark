/**
 * ViewRenderer - Renders map and plot views
 */

import type { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';
import { ColorMapDomainStrategy } from '@urban-toolkit/autk-core';
import type { MapView, HistogramView, EncodingChannel } from './types.js';

export class ViewRenderer {
  /**
   * Render a map view.
   */
  async renderMap(db: AutkDb, view: MapView, container: HTMLElement): Promise<AutkMap> {
    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const map = new AutkMap(canvas);
    await map.init();

    // Load and render layers, collecting their data for camera centering
    const collections: any[] = [];
    for (const layerSpec of view.layers) {
      const collection = await this.renderMapLayer(db, map, layerSpec);
      collections.push(collection);
    }

    console.log('About to apply camera settings...');

    // Apply camera settings AFTER loading data so we can auto-center
    try {
      if (view.camera) {
        console.log('Applying camera settings from spec');
        this.applyCameraSettings(map, view.camera, collections);
      } else {
        // No camera specified - auto-center on data
        console.log('Auto-centering camera on data');
        this.autoCenterCamera(map, collections);
      }
      console.log('Camera settings applied successfully');
    } catch (error) {
      console.error('Error applying camera settings:', error);
      throw error;
    }

    console.log('About to call map.draw()...');

    // Trigger rendering!
    console.log('Calling map.draw() to render', collections.length, 'collections');
    console.log('Layer manager has', map.layerManager.layers.length, 'layers');
    map.draw();
    console.log('map.draw() completed');

    return map;
  }

  /**
   * Auto-center camera on loaded data.
   */
  private autoCenterCamera(map: AutkMap, collections: any[]): void {
    const bounds = this.calculateBounds(collections);
    if (!bounds) {
      console.warn('No bounds calculated for auto-centering');
      return;
    }

    console.log('Calculated bounds:', bounds);

    const camera = map.camera;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const origin = map.layerManager.origin;
    const localCenterX = centerX - origin[0];
    const localCenterY = centerY - origin[1];

    console.log(`Setting camera center to [${localCenterX}, ${localCenterY}]`);

    // Position the camera above the data and point it at the same XY center.
    // Moving only the eye leaves the default lookAt at [0, 0, 0], which points
    // the camera away from projected urban datasets.
    // @ts-ignore - reading protected member
    const currentZ = camera.wEye[2];
    camera.resetCamera([0, 1, 0], [localCenterX, localCenterY, 0], [localCenterX, localCenterY, currentZ]);
    camera.update();

    // @ts-ignore - accessing protected member for logging
    const eyeX = camera.wEye[0];
    // @ts-ignore - accessing protected member for logging
    const eyeY = camera.wEye[1];
    // @ts-ignore - accessing protected member for logging
    const eyeZ = camera.wEye[2];
    console.log(`Camera eye after update: [${eyeX}, ${eyeY}, ${eyeZ}]`);
  }

  /**
   * Calculate bounding box of all features in collections.
   */
  private calculateBounds(collections: any[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (!collections || collections.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const collection of collections) {
      if (!collection?.features) continue;

      for (const feature of collection.features) {
        if (!feature?.geometry?.coordinates) continue;

        const coords = feature.geometry.coordinates;
        const geomType = feature.geometry.type;

        // Extract coordinates based on geometry type
        if (geomType === 'Point') {
          const [x, y] = coords;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
          for (const [x, y] of coords) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        } else if (geomType === 'Polygon' || geomType === 'MultiLineString') {
          for (const ring of coords) {
            for (const [x, y] of ring) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        } else if (geomType === 'MultiPolygon') {
          for (const polygon of coords) {
            for (const ring of polygon) {
              for (const [x, y] of ring) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          }
        }
      }
    }

    if (!isFinite(minX)) return null;

    return { minX, maxX, minY, maxY };
  }

  /**
   * Apply camera settings to map.
   *
   * Note: The spec uses absolute pitch/bearing/zoom values, but Camera API
   * uses relative deltas. For MVP, we apply deltas from default state.
   * TODO: Add absolute camera positioning methods to Camera class.
   */
  private applyCameraSettings(
    map: AutkMap,
    cameraSpec: { pitch?: number; bearing?: number; zoom?: number },
    collections: any[]
  ): void {
    const camera = map.camera;

    // Auto-center on data first (sets X and Y)
    this.autoCenterCamera(map, collections);

    // Now apply zoom AFTER auto-centering (set Z coordinate)
    console.log('Applying zoom, spec value:', cameraSpec.zoom);

    if (cameraSpec.zoom !== undefined) {
      const zoomScale = Math.pow(2, cameraSpec.zoom - 10);
      const targetZ = 10000 / zoomScale;

      console.log(`  Zoom scale: ${zoomScale}, target Z: ${targetZ}`);

      // @ts-ignore - accessing protected member
      const currentX = camera.wEye[0];
      // @ts-ignore - accessing protected member
      const currentY = camera.wEye[1];
      camera.resetCamera([0, 1, 0], [currentX, currentY, 0], [currentX, currentY, targetZ]);

      console.log('  Reset camera Z to', targetZ);
    } else {
      console.log('  No zoom specified, keeping default Z');
    }

    // Apply pitch and bearing
    if (cameraSpec.pitch !== undefined && cameraSpec.pitch !== 0) {
      const pitchRadians = (cameraSpec.pitch * Math.PI) / 180;
      camera.pitch(pitchRadians);
    }

    if (cameraSpec.bearing !== undefined && cameraSpec.bearing !== 0) {
      const bearingRadians = (cameraSpec.bearing * Math.PI) / 180;
      camera.yaw(bearingRadians);
    }

    // Final camera update after all changes
    console.log('Calling final camera.update()...');
    camera.update();

    // @ts-ignore - logging final position
    const finalX = camera.wEye[0];
    // @ts-ignore
    const finalY = camera.wEye[1];
    // @ts-ignore
    const finalZ = camera.wEye[2];
    console.log(`Camera final position: [${finalX}, ${finalY}, ${finalZ}]`);
  }

  /**
   * Render a single map layer.
   * Returns the collection for camera positioning.
   */
  private async renderMapLayer(
    db: AutkDb,
    map: AutkMap,
    layerSpec: MapView['layers'][0]
  ): Promise<any> {
    // getLayer() returns FeatureCollection directly
    const collection = await db.getLayer(layerSpec.source);

    if (!collection) {
      throw new Error(`Failed to load layer data: ${layerSpec.source}`);
    }

    const layerId = layerSpec.id || layerSpec.source;

    // Determine layer type
    const layerType = layerSpec.type || this.inferLayerType(collection);

    console.log(`Loading layer "${layerId}" with type "${layerType}"`);
    console.log(`  Feature count: ${collection.features?.length || 0}`);
    console.log(`  First feature geometry type: ${collection.features?.[0]?.geometry?.type}`);

    // Load collection into map
    // loadCollection signature: (id: string, params: { collection, type?, ... })
    map.loadCollection(layerId, {
      collection,
      type: layerType,
    });

    console.log(`  Layer "${layerId}" loaded successfully`);

    // Apply encoding if specified
    if (layerSpec.encoding) {
      await this.applyEncoding(map, layerId, collection, layerSpec.encoding);
    }

    // Apply constant styles if specified
    if (layerSpec.style) {
      this.applyStyle(map, layerId, layerSpec.style);
    }

    // Return collection for camera positioning
    return collection;
  }

  /**
   * Infer layer rendering type from data.
   */
  private inferLayerType(_collection: any): 'buildings' | 'polygons' | 'points' | 'polylines' | null {
    // TODO: Inspect geometry types from _collection to infer layer type
    // For now, default to buildings for 3D
    return 'buildings';
  }

  /**
   * Apply visual encodings to a layer.
   */
  private async applyEncoding(
    map: AutkMap,
    layerId: string,
    collection: any,
    encoding: MapView['layers'][0]['encoding']
  ): Promise<void> {
    if (!encoding) return;

    // Apply color encoding
    if (encoding.color) {
      await this.applyColorEncoding(map, layerId, collection, encoding.color);
    }

    // Apply opacity encoding
    if (encoding.opacity) {
      // TODO: Implement opacity encoding
      console.warn('Opacity encoding not yet implemented');
    }

    // Apply size encoding
    if (encoding.size) {
      // TODO: Implement size encoding
      console.warn('Size encoding not yet implemented');
    }

    // Apply height encoding
    if (encoding.height) {
      // TODO: Implement height encoding (for 3D extrusion)
      console.warn('Height encoding not yet implemented');
    }
  }

  /**
   * Apply color encoding channel.
   */
  private async applyColorEncoding(
    map: AutkMap,
    layerId: string,
    collection: any,
    colorChannel: EncodingChannel
  ): Promise<void> {
    if ('field' in colorChannel) {
      // Field-based encoding
      const field = colorChannel.field;
      const scale = colorChannel.scale;

      // Convert field name to property path (e.g., "value" -> "properties.value")
      // AutkMap expects dot-path notation like "properties.fieldName"
      const propertyPath = field.startsWith('properties.') ? field : `properties.${field}`;

      // Step 1: Update thematic mapping (assigns values to features)
      map.updateThematic(layerId, {
        collection,
        property: propertyPath,
      });

      // Step 2: Update color map configuration (sets color scheme and domain strategy)
      if (scale) {
        const domainSpec = this.createDomainSpec(scale.type);
        map.updateColorMap(layerId, {
          colorMap: {
            // Map scale type to domain strategy
            ...(domainSpec && { domainSpec }),
            // Map scheme name to interpolator
            // TODO: Add proper scheme name to ColorMapInterpolator mapping
            // For now, this will use the default interpolator
          },
        });
      }
    } else if ('value' in colorChannel) {
      // Constant value encoding
      // TODO: Apply constant color to all features
      // This requires a method to set uniform color on a layer
      console.warn('Constant color encoding not yet implemented');
    }
  }

  /**
   * Create ColorMapDomainSpec from spec scale type.
   *
   * ColorMapDomainSpec is a discriminated union that requires different shapes
   * for each strategy type.
   */
  private createDomainSpec(
    scaleType?: 'linear' | 'quantile' | 'categorical'
  ): { type: ColorMapDomainStrategy.MIN_MAX } | { type: ColorMapDomainStrategy.PERCENTILE } | undefined {
    switch (scaleType) {
      case 'linear':
        return { type: ColorMapDomainStrategy.MIN_MAX };
      case 'quantile':
        return { type: ColorMapDomainStrategy.PERCENTILE };
      case 'categorical':
        // AutkMap doesn't have a categorical strategy yet, use minMax
        return { type: ColorMapDomainStrategy.MIN_MAX };
      default:
        return undefined; // Let updateColorMap use its default
    }
  }

  /**
   * Apply constant style properties to a layer.
   */
  private applyStyle(
    map: AutkMap,
    layerId: string,
    style: MapView['layers'][0]['style']
  ): void {
    if (!style) return;

    // Get the layer from the layer manager
    const layer = map.layerManager.searchByLayerId(layerId);
    if (!layer) {
      console.warn(`Layer ${layerId}: not found in layer manager`);
      return;
    }

    // Apply opacity via updateRenderInfo
    if (style.opacity !== undefined) {
      map.updateRenderInfo(layerId, { opacity: style.opacity });
      console.log(`Layer ${layerId}: set opacity to ${style.opacity}`);
    }

    // Apply point size directly to SpriteLayer
    if (style.size !== undefined) {
      // Check if this is a SpriteLayer (points)
      if ('_pointSize' in layer) {
        // @ts-ignore - accessing private member
        layer._pointSize = style.size;
        console.log(`Layer ${layerId}: set point size to ${style.size}`);
      } else {
        console.warn(`Layer ${layerId}: size style only applies to point layers`);
      }
    }

    // Constant color needs color mapping disabled and uniform color
    if (style.color) {
      // For now, just disable color mapping so the default color shows
      // TODO: Add proper constant color support
      map.updateRenderInfo(layerId, { isColorMap: false });
      console.log(`Layer ${layerId}: disabled color mapping (constant color not fully implemented: ${style.color})`);
    }

    // Stroke styles
    if (style.strokeColor || style.strokeWidth) {
      console.warn(`Layer ${layerId}: stroke styles not yet supported`);
    }

    // Width for lines
    if (style.width) {
      console.warn(`Layer ${layerId}: width style not yet supported (requested: ${style.width})`);
    }
  }

  /**
   * Render a histogram view.
   */
  async renderHistogram(
    db: AutkDb,
    view: HistogramView,
    container: HTMLElement
  ): Promise<AutkPlot> {
    // getLayer() returns FeatureCollection directly
    const collection = await db.getLayer(view.source);

    if (!collection) {
      throw new Error(`Failed to load data for histogram: ${view.source}`);
    }

    const xField = view.x.field;

    const plot = new AutkPlot(container, {
      type: 'barchart',
      collection,
      attributes: {
        axis: [xField, '@transform'],
      },
      transform: {
        preset: 'binning-1d',
        options: {
          bins: view.bins || 30,
        },
      },
      events: [PlotEvent.BRUSH_X],
      labels: {
        axis: [xField, 'count'],
        ...(view.name && { title: view.name }),
      },
    });

    // Store selection configuration for link management
    if (view.selection) {
      // Selection setup will be handled by LinkManager
      // Store selection metadata on plot for retrieval
      (plot as any)._selectionConfig = view.selection;
    }

    return plot;
  }
}
