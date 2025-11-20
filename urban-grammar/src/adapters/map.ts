import { MapSpec } from "../types";

/**
 * Interface for map styles.
 * @property {Promise<unknown>} resolveMap - Resolves map specification.
    * @param {unkown} context Grand grammar context for sharing data between adapters. 
    * @param {MapSpec} spec The type of the layer.
 */
export interface MapAdapter {
    resolveMap(context: unknown, spec: MapSpec): Promise<unknown>;
}