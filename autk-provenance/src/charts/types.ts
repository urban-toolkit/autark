import type { FeatureCollection } from 'geojson';
import type { PlotBaseInteractive } from 'autk-plot';

export interface NumericFieldDescriptor {
  key: string;
  label: string;
  coverage: number;
  distinctCount: number;
  source: 'native' | 'derived';
  description: string;
}

export interface CategoricalFieldDescriptor {
  key: string;
  label: string;
  coverage: number;
  distinctCount: number;
}

export interface ScatterChartConfig {
  x: NumericFieldDescriptor;
  y: NumericFieldDescriptor;
  title: string;
  subtitle: string;
}

export interface HistogramChartConfig {
  field: NumericFieldDescriptor;
  title: string;
  subtitle: string;
}

export interface ParallelChartConfig {
  fields: NumericFieldDescriptor[];
  title: string;
  subtitle: string;
}

export interface BarChartConfig {
  collection: FeatureCollection;
  axisField: string;
  valueField: string;
  groupFieldLabel: string;
  title: string;
  subtitle: string;
}

export interface InsightsChartSchema {
  collection: FeatureCollection;
  numericFields: NumericFieldDescriptor[];
  categoricalFields: CategoricalFieldDescriptor[];
  thematicFields: NumericFieldDescriptor[];
  scatter: ScatterChartConfig;
  histogram: HistogramChartConfig;
  parallel: ParallelChartConfig;
  bar: BarChartConfig;
}

export type ChartKey = 'scatter' | 'histogram' | 'bar' | 'parallel';

export interface ChartModalDescriptor {
  key: ChartKey;
  title: string;
  subtitle: string;
  originalPlot: PlotBaseInteractive;
  events: string[];
  trigger: HTMLElement;
  button: HTMLButtonElement | null;
  createModalPlot(container: HTMLElement, width: number, height: number): PlotBaseInteractive;
}
