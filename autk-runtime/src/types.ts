/**
 * AutarkSpec TypeScript types - generated from autark-spec-v0.1.json
 *
 * These types match the JSON Schema exactly and represent the declarative
 * specification format for Autark urban visual analytics applications.
 */

// ============================================================================
// Top-Level Spec
// ============================================================================

export interface AutarkSpec {
  $schema: 'https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json';
  version: '0.1';
  metadata?: Metadata;
  workspace?: Workspace;
  data?: DataSource[];
  transforms?: Transform[];
  views: View[]; // Required - at least one view
  links?: Link[];
  layout?: Layout;
}

// ============================================================================
// Metadata and Workspace
// ============================================================================

export interface Metadata {
  title?: string;
  description?: string;
  authors?: string[];
  created?: string; // ISO 8601 format recommended
}

export interface Workspace {
  name?: string; // Must match ^[A-Za-z_][A-Za-z0-9_]*$
  coordinateFormat?: string; // Default: "EPSG:4326"
}

// ============================================================================
// Data Sources
// ============================================================================

export type DataSource = OsmDataSource | GeoJsonDataSource | CsvDataSource;

export interface OsmDataSource {
  type: 'osm';
  name: string; // SQL-safe identifier
  area: string; // Place name for Overpass query
  geocodeArea?: string; // Parent area used to resolve Overpass relation areas
  areas?: string[]; // Relation area names inside geocodeArea
  layers: Array<'buildings' | 'roads' | 'parks' | 'water' | 'surface'>;
  source?: 'overpass' | 'pbf'; // Default: "overpass"
  pbfFileUrl?: string; // Required if source is "pbf"
  coordinateFormat?: string;
}

export interface GeoJsonDataSource {
  type: 'geojson';
  name: string; // SQL-safe identifier
  url?: string;
  values?: object; // GeoJSON FeatureCollection
  layerType?: 'polygons' | 'polylines' | 'points' | 'buildings';
  coordinateFormat?: string; // Default: "EPSG:4326"
}

export interface CsvDataSource {
  type: 'csv';
  name: string; // SQL-safe identifier
  url?: string;
  values?: unknown[][]; // Array of arrays
  delimiter?: string; // Default: ","
  geometry?: CsvGeometry;
}

export type CsvGeometry = CsvLatLngGeometry | CsvWktGeometry;

export interface CsvLatLngGeometry {
  type: 'latlng';
  latitude: string; // Column name
  longitude: string; // Column name
  coordinateFormat?: string; // Default: "EPSG:4326"
}

export interface CsvWktGeometry {
  type: 'wkt';
  column: string; // Column name containing WKT
  coordinateFormat?: string;
}

// ============================================================================
// Transforms
// ============================================================================

export type Transform =
  | SpatialJoinTransform
  | HeatmapTransform
  | GpgpuComputeTransform
  | RenderComputeTransform;

export interface SpatialJoinTransform {
  type: 'spatialJoin';
  root: string; // Data source name (mutated in place)
  join: string; // Data source name
  near?: {
    distance: number; // exclusiveMinimum: 0
    useCentroid?: boolean; // Default: true
  };
  groupBy?: Aggregation[];
}

export interface Aggregation {
  column: string; // Use "*" for count
  op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'weighted' | 'collect';
  as?: string; // Output property name
  normalize?: boolean; // Default: false
}

export interface HeatmapTransform {
  type: 'heatmap';
  source: string;
  output: string;
  near: {
    distance: number;
    useCentroid?: boolean;
  };
  grid: {
    rows: number;
    columns: number;
  };
  groupBy?: Array<Omit<Aggregation, 'op'> & {
    op?: Exclude<Aggregation['op'], 'collect'>;
  }>;
}

export interface GpgpuComputeTransform {
  type: 'gpgpuCompute';
  source: string;
  output: string;
  layerType?: 'polygons' | 'polylines' | 'points' | 'buildings';
  coordinateFormat?: string;
  variableMapping: Record<string, string>;
  attributeArrays?: Record<string, number>;
  attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;
  uniforms?: Record<string, number>;
  uniformArrays?: Record<string, number[]>;
  uniformMatrices?: Record<string, { data: number[][]; cols: number }>;
  wgslBody: string;
  resultField?: string;
  outputColumns?: string[];
}

export interface RenderComputeTransform {
  type: 'renderCompute';
  output: string;
  layerType?: 'polygons' | 'polylines' | 'points' | 'buildings';
  coordinateFormat?: string;
  layers: Array<{
    id: string;
    source: string;
    type: 'buildings' | 'roads' | 'polygons' | 'polylines' | 'points';
    objectIdProperty?: string;
  }>;
  viewpoints: {
    source: string;
    strategy?: { type: 'centroid' } | { type: 'building-windows'; floors: number };
    sampling?: {
      directions?: number;
      azimuthOffsetDeg?: number;
      pitchDeg?: number;
    };
  };
  aggregation:
    | {
        type: 'classes';
        includeBackground?: boolean;
        backgroundLayerType?: string;
      }
    | {
        type: 'objects';
      };
  camera?: {
    fov?: number;
    clip?: {
      near?: number;
      far?: number;
    };
  };
  tileSize?: number;
}

