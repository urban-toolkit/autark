// TODO: 1. falta layer de ROADS

import { LayerType } from './interfaces';
import { BoundingBox } from '../../shared/use-cases/get-bounding-box/interfaces';

type Params = {
  tableName: string;
  layer: LayerType;
  outputFormat: string;
  outputTableName: string;
  boundingBox?: BoundingBox;
};

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
      SELECT id, ST_POINT(lat, lon) geometry
        FROM ${tableName} nodes
        SEMI JOIN ${layer}_with_nodes_refs
        ON nodes.id = ${layer}_with_nodes_refs.ref
        WHERE kind = 'node';

    CREATE TABLE ${outputTableName} AS
      SELECT
          ${layer}.id,
          ${layer}.tags properties,
          ${buildGeometrySelect({ outputFormat, boundingBox })} geometry
      FROM ${layer}
      JOIN ${layer}_with_nodes_refs
      ON ${layer}.id = ${layer}_with_nodes_refs.id
      JOIN ${layer}_required_nodes_with_geometries nodes
      ON ${layer}_with_nodes_refs.ref = nodes.id
      GROUP BY 1, 2
      ${buildHavingClause({ outputFormat, boundingBox })};

    DESCRIBE ${outputTableName};
  `;
};

function buildGeometrySelect({ outputFormat, boundingBox }: { outputFormat: string; boundingBox?: BoundingBox }) {
  const baseGeometry = `ST_Transform(
    ST_MakeLine(
      list(nodes.geometry ORDER BY ref_idx ASC)
    ),
    'EPSG:4326',
    '${outputFormat}'
  )`;

  if (!boundingBox) {
    return baseGeometry;
  }

  const boundingBoxGeometry = `ST_MakeEnvelope(${boundingBox.minLat}, ${boundingBox.minLon}, ${boundingBox.maxLat}, ${boundingBox.maxLon})`;

  return `ST_Intersection(${baseGeometry}, ${boundingBoxGeometry})`;
}

function buildHavingClause({ outputFormat, boundingBox }: { outputFormat: string; boundingBox?: BoundingBox }) {
  if (!boundingBox) {
    return '';
  }

  const baseGeometry = `ST_Transform(
    ST_MakeLine(
      list(nodes.geometry ORDER BY ref_idx ASC)
    ),
    'EPSG:4326',
    '${outputFormat}'
  )`;

  const boundingBoxGeometry = `ST_MakeEnvelope(${boundingBox.minLat}, ${boundingBox.minLon}, ${boundingBox.maxLat}, ${boundingBox.maxLon})`;

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
    SELECT id, tags FROM ${tableName}
      WHERE kind IN ('way', 'relation') AND
      (
        map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
        map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
        map_extract(tags, 'natural')[1] IN ('wood', 'grass')
      );
`;

const GET_WATER = (tableName: string) => `
  CREATE TEMP TABLE water AS
    SELECT id, tags FROM ${tableName}
      WHERE kind IN ('way', 'relation') AND
      (
        map_extract(tags, 'natural')[1] IN ('water', 'wetland', 'bay', 'strait', 'spring') OR
        map_extract(tags, 'water')[1] IN ('pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river')
      );
`;

const GET_BUILDINGS = (tableName: string) => `
   CREATE TEMP TABLE buildings AS
    SELECT id, tags FROM ${tableName}
      WHERE kind IN ('way') AND
      (
        map_extract(tags, 'building')[1] IS NOT NULL OR
        map_extract(tags, 'building:part')[1] IS NOT NULL OR
        map_extract(tags, 'type')[1] IN ('building')
      );
`;

const GET_COASTLINE = (tableName: string) => `
  CREATE TEMP TABLE coastline AS
    SELECT id, tags FROM ${tableName}
      WHERE kind IN ('way') AND
      (
        map_extract(tags, 'natural')[1] IN ('coastline')
      );
`;

const GET_ROADS = (tableName: string) => `
  CREATE TEMP TABLE roads AS
    SELECT id, tags FROM ${tableName}
      WHERE kind IN ('way') AND
      (
        map_extract(tags, 'highway')[1] IS NOT NULL AND
        map_extract(tags, 'area')[1] IS DISTINCT FROM 'yes' AND
        map_extract(tags, 'highway')[1] NOT IN ('cycleway', 'footway', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway')
      );
`;
