import type { FeatureCollection } from 'geojson';
import type { AutkMap, MapEvent } from 'autk-map';
import { Scatterplot, Barchart, ParallelCoordinates, Histogram, PlotEvent, type PlotBaseInteractive } from 'autk-plot';
import { createAutarkProvenance, type AutarkProvenanceApi } from './create-autark-provenance';
import { renderProvenanceTrailUI } from './provenance-trail-ui';
import { buildInsightsChartSchema } from './charts/chart-config';
import { createChartModalController } from './charts/chart-modal';
import type { ChartModalDescriptor, InsightsChartSchema } from './charts/types';
import { createInsightsWorkspaceShell } from './ui/workspace-shell';
import { renderWorkspaceSessionInsights } from './ui/workspace-session-insights';
import { ensureInsightsWorkspaceStyles } from './ui/workspace-styles';
import { bindWorkspaceTabs } from './ui/workspace-tabs';
import type { IDbForProvenance } from './adapters/db-adapter';
import type { MapSelectorConfig } from './adapters/map-adapter';
import { PlotType, type MapViewState } from './types';

export interface RenderInsightsWorkspaceOptions {
  container: HTMLElement;
  map: AutkMap;
  collection: FeatureCollection;
  layerId: string;
  db?: IDbForProvenance;
  title?: string;
  description?: string;
  mapConfig?: MapSelectorConfig;
}

export interface RenderInsightsWorkspaceResult {
  provenance: AutarkProvenanceApi;
  schema: InsightsChartSchema;
  destroy(): void;
}

function plotSize(element: HTMLElement, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width > 20 ? Math.floor(rect.width) : fallbackWidth,
    height: rect.height > 20 ? Math.floor(rect.height) : fallbackHeight,
  };
}

function createPlotAdapter(plot: PlotBaseInteractive, plotId: string, plotType: PlotType) {
  return Object.assign(plot, {
    plotId,
    plotType,
    plotEvents: {
      addEventListener(event: string, fn: (selection: number[]) => void) {
        plot.events.on(event as PlotEvent, ({ selection }) => fn(selection));
      },
      removeEventListener(event: string, fn: (selection: number[]) => void) {
        plot.events.off(event as PlotEvent, fn as never);
      },
    },
    setHighlightedIds(ids: number[]) {
      plot.setSelection(ids);
    },
  });
}

function mountMapInWorkspace(map: AutkMap, body: HTMLElement): void {
  const internals = map as AutkMap & {
    _resizeEvents?: { resize?: () => void };
  };

  map.ui.destroy();
  body.replaceChildren(map.canvas);
  map.canvas.style.width = '100%';
  map.canvas.style.height = '100%';
  internals._resizeEvents?.resize?.();
  map.ui.buildUi();
  map.ui.handleResize();
  map.draw();
}

function applyThematic(map: AutkMap, collection: FeatureCollection, layerId: string, property: string): void {
  const mapApi = map as AutkMap & {
    updateThematic?: (id: string, options: { collection: FeatureCollection; property: string }) => void;
  };
  if (property) {
    mapApi.updateThematic?.(layerId, { collection, property });
    return;
  }
  map.updateRenderInfo(layerId, { renderInfo: { isColorMap: false } });
}