// ============================================================================
// Views
// ============================================================================

export type View = MapView | HistogramView | ScatterplotView | TableView;

export interface MapView {
  type: 'map';
  name?: string; // SQL-safe identifier
  camera?: Camera;
  style?: Record<string, unknown>; // Runtime-defined properties
  layers: MapLayer[]; // At least one layer
}

export interface Camera {
  pitch?: number; // 0-90 degrees
  bearing?: number; // 0-360 degrees
  zoom?: number; // minimum: 0
}

export interface MapLayer {
  source: string; // Data source name (e.g., "manhattan_osm_buildings")
  id?: string; // SQL-safe identifier, required for link targets
  type?: 'buildings' | 'roads' | 'polygons' | 'polylines' | 'points';
  encoding?: Encoding;
  style?: LayerStyle;
}

export interface Encoding {
  color?: EncodingChannel;
  opacity?: EncodingChannel;
  size?: EncodingChannel;
  height?: EncodingChannel;
}

export type EncodingChannel = FieldEncoding | ValueEncoding;

export interface FieldEncoding {
  field: string; // Property path
  scale?: Scale;
}

export interface ValueEncoding {
  value: string | number | boolean; // Constant value
}

export interface Scale {
  type?: 'linear' | 'quantile' | 'categorical'; // Default: "linear"
  scheme?: string; // Color scheme name
  domain?: unknown[];
  domainStrategy?: 'minMax' | 'percentile' | 'user'; // Default: "minMax"
}

export interface LayerStyle {
  opacity?: number; // 0-1
  color?: string; // Hex or CSS color
  strokeColor?: string;
  strokeWidth?: number; // minimum: 0
  width?: number; // Line width, minimum: 0
  size?: number; // Point size, minimum: 0
}

export interface HistogramView {
  type: 'histogram';
  name?: string; // SQL-safe identifier
  source: string; // Data source name
  x: PlotAxis;
  y?: PlotAxis;
  bins?: number; // Default: 30, minimum: 1
  selection?: Selection;
}

export interface ScatterplotView {
  type: 'scatterplot';
  name?: string; // SQL-safe identifier
  source: string; // Data source name
  x: PlotAxis;
  y: PlotAxis;
  color?: PlotAxis;
  selection?: Selection;
}

export interface TableView {
  type: 'table';
  name?: string; // SQL-safe identifier
  source: string; // Data source name
  columns: PlotAxis[];
  selection?: Selection;
  sort?: {
    column?: string;
    direction?: 'asc' | 'desc';
  };
}

export interface PlotAxis {
  field: string; // Property name (short form, no "properties." prefix)
  scale?: Scale;
}

// ============================================================================
// Selections and Links
// ============================================================================

export interface Selection {
  name: string; // SQL-safe identifier
  type: 'point' | 'interval' | 'multi';
  fields?: string[];
}

export interface Link {
  selection: string; // Selection name
  target: string; // Layer ID
  action: 'highlight'; // MVP: only "highlight", "filter" deferred
}

// ============================================================================
// Layout
// ============================================================================

export interface Layout {
  type?: 'vertical' | 'horizontal' | 'grid'; // Default: "vertical"
  columns?: number; // minimum: 1
  gap?: number; // minimum: 0
}

// ============================================================================
// Runtime Options
// ============================================================================

export interface RuntimeOptions {
  /** DOM container for rendering (required for browser context) */
  container?: HTMLElement | string;

  /** Validation mode */
  validate?: boolean | 'strict'; // Default: true

  /** Error handling strategy */
  onError?: 'throw' | 'warn' | 'silent'; // Default: "throw"

  /** Progress callback for long-running operations */
  onProgress?: (message: string, percent?: number) => void;
}

// ============================================================================
// Runtime Error Types
// ============================================================================

export class AutarkRuntimeError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: unknown
  ) {
    super(message);
    this.name = 'AutarkRuntimeError';
  }
}

export class SpecValidationError extends AutarkRuntimeError {
  constructor(message: string, public errors: unknown[]) {
    super(message, 'SPEC_VALIDATION_ERROR', { errors });
    this.name = 'SpecValidationError';
  }
}

export class ReferenceError extends AutarkRuntimeError {
  constructor(message: string, public ref: string) {
    super(message, 'REFERENCE_ERROR', { ref });
    this.name = 'ReferenceError';
  }
}

export class DataLoadError extends AutarkRuntimeError {
  constructor(message: string, public source: string) {
    super(message, 'DATA_LOAD_ERROR', { source });
    this.name = 'DataLoadError';
  }
}
