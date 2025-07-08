// TODO: 1. falta layer de ROADS

import { LayerType } from './interfaces';
import { BoundingBox } from '../../../shared/interfaces';

type Params = {
  tableName: string;
  layer: LayerType;
  outputFormat: string;
  outputTableName: string;
  boundingBox?: BoundingBox;
};

/**
 * Creates geometries based on OSM way structure:
 * - Closed ways (first node = last node, >3 nodes): Polygon (for areas like buildings, parks, water)
 * - Open ways: LineString (for linear features like roads, coastlines)
 */

export const LOAD_LAYER_QUERY = ({ tableName, layer, outputFormat, outputTableName, boundingBox }: Params) => {
  const query = getLayerQuery(layer);

  return `
    ${query(tableName)}
    CREATE TEMP TABLE ${layer}_with_nodes_refs AS
      SELECT id, UNNEST(refs) as ref, UNNEST(range(length(refs))) as ref_idx
        FROM ${tableName}
        SEMI JOIN ${layer} USING (id)
          WHERE kind IN ('way', 'relation');

    CREATE TEMP TABLE ${layer}_required_nodes_with_geometries AS
      SELECT id, ST_POINT(lon, lat) geometry
        FROM ${tableName} nodes
        SEMI JOIN ${layer}_with_nodes_refs
        ON nodes.id = ${layer}_with_nodes_refs.ref
        WHERE kind = 'node';

    CREATE TABLE ${outputTableName} AS
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

    DESCRIBE ${outputTableName};
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
  const areaLayers = ['parks', 'water'];

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

  if (!boundingBox) {
    return baseGeometry;
  }

  const boundingBoxGeometry = `ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})`;

  return `ST_Intersection(${baseGeometry}, ${boundingBoxGeometry})`;
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
  if (!boundingBox) {
    return '';
  }

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

  const boundingBoxGeometry = `ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})`;

  return `HAVING ST_Intersects(${baseGeometry}, ${boundingBoxGeometry})`;
}

function getLayerQuery(layer: string): (t: string) => string {
  switch (layer) {
    case 'parks':
      return GET_PARKS;
    case 'water':
      return GET_WATER;
    case 'buildings':
      return GET_BUILDINGS;
    case 'coastline':
      return GET_COASTLINE;
    case 'roads':
      return GET_ROADS;
    default:
      return () => '';
  }
}

const GET_PARKS = (tableName: string) => `
  CREATE TEMP TABLE parks AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind IN ('way', 'relation') AND
      (
        map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
        map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
        map_extract(tags, 'natural')[1] IN ('wood', 'grass')
      );
`;

const GET_WATER = (tableName: string) => `
  CREATE TEMP TABLE water AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind IN ('way', 'relation') AND
      (
        map_extract(tags, 'natural')[1] IN ('water', 'wetland', 'bay', 'strait', 'spring') OR
        map_extract(tags, 'water')[1] IN ('pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river')
      );
`;

const GET_BUILDINGS = (tableName: string) => `
   CREATE TEMP TABLE buildings AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind IN ('way') AND
      (
        map_extract(tags, 'building')[1] IS NOT NULL OR
        map_extract(tags, 'building:part')[1] IS NOT NULL OR
        map_extract(tags, 'type')[1] IN ('building')
      );
`;

const GET_COASTLINE = (tableName: string) => `
  CREATE TEMP TABLE coastline AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind IN ('way') AND
      (
        map_extract(tags, 'natural')[1] IN ('coastline')
      );
`;

const GET_ROADS = (tableName: string) => `
  CREATE TEMP TABLE roads AS
    SELECT id, tags, refs FROM ${tableName}
      WHERE kind = 'way' AND
      -- ensure the way has at least two distinct nodes so ST_MakeLine can build a geometry
      array_length(refs) > 1 AND
      (
        map_extract(tags, 'highway')[1] IS NOT NULL AND
        map_extract(tags, 'area')[1] IS DISTINCT FROM 'yes' AND
        map_extract(tags, 'highway')[1] NOT IN (
          'cycleway', 'elevator', 'footway', 'steps', 'pedestrian',
          'proposed', 'construction', 'abandoned', 'platform', 'raceway'
        )
      );
`;
