/** Options controlling layer export granularity without changing stored features. */
export interface GetLayerOptions {
  /** Export individual OSM elements with source tags/identity when preserved provenance is available. */
  osmElements?: boolean;
}
