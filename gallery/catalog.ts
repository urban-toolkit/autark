export type ModuleId = 'autk-map' | 'autk-db' | 'autk-compute' | 'autk-plot';
export type SectionId = 'loading' | 'features' | 'imagery' | 'plots' | 'analytics';

export interface GalleryExample {
    id: string;
    section: SectionId;
    title: string;
    description: string;
    path: string;
    modules: ModuleId[];
    tryIt: string;
    sources?: string[];
}

export const modules: Record<ModuleId, { label: string; color: string }> = {
    'autk-map': { label: 'autk-map', color: '#0ea5e9' },
    'autk-db': { label: 'autk-db', color: '#f59e0b' },
    'autk-compute': { label: 'autk-compute', color: '#10b981' },
    'autk-plot': { label: 'autk-plot', color: '#8b5cf6' },
};

export const sections: { id: SectionId; title: string; description: string }[] = [
    { id: 'loading', title: 'Data loading', description: 'Bring data into the browser and choose its coordinate system.' },
    { id: 'features', title: 'Basic map features', description: 'Select and hide features, navigate the camera, and style layers with colors, presets, and opacity.' },
    { id: 'imagery', title: 'Imagery and terrain', description: 'Use imagery basemaps, rasters, and elevation to build a scene.' },
    { id: 'plots', title: 'Plots', description: 'Explore data through charts coordinated with a map.' },
    { id: 'analytics', title: 'Analytics', description: 'Join datasets, aggregate observations, and calculate urban measures.' },
];

/** Warn about external data services, not toolkit initialization or bundled/local datasets. */
export function externalServices(example: GalleryExample): string[] {
    const services: string[] = [];
    if (example.id === 'D05') services.push('Overpass API', 'geocoding for named-place queries');
    if (['B01', 'B02', 'T02', 'T03'].includes(example.id)) services.push('imagery tile providers');
    if (['T01', 'T02', 'T03'].includes(example.id)) services.push('Mapzen elevation tiles on AWS');
    return services;
}

