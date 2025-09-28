import { FeatureCollection } from 'geojson';
import { ComputeFunctionIntoPropertiesUseCase } from './use-cases/compute-function-into-properties';
import { ComputeFunctionIntoPropertiesParams } from './interfaces';

export class GeojsonCompute {
  private computeFunctionIntoPropertiesUseCase: ComputeFunctionIntoPropertiesUseCase;

  constructor() {
    this.computeFunctionIntoPropertiesUseCase = new ComputeFunctionIntoPropertiesUseCase();
  }

  /**
   * Executes a WGSL function on feature properties and adds the result to properties.compute[outputColumnName]
   *
   * @param params - Parameters for the computation
   * @returns Promise<FeatureCollection> - New FeatureCollection with computed values
   */
  async computeFunctionIntoProperties(params: ComputeFunctionIntoPropertiesParams): Promise<FeatureCollection> {
    return this.computeFunctionIntoPropertiesUseCase.exec(params);
  }
}

export const geojsonCompute = new GeojsonCompute();
