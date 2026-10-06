/** Explicit building ownership; relations carry metadata, not a second geometry. */
export interface OsmBuildingRelation {
  id: string;
  members: Array<{ id: string; role: string }>;
  properties: Record<string, unknown>;
  /** Invalid source membership: omit the whole relation and its direct way members. */
  skipReason?: string;
}

/**
 * Parameters for the OSM building processing use case.
 */
export interface ProcessOsmBuildingsParams {
  /** Name of the OSM buildings table. */
  tableName: string;
  /** Optional workspace name. Defaults to `autk`. */
  workspace?: string;
  /** Authoritative way membership for type=building relations, including disconnected parts. */
  relations?: OsmBuildingRelation[];
}
