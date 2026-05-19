/**
 * OSM tag value definitions used across Overpass queries and layer classification.
 *
 * Centralized here so both the Overpass query builder and the SQL layer filters
 * reference the same source of truth.
 */

export const PARKS_LEISURE_VALUES = ['dog_park', 'park', 'playground', 'recreation_ground'] as const;
export const PARKS_LANDUSE_VALUES = ['wood', 'grass', 'forest', 'orchard', 'village_green', 'vineyard', 'cemetery', 'meadow'] as const;
export const PARKS_NATURAL_VALUES = ['wood', 'grass', 'grassland', 'forest', 'scrub', 'heath', 'meadow'] as const;

export const WATER_NATURAL_VALUES = ['water', 'wetland', 'strait', 'spring'] as const;
export const WATER_FEATURE_VALUES = ['pond', 'reservoir', 'lagoon', 'stream_pool', 'lake', 'pool', 'canal', 'river'] as const;

export const EXCLUDED_HIGHWAY_VALUES = ['cycleway', 'elevator', 'footway', 'steps', 'pedestrian', 'proposed', 'construction', 'abandoned', 'platform', 'raceway'] as const;
export const EXCLUDED_BUILDING_VALUES = ['shed', 'garage', 'garages', 'carport', 'hut', 'kiosk', 'toilets', 'service', 'transformer_tower', 'sty', 'container'] as const;
