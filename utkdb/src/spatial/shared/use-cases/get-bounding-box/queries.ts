import { LayerType } from '../../../use-cases/load-layer/interfaces';

type Params = {
  tableName: string;
  coordinateFormat?: string;
  layers: LayerType[];
};

export const GET_BOUNDING_BOX_QUERY = ({ tableName, coordinateFormat = 'EPSG:4326', layers = [] }: Params) => {
  const layerFilters = layers
    .map((layer) => {
      switch (layer) {
        case 'parks':
          return `(map_extract(tags, 'leisure')[1] IN ('dog_park', 'park', 'playground', 'recreation_ground') OR
                map_extract(tags, 'landuse')[1] IN ('wood', 'grass', 'forest', 'orchad', 'village_green', 'vineyard', 'cemetery', 'meadow', 'village_green') OR
                map_extract(tags, 'natural')[1] IN ('wood', 'grass'))`;
        case 'water':
          return `(map_extract(tags, 'natural')[1] IN ('water', 'wetland', 'bay', 'strait', 'spring') OR
                map_extract(tags, 'water')[1] IN ('pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river'))`;
        case 'buildings':
          return `(map_extract(tags, 'building')[1] IS NOT NULL OR
                map_extract(tags, 'building:part')[1] IS NOT NULL OR
                map_extract(tags, 'type')[1] IN ('building'))`;
        // case 'coastline':
        //   return `(map_extract(tags, 'natural')[1] IN ('coastline'))`;
        // case 'roads':
        //   return `(map_extract(tags, 'highway')[1] IS NOT NULL AND
        //         map_extract(tags, 'area')[1] IS DISTINCT FROM 'yes' AND
        //         map_extract(tags, 'highway')[1] NOT IN ('cycleway', 'footway', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway'))`;
        default:
          return '';
      }
    })
    .filter(Boolean);

  const layerFilter = layerFilters.length > 0 ? `AND (${layerFilters.join(' OR ')})` : '';

  return `
    WITH filtered_ways AS (
      SELECT id, UNNEST(refs) as ref
      FROM ${tableName}
      WHERE kind IN ('way', 'rel')
      ${layerFilter}
    ),
    node_bounds AS (
      SELECT 
        MIN(lon) as min_lon,
        MIN(lat) as min_lat,
        MAX(lon) as max_lon,
        MAX(lat) as max_lat
      FROM ${tableName} nodes
      WHERE kind = 'node'
      AND EXISTS (
        SELECT 1 
        FROM filtered_ways 
        WHERE filtered_ways.ref = nodes.id
      )
    ),
    transformed_bounds AS (
      SELECT
        ST_Transform(ST_Point(min_lat, min_lon), 'EPSG:4326', '${coordinateFormat}') as min_point,
        ST_Transform(ST_Point(max_lat, max_lon), 'EPSG:4326', '${coordinateFormat}') as max_point
      FROM node_bounds
    )
    SELECT 
      CAST(ST_X(min_point) AS DOUBLE) as minLat,
      CAST(ST_Y(min_point) AS DOUBLE) as minLon,
      CAST(ST_X(max_point) AS DOUBLE) as maxLat,
      CAST(ST_Y(max_point) AS DOUBLE) as maxLon
    FROM transformed_bounds;
  `;
};
