import { FeatureCollection } from 'geojson';

export interface ComputeFunctionIntoPropertiesParams {
  geojson: FeatureCollection;
  variableMapping: Record<string, string>; // { variableName: propertyPath }
  outputColumnName: string;
  /**
   * WGSL function body that returns a f32 value. The function receives the mapped variables as parameters.
   *
   * Examples:
   * Simple: "return x * y;"
   * Multi-line: `
   *   let temp = x * 2.0;
   *   return temp + y;
   * `
   * Complex: `
   *   if (x > 0.0) {
   *     return sqrt(x * x + y * y);
   *   } else {
   *     return 0.0;
   *   }
   * `
   */
  wglsFunction: string;
}

export interface ComputeResult {
  geojson: FeatureCollection;
}
