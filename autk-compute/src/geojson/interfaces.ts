import { FeatureCollection } from 'geojson';

export interface ComputeFunctionIntoPropertiesParams {
  geojson: FeatureCollection;
  variableMapping: Record<string, string>; // { variableName: propertyPath }
  /**
   * Optional: Declare which variables are arrays and their fixed length.
   * All features must have arrays of this length (or will be padded with zeros).
   *
   * Example: { myArray: 10, embeddings: 128 }
   */
  arrayVariables?: Record<string, number>;
  /**
   * Optional: Declare which variables are matrices and their dimensions (rows × cols).
   * All features must have matrices of these dimensions (or will be padded with zeros).
   *
   * Example: { transformMatrix: { rows: 3, cols: 3 }, heatmap: { rows: 10, cols: 10 } }
   */
  matrixVariables?: Record<string, { rows: number; cols: number }>;
  outputColumnName: string;
  /**
   * WGSL function body that returns a f32 value. The function receives the mapped variables as parameters.
   *
   * Scalar variables are passed as f32 values.
   * Array variables are passed as: arrayName (array<f32, N>) and arrayName_length (u32)
   * Matrix variables are passed as: matrixName (array<f32, rows*cols>), matrixName_rows (u32), matrixName_cols (u32)
   *   - Matrices are flattened in row-major order
   *   - Access element at (row, col): matrixName[row * matrixName_cols + col]
   *
   * Examples:
   * Simple scalar: "return x * y;"
   * With arrays: `
   *   var sum = 0.0;
   *   for (var i = 0u; i < myArray_length; i++) {
   *     sum += myArray[i];
   *   }
   *   return x * sum;
   * `
   * With matrices: `
   *   // Calculate trace (sum of diagonal elements)
   *   var trace = 0.0;
   *   for (var i = 0u; i < matrix_rows; i++) {
   *     trace += matrix[i * matrix_cols + i];
   *   }
   *   return trace;
   * `
   */
  wglsFunction: string;
}

export interface ComputeResult {
  geojson: FeatureCollection;
}
