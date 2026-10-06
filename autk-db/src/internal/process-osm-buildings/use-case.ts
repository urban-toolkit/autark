import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { Geometry } from 'geojson';
import { computeIntersectingClusterIds } from '@urban-toolkit/autk-core';
import { Column } from '../../interfaces';
import { DEFAULT_WORKSPACE_NAME, OSM_ELEMENT_METADATA_COLUMN } from '../../consts';
import { getColumnsFromDuckDbTableDescribe } from '../../utils';
import { ProcessOsmBuildingsParams } from './interfaces';
import { SELECT_BUILDING_GEOMETRY_QUERY, SELECT_ORPHAN_OUTLINE_OWNERS_QUERY, COLLECT_BUILDING_PARTS_QUERY } from './queries';

/**
 * Collects original OSM building parts into one stored feature per building.
 * Explicit building relations own their member ways, including disconnected parts.
 * Orphan building:part ways covered by one relation outline inherit its ownership.
 * Remaining unassociated ways retain intersection-based grouping; shapes are never unioned.
 * Building IDs are minimum internal part keys, normally the minimum source ID, not transient cluster indices.
 * Geometry relations colliding with ways use negative internal keys; provenance retains their actual OSM IDs.
 */
export class ProcessOsmBuildingsUseCase {
  constructor(
    private db: AsyncDuckDB,
    private conn: AsyncDuckDBConnection,
  ) {}

