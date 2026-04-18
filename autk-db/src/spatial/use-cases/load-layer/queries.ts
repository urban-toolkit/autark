// TODO: 1. falta layer de ROADS

import { LayerType } from './interfaces';
import { BoundingBox } from '../../../shared/interfaces';

type Params = {
  tableName: string;
  layer: LayerType;
  outputFormat: string;
  outputTableName: string;
  boundingBox?: BoundingBox;
  workspace?: string;
};

/**
 * Creates geometries based on OSM way structure:
 * - Closed ways (first node = last node, >3 nodes): Polygon (for areas like buildings, parks, water)
 * - Open ways: LineString (for linear features like roads)
 */

export const LOAD_LAYER_QUERY = ({ tableName, layer, outputFormat, outputTableName, boundingBox, workspace = 'main' }: Params) => {
  const query = getLayerQuery(layer);
  
  const qualifiedInputTableName = `${workspace}.${tableName}`;
  const qualifiedOutputTableName = `${workspace}.${outputTableName}`;
  
  let actualTableName = qualifiedInputTableName;
  if (layer === 'surface') {
    // For surface layer, we need to reference the boundaries table
    const baseTableName = tableName.replace(new RegExp(`^${workspace}\\.`), '');
    actualTableName = `${workspace}.${baseTableName}_boundaries`;
  }

  return `
    ${query(actualTableName)}
    CREATE OR REPLACE TEMP TABLE ${layer}_with_nodes_refs AS
      SELECT id, UNNEST(refs) as ref, UNNEST(range(length(refs))) as ref_idx
        FROM ${actualTableName}
        SEMI JOIN ${layer} USING (id)
          WHERE kind IN ('way', 'relation');

    CREATE OR REPLACE TEMP TABLE ${layer}_required_nodes_with_geometries AS
      SELECT id, ST_POINT(lon, lat) geometry
        FROM ${actualTableName} nodes
        SEMI JOIN ${layer}_with_nodes_refs
        ON nodes.id = ${layer}_with_nodes_refs.ref
        WHERE kind = 'node';

    CREATE OR REPLACE TABLE ${qualifiedOutputTableName} AS
      SELECT
          ${layer}.id,
          ${layer}.tags properties,
          ${layer}.refs,
          ${buildGeometrySelect({ outputFormat, boundingBox, layer })} geometry
      FROM ${layer}
      JOIN ${layer}_with_nodes_refs
      ON ${layer}.id = ${layer}_with_nodes_refs.id
      JOIN ${layer}_required_nodes_with_geometries nodes
      ON ${layer}_with_nodes_refs.ref = nodes.id
      GROUP BY 1, 2, 3
      ${buildHavingClause({ outputFormat, boundingBox, layer })};

    DESCRIBE ${qualifiedOutputTableName};
  `;
};

function buildGeometrySelect({
  outputFormat,
  boundingBox,
  layer,
}: {
  outputFormat: string;
  boundingBox?: BoundingBox;
  layer: LayerType;
}) {
  // Define which layers should create polygons for closed ways
  const areaLayers = ['buildings', 'parks', 'water'];

  const baseGeometry = areaLayers.includes(layer)
    ? `
    CASE 
      WHEN refs[1] = refs[array_length(refs)] AND array_length(refs) > 3 THEN
        -- Closed way with more than 3 nodes: create polygon
        ST_Transform(
          ST_MakePolygon(
            ST_MakeLine(
              list(nodes.geometry ORDER BY ref_idx ASC)
            )
          ),
          'EPSG:4326',
          '${outputFormat}',
          always_xy := true
        )
      ELSE
        -- Open way: create linestring
        ST_Transform(
          ST_MakeLine(
            list(nodes.geometry ORDER BY ref_idx ASC)
          ),
          'EPSG:4326',
          '${outputFormat}',
          always_xy := true
        )
    END`
    : `
    -- Always create linestring for linear features
    ST_Transform(
      ST_MakeLine(
        list(nodes.geometry ORDER BY ref_idx ASC)
      ),
      'EPSG:4326',
      '${outputFormat}',
      always_xy := true
    )`;

  if (!boundingBox) return baseGeometry;

  const clippingGeometry = `ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})`;
  return `ST_Intersection(${baseGeometry}, ${clippingGeometry})`;
}

function buildHavingClause({
  outputFormat,
  boundingBox,
  layer,
}: {
  outputFormat: string;
  boundingBox?: BoundingBox;
  layer: LayerType;
}) {
  if (!boundingBox) return '';

  // Define which layers should create polygons for closed ways
  const areaLayers = ['buildings', 'parks', 'water'];

  const baseGeometry = areaLayers.includes(layer)
    ? `
    CASE 
      WHEN refs[1] = refs[array_length(refs)] AND array_length(refs) > 3 THEN
        -- Closed way with more than 3 nodes: create polygon
        ST_Transform(
          ST_MakePolygon(
            ST_MakeLine(
              list(nodes.geometry ORDER BY ref_idx ASC)
            )
          ),
          'EPSG:4326',
          '${outputFormat}',
          always_xy := true
        )
      ELSE
        -- Open way: create linestring
        ST_Transform(
          ST_MakeLine(
            list(nodes.geometry ORDER BY ref_idx ASC)
          ),
          'EPSG:4326',
          '${outputFormat}',
          always_xy := true
        )
    END`
    : `
    -- Always create linestring for linear features
    ST_Transform(
      ST_MakeLine(
        list(nodes.geometry ORDER BY ref_idx ASC)
      ),
      'EPSG:4326',
      '${outputFormat}',
      always_xy := true
    )`;

  const clippingGeometry = `ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})`;
  return `HAVING ST_Intersects(${baseGeometry}, ${clippingGeometry})`;
}

function getLayerQuery(layer: string): (t: string) => string {
  switch (layer) {
    case 'parks':
      return GET_PARKS;
    case 'water':
      return GET_WATER;
    case 'buildings':
      return GET_BUILDINGS;
    case 'roads':
      return GET_ROADS;
    case 'surface':
      return GET_SURFACE;
    default:
      return () => '';
  }
}

const GET_PARKS = (tableName: string) => `
  CREATE OR REPLACE TEMP TABLE parks AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind = 'way' AND map_extract(tags, '__autk_layer')[1] = 'parks';
`;

const GET_WATER = (tableName: string) => `
  CREATE OR REPLACE TEMP TABLE water AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind = 'way' AND map_extract(tags, '__autk_layer')[1] = 'water';
`;

const GET_BUILDINGS = (tableName: string) => `
   CREATE OR REPLACE TEMP TABLE buildings AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind = 'way' AND map_extract(tags, '__autk_layer')[1] = 'buildings';
`;

const GET_ROADS = (tableName: string) => `
  CREATE OR REPLACE TEMP TABLE roads AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind = 'way' AND map_extract(tags, '__autk_layer')[1] = 'roads' AND array_length(refs) > 1;
`;

// Get all ways
const GET_SURFACE = (tableName: string) => `
  CREATE OR REPLACE TEMP TABLE surface AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind IN ('way');
`;
