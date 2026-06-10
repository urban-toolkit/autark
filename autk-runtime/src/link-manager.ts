/**
 * LinkManager - Manages cross-view selections and links
 */

import type { AutkMap } from '@urban-toolkit/autk-map';
import type { AutkPlot } from '@urban-toolkit/autk-plot';
import { PlotEvent } from '@urban-toolkit/autk-plot';
import type { Link, View } from './types.js';

export class LinkManager {
  private eventCleanupFns: Array<() => void> = [];

  /**
   * Connect selections and links between views.
   */
  connectLinks(
    links: Link[],
    spec: { views: View[] },
    maps: Map<string, AutkMap>,
    plots: Map<string, AutkPlot>
  ): void {
    for (const link of links) {
      this.connectLink(link, spec, maps, plots);
    }
  }

  /**
   * Connect a single link.
   */
  private connectLink(
    link: Link,
    spec: { views: View[] },
    maps: Map<string, AutkMap>,
    plots: Map<string, AutkPlot>
  ): void {
    // Find the view that has the selection
    const sourceView = this.findViewWithSelection(spec.views, link.selection);
    if (!sourceView) {
      console.warn(`Selection not found: ${link.selection}`);
      return;
    }

    // Find the source plot/map
    const sourcePlot = this.findPlotWithSelection(plots, link.selection);
    if (!sourcePlot) {
      console.warn(`Plot with selection ${link.selection} not found`);
      return;
    }

    // Find the target map layer
    const targetMap = this.findMapWithLayer(spec.views, maps, link.target);
    if (!targetMap) {
      console.warn(`Target layer ${link.target} not found`);
      return;
    }

    // Wire up the link based on action
    switch (link.action) {
      case 'highlight':
        this.connectHighlightLink(sourcePlot, targetMap.map, targetMap.layerId);
        break;
      default:
        console.warn(`Unsupported link action: ${link.action}`);
    }
  }

  /**
   * Connect a highlight link from plot selection to map layer.
   */
  private connectHighlightLink(
    sourcePlot: AutkPlot,
    targetMap: AutkMap,
    targetLayerId: string
  ): void {
    // Listen to plot selection changes
    // AutkPlot fires events through events.on()
    const handler = () => {
      const selection = sourcePlot.selection;

      // Apply highlight to map layer
      // AutkMap.setHighlightedIds() method highlights features by ID
      if (selection && selection.length > 0) {
        targetMap.setHighlightedIds(targetLayerId, selection);
      } else {
        // Clear highlight when selection is empty
        targetMap.clearHighlightedIds(targetLayerId);
      }
    };

    // Listen to selection events. Histograms use horizontal brushes, while
    // other plot types may emit the generic brush event.
    sourcePlot.events.on(PlotEvent.BRUSH, handler);
    sourcePlot.events.on(PlotEvent.BRUSH_X, handler);

    // Store cleanup function
    this.eventCleanupFns.push(() => {
      sourcePlot.events.off(PlotEvent.BRUSH, handler);
      sourcePlot.events.off(PlotEvent.BRUSH_X, handler);
    });
  }

  /**
   * Find view with the given selection name.
   */
  private findViewWithSelection(views: View[], selectionName: string): View | undefined {
    return views.find((view) => {
      if (view.type === 'histogram' && view.selection) {
        return view.selection.name === selectionName;
      }
      return false;
    });
  }

  /**
   * Find plot that has the given selection.
   */
  private findPlotWithSelection(
    plots: Map<string, AutkPlot>,
    selectionName: string
  ): AutkPlot | undefined {
    for (const plot of plots.values()) {
      // Check if plot has selection config stored
      const selectionConfig = (plot as any)._selectionConfig;
      if (selectionConfig?.name === selectionName) {
        return plot;
      }
    }
    return undefined;
  }

  /**
   * Find map and layer ID for the given target layer ID.
   */
  private findMapWithLayer(
    views: View[],
    maps: Map<string, AutkMap>,
    targetLayerId: string
  ): { map: AutkMap; layerId: string } | undefined {
    // Find which view contains the target layer
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      if (view.type === 'map') {
        const layer = view.layers.find((l) => l.id === targetLayerId);
        if (layer) {
          // Get the map for this view
          const map = view.name ? maps.get(view.name) : maps.get(`_view_${i}`);
          if (map) {
            return { map, layerId: targetLayerId };
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Clean up all event listeners.
   */
  destroy(): void {
    for (const cleanup of this.eventCleanupFns) {
      cleanup();
    }
    this.eventCleanupFns = [];
  }
}
