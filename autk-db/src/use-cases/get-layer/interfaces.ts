/**
 * Options for exporting a layer as GeoJSON.
 */
export interface GetLayerOptions {
  /**
   * Exports one feature per OSM way or relation of a layer that `loadOsm` built,
   * with `osm_type` (`'way'` or `'relation'`) and `osm_id` added to its properties.
   * Buildings are not merged: each element keeps its own geometry and tags, and
   * carries the `building_id` of the building it belongs to. A table that holds no
   * OSM elements, such as the surface, exports as it does without the option.
   */
  osmElements?: boolean;
}