export function renderInsightsWorkspace(options: RenderInsightsWorkspaceOptions): RenderInsightsWorkspaceResult {
  const { container, map, collection, layerId, db, title, description, mapConfig } = options;
  ensureInsightsWorkspaceStyles();
  const schema = buildInsightsChartSchema(collection);
  const shell = createInsightsWorkspaceShell(container, title, description);
  const detachTabs = bindWorkspaceTabs(shell.root);
  shell.thematicSelect.innerHTML = `<option value="">None</option>${schema.thematicFields.map((field) => `<option value="${field.key}">${field.label}</option>`).join('')}`;
  shell.plotPanels.scatter.title.textContent = schema.scatter.title;
  shell.plotPanels.scatter.hint.textContent = schema.scatter.subtitle;
  shell.plotPanels.bar.title.textContent = schema.bar.title;
  shell.plotPanels.bar.hint.textContent = schema.bar.subtitle;
  shell.plotPanels.parallel.title.textContent = schema.parallel.title;
  shell.plotPanels.parallel.hint.textContent = schema.parallel.subtitle;
  shell.plotPanels.histogram.title.textContent = schema.histogram.title;
  shell.plotPanels.histogram.hint.textContent = schema.histogram.subtitle;
  mountMapInWorkspace(map, shell.mapBody);

  const scatterDims = plotSize(shell.plotPanels.scatter.body, 360, 280);
  const barDims = plotSize(shell.plotPanels.bar.body, 360, 280);
  const parallelDims = plotSize(shell.plotPanels.parallel.body, 360, 280);
  const histogramDims = plotSize(shell.plotPanels.histogram.body, 360, 280);

  const scatter = new Scatterplot({
    div: shell.plotPanels.scatter.body,
    collection: schema.collection,
    attributes: { axis: [schema.scatter.x.key, schema.scatter.y.key] },
    labels: { axis: [schema.scatter.x.label, schema.scatter.y.label], title: schema.scatter.title },
    width: scatterDims.width,
    height: scatterDims.height,
    margins: { left: 62, right: 16, top: 36, bottom: 48 },
    events: [PlotEvent.CLICK, PlotEvent.BRUSH],
  });
  const bar = new Barchart({
    div: shell.plotPanels.bar.body,
    collection: schema.bar.collection,
    attributes: { axis: [schema.bar.axisField, schema.bar.valueField] },
    labels: { axis: [schema.bar.groupFieldLabel, 'Count'], title: schema.bar.title },
    width: barDims.width,
    height: barDims.height,
    margins: { left: 55, right: 16, top: 36, bottom: 72 },
    events: [PlotEvent.CLICK],
  });
  const parallel = new ParallelCoordinates({
    div: shell.plotPanels.parallel.body,
    collection: schema.collection,
    attributes: { axis: schema.parallel.fields.map((field) => field.key) },
    labels: { axis: schema.parallel.fields.map((field) => field.label), title: schema.parallel.title },
    width: parallelDims.width,
    height: parallelDims.height,
    margins: { left: 28, right: 28, top: 36, bottom: 36 },
    events: [PlotEvent.BRUSH_Y],
  });
  const histogram = new Histogram({
    div: shell.plotPanels.histogram.body,
    collection: schema.collection,
    attributes: { axis: [schema.histogram.field.key] },
    labels: { axis: [schema.histogram.field.label, 'Count'], title: schema.histogram.title },
    width: histogramDims.width,
    height: histogramDims.height,
    margins: { left: 55, right: 16, top: 36, bottom: 48 },
    events: [PlotEvent.CLICK],
  });

  const modalDescriptors: ChartModalDescriptor[] = [
    {
      key: 'scatter',
      title: schema.scatter.title,
      subtitle: schema.scatter.subtitle,
      originalPlot: scatter,
      events: [PlotEvent.CLICK, PlotEvent.BRUSH],
      trigger: shell.plotPanels.scatter.header,
      button: shell.plotPanels.scatter.button,
      createModalPlot: (div, width, height) => new Scatterplot({
        div,
        collection: schema.collection,
        attributes: { axis: [schema.scatter.x.key, schema.scatter.y.key] },
        labels: { axis: [schema.scatter.x.label, schema.scatter.y.label], title: schema.scatter.title },
        width,
        height,
        margins: { left: 62, right: 16, top: 36, bottom: 48 },
        events: [PlotEvent.CLICK, PlotEvent.BRUSH],
      }),
    },
    {
      key: 'bar',
      title: schema.bar.title,
      subtitle: schema.bar.subtitle,
      originalPlot: bar,
      events: [PlotEvent.CLICK],
      trigger: shell.plotPanels.bar.header,
      button: shell.plotPanels.bar.button,
      createModalPlot: (div, width, height) => new Barchart({
        div,
        collection: schema.bar.collection,
        attributes: { axis: [schema.bar.axisField, schema.bar.valueField] },
        labels: { axis: [schema.bar.groupFieldLabel, 'Count'], title: schema.bar.title },
        width,
        height,
        margins: { left: 55, right: 16, top: 36, bottom: 72 },
        events: [PlotEvent.CLICK],
      }),
    },
    {
      key: 'parallel',
      title: schema.parallel.title,
      subtitle: schema.parallel.subtitle,
      originalPlot: parallel,
      events: [PlotEvent.BRUSH_Y],
      trigger: shell.plotPanels.parallel.header,
      button: shell.plotPanels.parallel.button,
      createModalPlot: (div, width, height) => new ParallelCoordinates({
        div,
        collection: schema.collection,
        attributes: { axis: schema.parallel.fields.map((field) => field.key) },
        labels: { axis: schema.parallel.fields.map((field) => field.label), title: schema.parallel.title },
        width,
        height,
        margins: { left: 28, right: 28, top: 36, bottom: 36 },
        events: [PlotEvent.BRUSH_Y],
      }),
    },
    {
      key: 'histogram',
      title: schema.histogram.title,
      subtitle: schema.histogram.subtitle,
      originalPlot: histogram,
      events: [PlotEvent.CLICK],
      trigger: shell.plotPanels.histogram.header,
      button: shell.plotPanels.histogram.button,
      createModalPlot: (div, width, height) => new Histogram({
        div,
        collection: schema.collection,
        attributes: { axis: [schema.histogram.field.key] },
        labels: { axis: [schema.histogram.field.label, 'Count'], title: schema.histogram.title },
        width,
        height,
        margins: { left: 55, right: 16, top: 36, bottom: 48 },
        events: [PlotEvent.CLICK],
      }),
    },
  ];
  const chartModal = createChartModalController(modalDescriptors);

  const thematicControl = {
    selector: '.autk-workspace-select',
    event: 'change' as const,
    actionType: 'MAP_THEMATIC_PROPERTY',
    getLabel: (element: Element) => {
      const value = (element as HTMLSelectElement).value;
      return value ? `Color by: ${value}` : 'Thematic off';
    },
    getStateDelta: (element: Element) => {
      const value = (element as HTMLSelectElement).value;
      return { filters: { thematicProperty: value || null }, ui: { thematicEnabled: !!value } };
    },
    applyState: (element: Element, state: { filters?: Record<string, unknown> }) => {
      const value = (state.filters?.thematicProperty as string | null) ?? '';
      (element as HTMLSelectElement).value = value;
      applyThematic(map, schema.collection, layerId, value);
    },
  };
  shell.thematicSelect.addEventListener('change', () => applyThematic(map, schema.collection, layerId, shell.thematicSelect.value));

  const mapViewApi = map as AutkMap & {
    addViewListener?: (callback: (state: MapViewState) => void) => void;
    removeViewListener?: (callback: (state: MapViewState) => void) => void;
    setViewState?: (state: MapViewState) => void;
    updateRenderInfoProperty?: (layerName: string, property: string, value: unknown) => void;
  };
  const mapForProvenance: NonNullable<Parameters<typeof createAutarkProvenance>[0]['map']> = {
    mapEvents: {
      addEventListener(event: string, fn: (selection: number[], currentLayerId: string) => void) {
        map.events.on(event as MapEvent, ({ selection, layerId: eventLayerId }: { selection: number[]; layerId: string }) => fn(selection, eventLayerId));
      },
      removeEventListener(event: string, fn: (selection: number[], currentLayerId: string) => void) {
        map.events.off(event as MapEvent, fn as never);
      },
    },
    addViewListener: mapViewApi.addViewListener?.bind(map),
    removeViewListener: mapViewApi.removeViewListener?.bind(map),
    setViewState: mapViewApi.setViewState?.bind(map),
    canvas: map.canvas,
    ui: map.ui,
    updateRenderInfoProperty: mapViewApi.updateRenderInfoProperty?.bind(map),
    layerManager: map.layerManager,
  };
  const provenance = createAutarkProvenance({
    map: mapForProvenance,
    plots: [
      createPlotAdapter(scatter, 'Scatterplot', PlotType.SCATTERPLOT),
      createPlotAdapter(bar, 'Bar Chart', PlotType.BARCHART),
      createPlotAdapter(parallel, 'Parallel Coordinates', PlotType.PARALLEL_COORDINATES),
      createPlotAdapter(histogram, 'Histogram', PlotType.HISTOGRAM),
    ],
    db,
    mapConfig: { ...(mapConfig ?? {}), customControls: [...(mapConfig?.customControls ?? []), thematicControl] },
  });

  const destroyTrail = renderProvenanceTrailUI({
    provenance,
    container: shell.provenanceTrail,
    insightsContainer: shell.provenanceInsights,
    showTimestamps: true,
    showGraph: true,
    showPathList: true,
    showBackForward: true,
  });

  const updateNodeCount = () => {
    const count = provenance.getGraph().nodes.size;
    shell.nodeCountBadge.textContent = `${count} step${count !== 1 ? 's' : ''} recorded`;
    renderWorkspaceSessionInsights(shell.chartsInsights, provenance);
    chartModal.syncSelection();
  };
  const unsubscribe = provenance.addObserver(updateNodeCount);
  updateNodeCount();

  return {
    provenance,
    schema,
    destroy: () => {
      unsubscribe();
      destroyTrail();
      detachTabs();
      chartModal.destroy();
      container.innerHTML = '';
    },
  };
}
