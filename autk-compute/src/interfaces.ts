import { FeatureCollection } from 'geojson';

export interface ComputeFunctionIntoPropertiesParams {
  collection: FeatureCollection;
  /** Per-feature scalars: maps WGSL variable name → feature property path. */
  variableMapping: Record<string, string>;
  /** Per-feature arrays: variable name → fixed element count. */
  attributeArrays?: Record<string, number>;
  /**
   * Per-feature matrices: variable name → { rows, cols }.
   * Use `rows: 'auto'` to infer the row count per feature at runtime.
   */
  attributeMatrices?: Record<string, { rows: number | 'auto'; cols: number }>;
  /**
   * Global variables shared across all features — uploaded once to the GPU, not replicated
   * per feature. Ideal for values that are the same for every invocation (e.g. a building
   * height, a sun angle, a day-of-year).
   */
  uniforms?: Record<string, number>;
  uniformArrays?: Record<string, number[]>;
  uniformMatrices?: Record<string, { data: number[][]; cols: number }>;
  /**
   * Name(s) of the output column(s) written into feature.properties.compute.
   */
  resultField?: string;
  outputColumns?: string[];
  /**
   * WGSL function body. All variableMapping and uniform variables are available as parameters.
   */
  wgslBody: string;
}

export interface ComputeResult {
  collection: FeatureCollection;
}