  /**
   * Builds GeometryCollections with indexed part attributes, replacing the table atomically.
   * Explicit location=underground parts/relations are omitted from this surface layer before clustering.
   * Logs and omits unusable geometry; a relation with any unusable member is omitted as a whole.
   * Invalid membership and conflicting ownership also omit the affected relations
   * rather than aborting the import or guessing identity.
   * @throws If IDs are duplicated or database/collection construction fails.
   */
  async exec(params: ProcessOsmBuildingsParams): Promise<Column[]> {
    const { tableName, workspace = DEFAULT_WORKSPACE_NAME } = params;
    const qualifiedTableName = `${workspace}.${tableName}`;
    const inputColumns = getColumnsFromDuckDbTableDescribe((await this.conn.query(`DESCRIBE ${qualifiedTableName}`)).toArray());
    const hasOsmMetadata = inputColumns.some(column => column.name === OSM_ELEMENT_METADATA_COLUMN);
    const rows = (await this.conn.query(SELECT_BUILDING_GEOMETRY_QUERY(qualifiedTableName, hasOsmMetadata))).toArray();
    const typesById = new Map(rows.map(row => [String(row.id), row.osm_type]));
    if (new Set(rows.map(row => String(row.id))).size !== rows.length) {
      throw new Error('OSM building part IDs must be unique');
    }
    const items: Array<{ id: string; geometry: Geometry; properties: Record<string, unknown> }> = [];
    const undergroundPartIds = new Set<string>();
    for (const row of rows) {
      const properties = row.properties_json == null ? {} : JSON.parse(row.properties_json);
      if (properties.location === 'underground') {
        if (row.osm_type === 'way') undergroundPartIds.add(String(row.id));
        console.warn(`[autk-db] Skipping OSM building part ${String(row.id)} in ${qualifiedTableName}: location=underground is excluded from the surface building layer.`);
        continue;
      }
      const geometry = row.geometry_json == null ? null : JSON.parse(row.geometry_json) as Geometry;
      const reason = geometry == null ? 'missing geometry' : !row.valid_geometry ? 'invalid geometry'
        : row.empty_geometry ? 'empty geometry'
          : geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon' ? 'non-polygonal geometry' : null;
      if (reason) {
        console.warn(`[autk-db] Skipping OSM building part ${String(row.id)} in ${qualifiedTableName}: ${reason}; coordinates were not repaired.`);
        continue;
      }
      items.push({ id: String(row.id), geometry: geometry!, properties });
    }

    const itemsById = new Map(items.map(item => [item.id, item]));
    const ownership = new Map<string, string>();
    const relationProperties = new Map<string, Record<string, unknown>>();
    const skippedRelations = new Set<string>();
    for (const relation of params.relations ?? []) {
      if (relationProperties.has(relation.id)) throw new Error(`Duplicate OSM building relation ${relation.id}`);
      const skipReason = relation.skipReason ?? (relation.members.length === 0 ? 'no way members' : undefined);
      if (skipReason) {
        skippedRelations.add(relation.id);
        console.warn(`[autk-db] Skipping OSM building relation ${relation.id} in ${qualifiedTableName}: ${skipReason}; all direct member ways omitted to avoid a partial building.`);
      }
      if (relation.properties.location === 'underground') {
        skippedRelations.add(relation.id);
        console.warn(`[autk-db] Skipping OSM building relation ${relation.id} in ${qualifiedTableName}: location=underground is excluded from the surface building layer.`);
      }
      const unusableMembers = relation.members.filter(member => (!itemsById.has(member.id) || typesById.get(member.id) !== 'way')
        && !undergroundPartIds.has(member.id));
      if (unusableMembers.length > 0) {
        skippedRelations.add(relation.id);
        console.warn(`[autk-db] Skipping OSM building relation ${relation.id} in ${qualifiedTableName}: missing or unusable geometry for ways ${unusableMembers.map(member => member.id).join(', ')}; all member ways omitted to avoid a partial building.`);
      }
      for (const member of relation.members) {
        if (typesById.get(member.id) === 'relation') continue; // A relation cannot satisfy an absent way with the same ID.
        const owner = ownership.get(member.id);
        if (owner && owner !== relation.id) {
          skippedRelations.add(owner);
          skippedRelations.add(relation.id);
          console.warn(`[autk-db] Skipping OSM building relations ${owner}, ${relation.id} in ${qualifiedTableName}: way ${member.id} has conflicting ownership; all member ways omitted.`);
        } else {
          ownership.set(member.id, relation.id);
        }
      }
      relationProperties.set(relation.id, {
        ...relation.properties,
        osmRelation: { id: relation.id, members: relation.members, properties: relation.properties },
      });
    }

    const retainedItems = items.filter(item => !skippedRelations.has(ownership.get(item.id)!));
    // Only explicit outlines (or untyped/outer members tagged as whole buildings) define containment.
    // Never use ordinary member parts, invalid/skipped relations or inferred parts as new outlines.
    const outlines = (params.relations ?? []).filter(relation => !skippedRelations.has(relation.id))
      .flatMap(relation => relation.members.filter(member => {
        const item = itemsById.get(member.id);
        if (!item || typesById.get(item.id) !== 'way') return false;
        const tags = item.properties;
        return member.role === 'outline' || ((member.role === '' || member.role === 'outer')
          && !!tags.building && tags.building !== 'no' && (!tags['building:part'] || tags['building:part'] === 'no'));
      }).map(member => ({ id: member.id, relationId: relation.id })));
    const orphanIds = retainedItems.filter(item => !ownership.has(item.id)
      && !!item.properties['building:part'] && item.properties['building:part'] !== 'no').map(item => item.id);
    if (outlines.length > 0 && orphanIds.length > 0) {
      const candidates = (await this.conn.query(SELECT_ORPHAN_OUTLINE_OWNERS_QUERY(qualifiedTableName, outlines, orphanIds))).toArray();
      const ownersByPart = new Map<string, Set<string>>();
      for (const candidate of candidates) {
        if (!ownersByPart.has(candidate.id)) ownersByPart.set(candidate.id, new Set());
        ownersByPart.get(candidate.id)!.add(candidate.relation_id);
      }
      const inferredByRelation = new Map<string, string[]>();
      for (const [id, owners] of ownersByPart) {
        if (owners.size !== 1) {
          console.warn(`[autk-db] OSM building part ${id} in ${qualifiedTableName} has ambiguous outline containment in relations ${[...owners].join(', ')}; ownership was not inferred.`);
          continue;
        }
        const owner = [...owners][0];
        ownership.set(id, owner);
        if (!inferredByRelation.has(owner)) inferredByRelation.set(owner, []);
        inferredByRelation.get(owner)!.push(id);
      }
      for (const [owner, ids] of inferredByRelation) {
        const properties = relationProperties.get(owner)!;
        properties.osmRelation = { ...(properties.osmRelation as Record<string, unknown>),
          inferredParts: ids.map(id => ({ id, method: 'outline-containment' })) };
      }
    }
    const clusters = computeIntersectingClusterIds(retainedItems.filter(item => !ownership.has(item.id)));
    // Selection is ordered by internal part key, so the first member is the stable minimum key.
    const buildingIds = new Map<string, string>();
    const mapping = retainedItems.map(item => {
      const owner = ownership.get(item.id);
      const group = owner ? `relation:${owner}` : `cluster:${clusters.get(item.id)!}`;
      if (!buildingIds.has(group)) buildingIds.set(group, item.id);
      return {
        id: item.id, building_id: buildingIds.get(group)!,
        building_properties: owner ? relationProperties.get(owner)! : {},
      };
    });
    const fileName = `building_parts_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    await this.db.registerFileText(fileName, JSON.stringify(mapping));
    try {
      await this.conn.query('BEGIN TRANSACTION');
      try {
        await this.conn.query(COLLECT_BUILDING_PARTS_QUERY(qualifiedTableName, fileName, hasOsmMetadata));
        await this.conn.query('COMMIT');
      } catch (error) {
        await this.conn.query('ROLLBACK');
        throw error;
      }
    } finally {
      await this.db.dropFile(fileName);
    }
    return getColumnsFromDuckDbTableDescribe((await this.conn.query(`DESCRIBE ${qualifiedTableName}`)).toArray());
  }
}
