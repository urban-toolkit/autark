/**
 * Retrieves the bounding box of a layer table by inspecting its geometry column.
 *
 * The use case queries min/max coordinates for the layer and returns a named bounding box.
 *
 * @module get-layer-bbox
 */
export { GetLayerBboxUseCase } from './use-case';
export type { GetLayerBboxParams } from './interfaces';
