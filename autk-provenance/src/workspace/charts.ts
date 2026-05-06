import { Scatterplot, Barchart, ParallelCoordinates, Histogram, PlotEvent } from 'autk-plot';
import type { createInsightsWorkspaceShell } from '../ui/workspace-shell';
import type { ChartModalDescriptor, InsightsChartSchema } from '../charts/types';

const CARD_CHART_MARGINS = {
  scatter: { left: 60, right: 16, top: 48, bottom: 48 },
  bar: { left: 55, right: 16, top: 48, bottom: 72 },
  parallel: { left: 28, right: 28, top: 50, bottom: 36 },
  histogram: { left: 55, right: 16, top: 48, bottom: 48 },
} as const;

const MODAL_CHART_MARGINS = {
  scatter: { left: 62, right: 16, top: 42, bottom: 48 },
  bar: { left: 55, right: 16, top: 42, bottom: 72 },
  parallel: { left: 28, right: 28, top: 44, bottom: 36 },
  histogram: { left: 55, right: 16, top: 42, bottom: 48 },
} as const;

type InsightsWorkspaceShell = ReturnType<typeof createInsightsWorkspaceShell>;

function plotSize(element: HTMLElement, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: rect.width > 20 ? Math.floor(rect.width) : fallbackWidth,
    height: rect.height > 20 ? Math.floor(rect.height) : fallbackHeight,
  };
}

export function applySchemaToShell(shell: InsightsWorkspaceShell, schema: InsightsChartSchema): void {
  shell.thematicSelect.innerHTML = `<option value="">None</option>${schema.thematicFields.map((field) => `<option value="${field.key}">${field.label}</option>`).join('')}`;
  shell.plotPanels.scatter.title.textContent = schema.scatter.title;
  shell.plotPanels.scatter.hint.textContent = schema.scatter.subtitle;
  shell.plotPanels.bar.title.textContent = schema.bar.title;
  shell.plotPanels.bar.hint.textContent = schema.bar.subtitle;
  shell.plotPanels.parallel.title.textContent = schema.parallel.title;
  shell.plotPanels.parallel.hint.textContent = schema.parallel.subtitle;
  shell.plotPanels.histogram.title.textContent = schema.histogram.title;
  shell.plotPanels.histogram.hint.textContent = schema.histogram.subtitle;
}

export function createWorkspaceCharts(shell: InsightsWorkspaceShell, schema: InsightsChartSchema) {
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
    margins: CARD_CHART_MARGINS.scatter,
    events: [PlotEvent.CLICK, PlotEvent.BRUSH],
  });
  const bar = new Barchart({
    div: shell.plotPanels.bar.body,
    collection: schema.bar.collection,
    attributes: { axis: [schema.bar.axisField, schema.bar.valueField] },
    labels: { axis: [schema.bar.groupFieldLabel, 'Count'], title: schema.bar.title },
    width: barDims.width,
    height: barDims.height,
    margins: CARD_CHART_MARGINS.bar,
    events: [PlotEvent.CLICK],
  });
  const parallel = new ParallelCoordinates({
    div: shell.plotPanels.parallel.body,
    collection: schema.collection,
    attributes: { axis: schema.parallel.fields.map((field) => field.key) },
    labels: { axis: schema.parallel.fields.map((field) => field.label), title: schema.parallel.title },
    width: parallelDims.width,
    height: parallelDims.height,
    margins: CARD_CHART_MARGINS.parallel,
    events: [PlotEvent.BRUSH_Y],
  });
  const histogram = new Histogram({
    div: shell.plotPanels.histogram.body,
    collection: schema.collection,
    attributes: { axis: [schema.histogram.field.key] },
    labels: { axis: [schema.histogram.field.label, 'Count'], title: schema.histogram.title },
    width: histogramDims.width,
    height: histogramDims.height,
    margins: CARD_CHART_MARGINS.histogram,
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
        div, collection: schema.collection,
        attributes: { axis: [schema.scatter.x.key, schema.scatter.y.key] },
        labels: { axis: [schema.scatter.x.label, schema.scatter.y.label], title: schema.scatter.title },
        width, height, margins: MODAL_CHART_MARGINS.scatter, events: [PlotEvent.CLICK, PlotEvent.BRUSH],
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
        div, collection: schema.bar.collection,
        attributes: { axis: [schema.bar.axisField, schema.bar.valueField] },
        labels: { axis: [schema.bar.groupFieldLabel, 'Count'], title: schema.bar.title },
        width, height, margins: MODAL_CHART_MARGINS.bar, events: [PlotEvent.CLICK],
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
        div, collection: schema.collection,
        attributes: { axis: schema.parallel.fields.map((field) => field.key) },
        labels: { axis: schema.parallel.fields.map((field) => field.label), title: schema.parallel.title },
        width, height, margins: MODAL_CHART_MARGINS.parallel, events: [PlotEvent.BRUSH_Y],
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
        div, collection: schema.collection,
        attributes: { axis: [schema.histogram.field.key] },
        labels: { axis: [schema.histogram.field.label, 'Count'], title: schema.histogram.title },
        width, height, margins: MODAL_CHART_MARGINS.histogram, events: [PlotEvent.CLICK],
      }),
    },
  ];

  return { scatter, bar, parallel, histogram, modalDescriptors };
}
