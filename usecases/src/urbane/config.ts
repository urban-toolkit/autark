export type UrbaneLevel = 'neighborhoods' | 'active_buildings';
export const DATASETS = ['arrest', 'new_building', 'noise', 'restaurants', 'school', 'subway', 'tree'];
export const DEFAULT_WEIGHTS = [0.3, 0.2, 0.0, 0.5, 0.0, 0.0, 0.0];
export const DEFAULT_DISTANCE = 300;

// Exact boundary=administrative names in the completed local PBF.
export const MANHATTAN_AREA = { geocodeArea: 'New York', areas: ['Manhattan'] };
export const MANHATTAN_PBF = 'mnt-administrative-geocode-coastlines.osm.pbf';
