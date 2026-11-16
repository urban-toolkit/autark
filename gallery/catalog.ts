export type ModuleId = 'autk-map' | 'autk-db' | 'autk-compute' | 'autk-plot';
export type SectionId = 'loading' | 'interaction' | 'colors' | 'imagery' | 'terrain' | 'plots' | 'analytics';

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
    { id: 'interaction', title: 'Interaction', description: 'Select features, control visibility, and navigate a scene.' },
    { id: 'colors', title: 'Styling and data-driven colors', description: 'Express categories and quantities through colors, styles, and layer appearance.' },
    { id: 'imagery', title: 'Imagery', description: 'Use imagery basemaps and geographic raster data.' },
    { id: 'terrain', title: 'Terrain', description: 'Add elevation to vectors, imagery, or both.' },
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
    { id: 'D03', section: 'loading', title: 'Import GeoJSON into a workspace', description: 'Load a file or an in-memory collection through AutkDb.', path: 'src/autk-map/geojson-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare file URL and in-memory import, then inspect the resulting layer.' },
    { id: 'D04', section: 'loading', title: 'Import CSV and JSON tables', description: 'Define geometry using coordinate columns or WKT.', path: 'src/autk-map/csv-wkt-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Switch the table format and geometry encoding; inspect the matching loading call.' },
    { id: 'D05', section: 'loading', title: 'Access OpenStreetMap through Overpass', description: 'Query a place or bounding box and filter OSM tags through the live API.', path: 'src/autk-map/osm-layers-api.html', modules: ['autk-db', 'autk-map'], tryIt: 'Choose a query and explicitly load it. This example requires Overpass and may use a geocoder.', },
    { id: 'D06', section: 'loading', title: 'Load a local OSM extract', description: 'Build a vector city from a bundled PBF, with optional spatial filtering.', path: 'src/autk-map/osm-layers-pbf.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare the full extract with a bounding-box filter. No Overpass request is needed.', sources: ['src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'D07', section: 'loading', title: 'Organize data in workspaces', description: 'Keep datasets isolated and switch between workspaces.', path: 'src/autk-map/osm-layers-api-workspaces.html', modules: ['autk-db', 'autk-map'], tryIt: 'Switch between the two workspaces and compare the loaded layers.' },
    { id: 'I01', section: 'interaction', title: 'Select and inspect features', description: 'Pick a feature to highlight it and inspect its attributes.', path: 'src/autk-map/building-picking.html', modules: ['autk-map', 'autk-db'], tryIt: 'Click a building and inspect its properties. Click another feature to change the selection.' },
    { id: 'I02', section: 'interaction', title: 'Hide and restore selected features', description: 'Control feature visibility without reloading the layer.', path: 'src/autk-map/building-hiding.html', modules: ['autk-map', 'autk-db'], tryIt: 'Select buildings, hide them, and restore the hidden features.' },
    { id: 'I03', section: 'interaction', title: 'Navigate and animate the camera', description: 'Choose a geographic view, fit data bounds, and animate the camera.', path: 'src/autk-map/camera-animation-vis.html', modules: ['autk-map'], tryIt: 'Use the view buttons, then play the camera animation.' },
    { id: 'S01', section: 'colors', title: 'Color features by category', description: 'Assign colors and legend order to string or numeric categories.', path: 'src/autk-map/colormap-categorical.html', modules: ['autk-map', 'autk-db'], tryIt: 'Switch between string and numeric categories and compare the legend order.' },
    { id: 'S02', section: 'colors', title: 'Color features by numeric values', description: 'Compare sequential and diverging color scales.', path: 'src/autk-map/colormap-diverging.html', modules: ['autk-map', 'autk-db'], tryIt: 'Change the scale type and compare how the values map to colors.' },
    { id: 'S03', section: 'colors', title: 'Apply and customize map styles', description: 'Compare built-in styles and customize a scene palette.', path: 'src/autk-map/map-styles.html', modules: ['autk-map'], tryIt: 'Choose a style preset or apply a custom palette.' },
    { id: 'S04', section: 'colors', title: 'Control opacity and polygon outlines', description: 'Adjust transparency and show or hide polygon borders.', path: 'src/autk-map/layer-opacity.html', modules: ['autk-map', 'autk-db'], tryIt: 'Move the opacity slider and toggle polygon outlines.' },
    { id: 'B01', section: 'imagery', title: 'Create an imagery basemap', description: 'Choose an imagery provider and explore a map without vector data.', path: 'src/autk-map/tiles-basemap.html', modules: ['autk-map'], tryIt: 'Switch providers, tilt the camera, and toggle imagery visibility.', sources: ['src/autk-map/tiles-example.ts'] },
    { id: 'B02', section: 'imagery', title: 'Combine imagery and vector layers', description: 'Place a local PBF city over an imagery basemap.', path: 'src/autk-map/osm-layers-pbf-imagery.html', modules: ['autk-map', 'autk-db'], tryIt: 'Use the layer menu to compare vector features with the imagery beneath them.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'B03', section: 'imagery', title: 'Display RGB and scalar rasters', description: 'Explore raster bands, RGB colors, no-data, and vector context.', path: 'src/autk-map/geotiff-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Switch raster modes and toggle the reference polygons.' },
    { id: 'T01', section: 'terrain', title: 'Add elevation to vector layers', description: 'Give a local vector city relief using streamed elevation tiles.', path: 'src/autk-map/osm-layers-pbf-terrain.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the view to see vector layers follow the terrain.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'T02', section: 'terrain', title: 'Drape imagery over terrain', description: 'Combine imagery and streamed elevation without vector prerequisites.', path: 'src/autk-map/terrain-tiles.html', modules: ['autk-map'], tryIt: 'Compare the overview and tilted views, then change the imagery provider.', sources: ['src/autk-map/terrain-example.ts', 'src/autk-map/tiles-example.ts'] },
    { id: 'T03', section: 'terrain', title: 'Combine terrain, imagery, and vectors', description: 'Bring elevation, imagery, and a local vector city into one scene.', path: 'src/autk-map/osm-layers-pbf-imagery-terrain.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the city and use the layer menu to compare its components.', sources: ['src/autk-map/osm-layers-pbf-basemap.ts', 'src/autk-map/osm-layers-pbf-example.ts'] },
    { id: 'T04', section: 'terrain', title: 'Load terrain from a local GeoTIFF', description: 'Use a bundled elevation raster with finite geographic coverage.', path: 'src/autk-map/terrain-layers-niteroi.html', modules: ['autk-map', 'autk-db'], tryIt: 'Tilt the local terrain and explore the limits of the elevation coverage.' },
    { id: 'P01', section: 'plots', title: 'Compare categories with a bar chart', description: 'Coordinate bar selection with features on a map.', path: 'src/autk-plot/barchart-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Select a bar or a map feature and compare the linked highlights.' },
    { id: 'P02', section: 'plots', title: 'Explore relationships with a scatterplot', description: 'Select and brush points while keeping the map in sync.', path: 'src/autk-plot/scatterplot-brush.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Brush a region or select a point, then reset the linked selection.' },
    { id: 'P03', section: 'plots', title: 'Explore distributions with a histogram', description: 'Brush a distribution and update its source data.', path: 'src/autk-plot/histogram-brush.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Brush a range, change the dataset, or update the data explicitly.' },
    { id: 'P04', section: 'plots', title: 'Compare two dimensions with a heat matrix', description: 'Explore matrix cells and their geographic counterparts.', path: 'src/autk-plot/heatmatrix-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Select a matrix cell and inspect the corresponding map features.' },
    { id: 'P05', section: 'plots', title: 'Inspect records in a linked table', description: 'Connect record-level selection with a map.', path: 'src/autk-plot/table-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Select a table row or a map feature and compare the linked selection.' },
    { id: 'P06', section: 'plots', title: 'Explore multiple attributes with parallel coordinates', description: 'Compare several attributes in a linked multidimensional view.', path: 'src/autk-plot/parallel-coordinates.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Select or brush the parallel-coordinate view and inspect the map.' },
    { id: 'P07', section: 'plots', title: 'Select events on a timeline', description: 'Connect discrete events with their spatial context.', path: 'src/autk-plot/temporal-events-click.html', modules: ['autk-plot', 'autk-map', 'autk-db'], tryIt: 'Select an event on the timeline and locate it on the map.' },
    { id: 'P08', section: 'plots', title: 'Explore a time series', description: 'Explore continuous temporal values with linked selection.', path: 'src/autk-plot/timeseries-click.html', modules: ['autk-plot', 'autk-map'], tryIt: 'Select values in the time series and compare the map highlights.' },
    { id: 'A01', section: 'analytics', title: 'Join points to areas', description: 'Aggregate observations within polygon boundaries.', path: 'src/autk-map/spatial-join.html', modules: ['autk-db', 'autk-map'], tryIt: 'Compare the area colors and legend to understand the point counts.' },
    { id: 'A02', section: 'analytics', title: 'Chain spatial joins', description: 'Combine several spatial aggregations in one dataset.', path: 'src/autk-map/spatial-join-multi.html', modules: ['autk-db', 'autk-map'], tryIt: 'Inspect the joined attributes and compare their spatial patterns.' },
    { id: 'A03', section: 'analytics', title: 'Find nearby features', description: 'Aggregate observations near roads or buildings from a local PBF.', path: 'src/autk-map/spatial-join-near.html', modules: ['autk-db', 'autk-map'], tryIt: 'Change the target layer and compare distance-based aggregation.' },
    { id: 'A04', section: 'analytics', title: 'Build a density heatmap', description: 'Aggregate observations into a spatial grid.', path: 'src/autk-map/heatmap-vis.html', modules: ['autk-db', 'autk-map'], tryIt: 'Change grid resolution and toggle the polygon reference layer.' },
    { id: 'A05', section: 'analytics', title: 'Calculate feature attributes on the GPU', description: 'Run custom WGSL calculations on polygons or local OSM roads.', path: 'src/autk-map/compute-function.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Compare polygon compactness with the road-attribute calculation.' },
    { id: 'A06', section: 'analytics', title: 'Measure sky exposure', description: 'Estimate exposure to the sky in a local city scene.', path: 'src/autk-map/compute-render-osm-sky-exposure.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Inspect the result colors and compare open and enclosed locations.' },
    { id: 'A07', section: 'analytics', title: 'Calculate a view score', description: 'Evaluate a view-scoring rule against a local city scene.', path: 'src/autk-map/compute-render-osm-view-score.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Compare locations with different view scores using the legend.' },
    { id: 'A08', section: 'analytics', title: 'Analyze visibility', description: 'Explore observer and target visibility in a local city scene.', path: 'src/autk-map/compute-render-osm-visibility.html', modules: ['autk-compute', 'autk-db', 'autk-map'], tryIt: 'Select an observer or target and inspect the visibility result.' },
];
