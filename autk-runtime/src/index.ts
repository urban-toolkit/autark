/**
 * @urban-toolkit/autk-runtime
 *
 * Runtime for executing declarative AutarkSpec specifications.
 */

export { AutarkRuntime } from './runtime.js';
export { SpecValidator } from './validator.js';

// Export types
export type {
  AutarkSpec,
  Metadata,
  Workspace,
  DataSource,
  OsmDataSource,
  GeoJsonDataSource,
  CsvDataSource,
  CsvGeometry,
  Transform,
  SpatialJoinTransform,
  Aggregation,
  View,
  MapView,
  MapLayer,
  Camera,
  Encoding,
  EncodingChannel,
  FieldEncoding,
  ValueEncoding,
  Scale,
  LayerStyle,
  HistogramView,
  PlotAxis,
  Selection,
  Link,
  Layout,
  RuntimeOptions,
} from './types.js';

// Export error types
export {
  AutarkRuntimeError,
  SpecValidationError,
  ReferenceError,
  DataLoadError,
} from './types.js';
