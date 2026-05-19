import { OsmElement } from '../../use-cases/load-osm-overpass/interfaces';

/**
 * Represents the raw response from an Overpass API query.
 */
export interface OverpassApiResponse {
  /** List of OSM elements returned by the query. */
  elements: OsmElement[];
}

/**
 * A flattened and normalized representation of an OSM element for database insertion.
 */
export type FormattedElement = {
  /** The kind of OSM element: 'node', 'way', or 'relation'. */
  kind: 'node' | 'way' | 'relation';
  /** Unique OSM identifier. */
  id: number;
  /** Key-value pairs of tags associated with the element. */
  tags: Array<{ k: string; v: string }>;
  /** List of referenced element IDs. */
  refs: number[];
  /** Latitude of the node, if applicable. */
  lat: number | null;
  /** Longitude of the node, if applicable. */
  lon: number | null;
  /** Roles assigned to references (for relations). */
  ref_roles: string[];
  /** Types of referenced elements (for relations). */
  ref_types: string[];
};
