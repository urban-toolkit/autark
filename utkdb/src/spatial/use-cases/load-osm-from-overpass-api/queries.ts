import { FormattedOsmNode, FormattedOsmWay, FormattedOsmRelation } from './interfaces';

// Create empty table
export const CREATE_EMPTY_OSM_TABLE_QUERY = (tableName: string) => {
  return `
    CREATE TABLE ${tableName} (
      kind ENUM('node', 'way', 'relation'),
      id BIGINT,
      tags MAP(VARCHAR, VARCHAR),
      refs BIGINT[],
      lat DOUBLE,
      lon DOUBLE,
      ref_roles VARCHAR[],
      ref_types VARCHAR[]
    );
  `;
};

// Insert batch of OSM elements into existing table
export const INSERT_OSM_BATCH_QUERY = (
  tableName: string,
  formattedData: {
    nodes: FormattedOsmNode[];
    ways: FormattedOsmWay[];
    relations: FormattedOsmRelation[];
  },
) => {
  const queries: string[] = [];

  // Helper function to escape SQL string values
  const escapeString = (str: string): string => str.replace(/'/g, "''");

  // Helper function to format tags as MAP
  const formatTags = (tags: Record<string, string> | null): string => {
    if (!tags || Object.keys(tags).length === 0) return 'NULL';
    const keys = Object.keys(tags)
      .map((key) => `'${escapeString(key)}'`)
      .join(',');
    const values = Object.values(tags)
      .map((value) => `'${escapeString(value)}'`)
      .join(',');
    return `MAP([${keys}], [${values}])`;
  };

  // Insert nodes
  if (formattedData.nodes.length > 0) {
    const nodeValues = formattedData.nodes
      .map((node) => {
        const tags = formatTags(node.tags);
        return `('node', ${node.id}, ${tags}, NULL, ${node.lat}, ${node.lon}, NULL, NULL)`;
      })
      .join(',\n    ');

    queries.push(`
    INSERT INTO ${tableName} (kind, id, tags, refs, lat, lon, ref_roles, ref_types)
    VALUES 
    ${nodeValues};`);
  }

  // Insert ways
  if (formattedData.ways.length > 0) {
    const wayValues = formattedData.ways
      .map((way) => {
        const tags = formatTags(way.tags);
        const refs = way.refs.length > 0 ? `[${way.refs.join(',')}]` : 'NULL';
        return `('way', ${way.id}, ${tags}, ${refs}, NULL, NULL, NULL, NULL)`;
      })
      .join(',\n    ');

    queries.push(`
    INSERT INTO ${tableName} (kind, id, tags, refs, lat, lon, ref_roles, ref_types)
    VALUES 
    ${wayValues};`);
  }

  // Insert relations
  if (formattedData.relations.length > 0) {
    const relationValues = formattedData.relations
      .map((relation) => {
        const tags = formatTags(relation.tags);
        const refs = relation.refs.length > 0 ? `[${relation.refs.join(',')}]` : 'NULL';
        const refRoles =
          relation.ref_roles.length > 0 ? `['${relation.ref_roles.map(escapeString).join("','")}']` : 'NULL';
        const refTypes = relation.ref_types.length > 0 ? `['${relation.ref_types.join("','")}']` : 'NULL';
        return `('relation', ${relation.id}, ${tags}, ${refs}, NULL, NULL, ${refRoles}, ${refTypes})`;
      })
      .join(',\n    ');

    queries.push(`
    INSERT INTO ${tableName} (kind, id, tags, refs, lat, lon, ref_roles, ref_types)
    VALUES 
    ${relationValues};`);
  }

  return queries.join('\n\n');
};
