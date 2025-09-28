import { FeatureCollection } from 'geojson';

export interface ComputeFunctionIntoPropertiesParams {
  geojson: FeatureCollection;
  variableMapping: Record<string, string>; // { variableName: propertyPath }
  outputColumnName: string;
  wglsFunction: string;
}
