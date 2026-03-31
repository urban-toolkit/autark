import { FeatureCollection } from 'geojson';

export interface ComputeFunctionIntoPropertiesParams {
  geojson: FeatureCollection;
  /** Per-feature scalars: maps WGSL variable name → feature property path. */
  attributes: Record<string, string>;
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
   *
   * uniforms        — single f32 values:        { bld_height: 42.0, doy: 172 }
   * uniformArrays   — flat f32 arrays:           { weights: [0.1, 0.9] }
   * uniformMatrices — 2-D arrays (rows × cols):  { ring: { data: [[x,y],...], cols: 2 } }
   *
   * In WGSL these are available as parameters with the same signatures as per-feature
   * counterparts (scalar: f32; array: array<f32,N> + length u32;
   * matrix: array<f32,rows*cols> + rows u32 + cols u32).
   */
  uniforms?: Record<string, number>;
  uniformArrays?: Record<string, number[]>;
  uniformMatrices?: Record<string, { data: number[][]; cols: number }>;
  /**
   * Name(s) of the output column(s) written into feature.properties.compute.
   *
   * Single output  — outputColumnName: 'shadow'
   *   The WGSL function body must return an f32.
   *
   * Multiple outputs — outputColumns: ['shadow', 'contribution']
   *   The WGSL function body must return an OutputArray (alias auto-generated as
   *   array<f32, N>). Write each value by index and return:
   *     var out: OutputArray;
   *     out[0] = shadow_minutes;
   *     out[1] = percentage;
   *     return out;
   */
  outputColumnName?: string;
  outputColumns?: string[];
  /**
   * WGSL function body. All attribute and uniform variables are available as parameters.
   *
   * Scalar:  f32
   * Array:   array<f32, N>  +  name_length: u32
   * Matrix:  array<f32, rows*cols>  +  name_rows: u32  +  name_cols: u32
   *          (row-major: element at (r,c) = name[r * name_cols + c])
   */
  wgslFunction: string;
}

export interface ComputeResult {
  geojson: FeatureCollection;
}