export const examples: GalleryExample[] = [
    { id: 'D01', section: 'loading', title: 'Load map layers from a file', description: 'Fetch a prepared GeoJSON collection and add its points, lines, or polygons straight to the map.', path: 'src/autk-map/standalone-geojson-vis.html', modules: ['autk-map'], tryIt: 'Switch between polygons, boundaries, and centers to see each layer and how it is loaded.' },
    { id: 'D02', section: 'loading', title: 'Load layers in mixed CRSs', description: 'Data arrives in longitude/latitude; the map projects it into the workspace CRS you choose.', path: 'src/autk-map/standalone-geographic-geojson-vis.html', modules: ['autk-map'], tryIt: 'Switch the projected CRS and compare the same features and center coordinates.' },
    { id: 'D03', section: 'loading', title: 'Import data into database workspaces', description: 'Each city lands in its own AutkDb workspace so tables never mix.', path: 'src/autk-map/geojson-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Switch workspaces and come back: each workspace keeps its own table, so the collection is not imported twice.' },
    { id: 'D04', section: 'loading', title: 'Load layers from different file formats', description: 'Import CSV and JSON as points, lines, and polygons using coordinates or WKT.', path: 'src/autk-map/csv-wkt-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Use the map menu to switch thematic coloring between Tube line names and entrance wheelchair accessibility.' },
    { id: 'B03', section: 'loading', title: 'Load raster layers', description: 'Compare a population heatmap and a CORINE land-cover raster for the same area in Lisbon.', path: 'src/autk-map/geotiff-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Switch between the heatmap and the land-cover map, and try adjusting the raster opacity.' },
    { id: 'D05', section: 'loading', title: 'Access OpenStreetMap through Overpass', description: 'Query a place or bounding box and filter OSM tags through the live API.', path: 'src/autk-map/osm-layers-api.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare a bounding box, named place, and custom tags around Sol, Madrid. Press Load to query the live service.', },
    { id: 'D06', section: 'loading', title: 'Access OpenStreetMap from a local extract', description: 'Query a place or bounding box and filter OSM tags from a bundled PBF instead of the live API.', path: 'src/autk-map/osm-layers-pbf.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare bounding-box, whole-Monaco named-place, and custom-tag queries. No Overpass request is needed.' },
    { id: 'I01', section: 'features', title: 'Select features', description: 'Click buildings to grow a selection and track heights, floors, and measured coverage.', path: 'src/autk-map/building-picking.html', modules: ['autk-map', 'autk-db'], tryIt: 'Click several buildings, watch the counts and height statistics update, then clear the selection.' },
    { id: 'I02', section: 'features', title: 'Hide and restore features', description: 'Hide selected features and restore them without reloading data.', path: 'src/autk-map/building-hiding.html', modules: ['autk-map', 'autk-db'], tryIt: 'Select buildings, hide them, and restore the hidden features.' },
    { id: 'I03', section: 'features', title: 'Navigate and animate the camera', description: 'Animate a street-level camera path, then rotate, ascend, and tilt into an overview.', path: 'src/autk-map/camera-animation-vis.html', modules: ['autk-map', 'autk-db'], tryIt: 'Watch the street-level drive, then replay it from the map controls.' },
    { id: 'S01', section: 'features', title: 'Color features by category and value', description: 'Assign colors by category or map area values to white–blue and red–blue scales.', path: 'src/autk-map/colormap-values.html', modules: ['autk-map', 'autk-db'], tryIt: 'Switch between Berlin boroughs, white–blue area, and red–blue area.' },
    { id: 'S03', section: 'features', title: 'Apply map style presets', description: 'Compare Google, Apple, OSM, Light, and Dark presets over Venice.', path: 'src/autk-map/map-styles.html', modules: ['autk-map', 'autk-db'], tryIt: 'Switch between the five built-in style presets.' },
    { id: 'S04', section: 'features', title: 'Adjust layer render properties', description: 'Change how individual map layers look without reloading their data.', path: 'src/autk-map/layer-opacity.html', modules: ['autk-map', 'autk-db'], tryIt: 'Try both sliders, then toggle Show district borders to compare the polygons with and without outlines.' },
    { id: 'B01', section: 'imagery', title: 'Imagery', description: 'Choose an imagery provider and explore a map without vector data.', path: 'src/autk-map/tiles-basemap.html', modules: ['autk-map'], tryIt: 'Switch providers, tilt the camera, and toggle imagery visibility.', sources: ['src/autk-map/tiles-example.ts'] },
    { id: 'B02', section: 'imagery', title: 'Imagery + vectors', description: 'Place a local PBF city over an imagery basemap.', path: 'src/autk-map/osm-layers-pbf-imagery.html', modules: ['autk-map', 'autk-db'], tryIt: 'Use the layer menu to compare vector features with the imagery beneath them.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'T02', section: 'imagery', title: 'Imagery + terrain', description: 'Combine imagery and streamed elevation without vector prerequisites.', path: 'src/autk-map/terrain-tiles.html', modules: ['autk-map'], tryIt: 'Compare the overview and tilted views, then change the imagery provider.', sources: ['src/autk-map/terrain-example.ts', 'src/autk-map/tiles-example.ts'] },
    { id: 'T03', section: 'imagery', title: 'Imagery + vectors + terrain', description: 'Bring elevation, imagery, and a local vector city into one scene.', path: 'src/autk-map/osm-layers-pbf-imagery-terrain.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the city and use the layer menu to compare its components.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'T01', section: 'imagery', title: 'Vectors + terrain (stream)', description: 'Give a local vector city relief using streamed elevation tiles.', path: 'src/autk-map/osm-layers-pbf-terrain.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the view to see vector layers follow the terrain.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'T04', section: 'imagery', title: 'Vectors + terrain (local)', description: 'Use a bundled elevation raster with finite geographic coverage.', path: 'src/autk-map/terrain-layers-niteroi.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the local terrain and explore the limits of the elevation coverage.' },
    { id: 'P01', section: 'plots', title: 'Compare categories with a bar chart', description: 'Coordinate bar selection with features on a map.', path: 'src/autk-plot/barchart-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a bar to locate its features, or click to keep them selected.' },
    { id: 'P02', section: 'plots', title: 'Explore relationships with a scatterplot', description: 'Select and brush points while keeping the map in sync.', path: 'src/autk-plot/scatterplot-brush.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a point to locate it on the map, or brush to select a group.' },
    { id: 'P03', section: 'plots', title: 'Explore distributions with a histogram', description: 'Brush a distribution and update its source data.', path: 'src/autk-plot/histogram-brush.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a bin to locate its features, or brush across several bins.' },
    { id: 'P04', section: 'plots', title: 'Compare two dimensions with a heat matrix', description: 'Explore matrix cells and their geographic counterparts.', path: 'src/autk-plot/heatmatrix-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a matrix cell to preview its features, or click to select them.' },
    { id: 'P05', section: 'plots', title: 'Inspect records in a linked table', description: 'Connect record-level selection with a map.', path: 'src/autk-plot/table-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a row to locate it on the map, or click to keep it selected.' },
    { id: 'P06', section: 'plots', title: 'Explore multiple attributes with parallel coordinates', description: 'Compare several attributes in a linked multidimensional view.', path: 'src/autk-plot/parallel-coordinates.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Hover over a line to locate it on the map, or brush an axis to select a range.' },
    { id: 'P07', section: 'plots', title: 'Explore Manhattan noise reports over time', description: 'Compare daily noise reports by neighborhood or nearby road.', path: 'src/autk-plot/temporal-events-click.html', modules: ['autk-plot', 'autk-map', 'autk-db'], tryIt: 'Hover over a day to locate matches on the map, or brush a date range to select them.' },
    { id: 'A01', section: 'analytics', title: 'Join points to areas', description: 'Aggregate observations within polygon boundaries.', path: 'src/autk-map/spatial-join.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare the area colors and legend to understand the point counts.' },
    { id: 'A02', section: 'analytics', title: 'Chain spatial joins', description: 'Combine several spatial aggregations in one dataset.', path: 'src/autk-map/spatial-join-multi.html', modules: ['autk-db', 'autk-map'], tryIt: 'Inspect the joined attributes and compare their spatial patterns.' },
    { id: 'A03', section: 'analytics', title: 'Find nearby features', description: 'Aggregate observations near roads or buildings from a local PBF.', path: 'src/autk-map/spatial-join-near.html', modules: ['autk-db', 'autk-map'], tryIt: 'Change the target layer and compare distance-based aggregation.' },
    { id: 'A04', section: 'analytics', title: 'Build a density heatmap', description: 'Aggregate observations into a spatial grid.', path: 'src/autk-map/heatmap-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Change grid resolution and toggle the polygon reference layer.' },
    { id: 'A05', section: 'analytics', title: 'Calculate feature attributes on the GPU', description: 'Run custom WGSL calculations on polygons or local OSM roads.', path: 'src/autk-map/compute-function.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Compare polygon compactness with geometry-based road lengths.' },
    { id: 'A06', section: 'analytics', title: 'Measure sky exposure', description: 'Estimate exposure to the sky in a local city scene.', path: 'src/autk-map/compute-render-osm-sky-exposure.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Inspect the result colors and compare open and enclosed locations.' },
    { id: 'A07', section: 'analytics', title: 'Calculate a view score', description: 'Evaluate a view-scoring rule against a local city scene.', path: 'src/autk-map/compute-render-osm-view-score.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Compare locations with different view scores using the legend.' },
    { id: 'A08', section: 'analytics', title: 'Analyze visibility', description: 'Explore observer and target visibility in a local city scene.', path: 'src/autk-map/compute-render-osm-visibility.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Select an observer or target and inspect the visibility result.' },
];
