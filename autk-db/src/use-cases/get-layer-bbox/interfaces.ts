/**
 * Parameters for computing the bounding box of a layer table.
 */
export interface GetLayerBboxParams {
  /** Name of the layer table to inspect. */
  layerTableName: string;
  /** Optional workspace (schema) name. Defaults to `autk`. */
  workspace?: string;
}
