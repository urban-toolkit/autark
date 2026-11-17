/**
 * Minimal runnable programs shown under "View full source".
 * Each assumes an HTML page containing a <canvas> (and `#plotBody` for charts).
 */
export function exampleSource(id: string, state: Record<string, string>): string {
    const provider = state['source-select'] || 'osmLight';
    const variant = state.variant;
    switch (id) {
        case 'D01': return `import { AutkMap } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!, { showUi: false });
await map.init();

const layer = '${variant === 'lines' ? 'neighborhood-boundaries' : variant === 'points' ? 'neighborhood-centers' : 'neighborhoods'}';
const collection = await fetch('/data/${variant === 'lines' ? 'mnt_neigh_boundaries' : variant === 'points' ? 'mnt_neigh_centers' : 'mnt_neighs_proj'}.geojson')
  .then(response => response.json());

map.loadCollection(layer, { collection${variant === 'lines' ? ", type: 'polylines'" : variant === 'points' ? ", type: 'points'" : ''} });
${variant === 'lines' ? "map.updateRenderInfo(layer, { polylinesWidth: 120 });\n" : variant === 'points' ? "map.updateRenderInfo(layer, { pointSize: 160 });\n" : ''}map.fitBounds();
map.draw();`;
        case 'D02': return `import { AutkMap } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!, { crs: '${state.crs || 'EPSG:3395'}', showUi: false });
await map.init();
map.setView({ center: { latitude: 41.855, longitude: -87.665 }, zoom: 11 });

// The source collection is longitude/latitude; the map projects it into the workspace CRS.
const collection = await fetch('/data/chi-community-areas.geojson').then(response => response.json());
map.loadCollection('community-areas', { collection, sourceCrs: 'EPSG:4326' });
map.draw();`;
        case 'D03': {
            const { workspace, table, file, input } = D03_CITIES[state.workspace || 'paris'] ?? D03_CITIES.paris!;
            const load = input === 'url'
                ? `await db.loadGeojson({ geojsonFileUrl: '/data/${file}', outputTableName: '${table}' });`
                : `const collection = await fetch('/data/${file}').then(response => response.json());\nawait db.loadGeojson({ geojsonObject: collection, outputTableName: '${table}' });`;
            return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();

// One workspace per city; switching workspaces swaps the visible dataset.
await db.setWorkspace('${workspace}');
${load}

const map = new AutkMap(document.querySelector('canvas')!, { showUi: false });
await map.init();
map.loadCollection('${table}', { collection: await db.getLayer('${table}'), type: 'polygons' });
map.fitBounds();
map.draw();`;
        }
        case 'D04': return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

const db = new AutkDb();
await db.init();

// One workspace: the boroughs cover the whole area, so they are imported first and the
// later layers are clipped to the same ground.
await db.setWorkspace('london');
await db.loadCsv({
  csvFileUrl: '/data/london-boroughs.csv',
  outputTableName: 'boroughs',
  geometryColumns: { wktColumnName: 'wkt' },
});
await db.loadJson({
  jsonFileUrl: '/data/london-tube-lines.json',
  outputTableName: 'tube_lines',
  geometryColumns: { wktColumnName: 'wkt' },
});
await db.loadCsv({
  csvFileUrl: '/data/london-tube-entrances.csv',
  outputTableName: 'tube_entrances',
  geometryColumns: { latColumnName: 'lat', longColumnName: 'lon' },
});

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.loadCollection('boroughs', { collection: await db.getLayer('boroughs'), type: 'polygons' });
map.updateRenderInfo('boroughs', { opacity: 0.25, showBorders: true });

const tubeLines = await db.getLayer('tube_lines');
map.loadCollection('tube_lines', { collection: tubeLines, type: 'polylines' });
map.updateRenderInfo('tube_lines', { polylinesWidth: 900, isColorMap: true });
map.updateColorMap('tube_lines', { colorMap: { interpolator: ColorMapInterpolator.CAT_PAIRED } });
map.updateThematic('tube_lines', { collection: tubeLines, property: 'properties.name' });

const entrances = await db.getLayer('tube_entrances');
for (const feature of entrances.features) feature.properties!.wheelchair ||= 'unmapped';
map.loadCollection('tube_entrances', { collection: entrances, type: 'points' });
map.updateRenderInfo('tube_entrances', { pointSize: 450 });
map.updateColorMap('tube_entrances', { colorMap: {
  interpolator: ColorMapInterpolator.CAT_SET1,
  domainSpec: { type: ColorMapDomainStrategy.USER, params: ['no', 'limited', 'yes', 'unmapped'] },
} });
map.updateThematic('tube_entrances', { collection: entrances, property: 'properties.wheelchair' });
map.fitBounds();
map.draw();`;
        case 'D05': return `${DB_MAP}
await db.loadOsm({
  queryArea: ${variant === 'place' ? "{ geocodeArea: 'Comunidad de Madrid', areas: ['Sol'] }" : '{ bbox: [-3.7089, 40.4135, -3.6992, 40.4204] }'},${variant === 'tags' ? "\n  tagSets: [\n    { name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] },\n  ]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
${variant === 'tags' ? "map.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });\n" : ''}map.fitBounds();
map.draw();`;
        case 'D06': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/monaco-condamine.osm.pbf',
  queryArea: ${variant === 'place' ? "{ geocodeArea: 'Monaco', areas: ['La Condamine', 'Monaco-Ville'] }" : '{ bbox: [7.4158, 43.7293, 7.4322, 43.7378] }'},${variant === 'tags' ? "\n  tagSets: [\n    { name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] },\n  ]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, {
    collection: await db.getLayer(layer.name), type: layer.type,
    loadConfig: { buildingsZeroHeight: true },
  });
}
${variant === 'tags' ? "map.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });\n" : ''}map.fitBounds();
map.draw();`;
        case 'I04': return `${DB_MAP}
await db.setWorkspace('battery_park_city');
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.707, -74.012, 40.719] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

// A different workspace keeps its own tables.
await db.setWorkspace('financial_district');
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.fitBounds();
map.draw();`;
        case 'I01': return `${DB_MAP.replace("import { AutkMap }", "import { MapEvent, AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'buildings'] },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('table_osm_buildings', { isPick: true });
map.fitBounds();

map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
  map.setHighlightedIds(layerId, selection);
  console.log(layerId, selection);
});
map.draw();`;
        case 'I02': return `${DB_MAP.replace("import { AutkMap }", "import { MapEvent, AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'buildings'] },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('table_osm_buildings', { isPick: true });
map.fitBounds();

map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
  map.setHighlightedIds(layerId, selection);
  // Hide the selection; clearSkippedIds restores everything.
  map.setSkippedIds(layerId, selection);
});
map.draw();`;
        case 'I03': return `import { AutkMap } from '@urban-toolkit/autk-map';
import { CameraMotion } from '@urban-toolkit/autk-core';

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();

map.loadCollection('neighborhoods', {
  collection: await fetch('/data/mnt_neighs_proj.geojson').then(response => response.json()),
});
map.fitBounds();
map.setView({ center: { latitude: 40.7831, longitude: -73.9712 }, zoom: 12 });

await new CameraMotion().zoomOut(1.5, 1).pitch(-35, 1).yaw(20, 1).zoomIn(1.5, 1).play(map.camera);
map.draw();`;
        case 'S01': return `${DB_MAP.replace("import { AutkMap }", "import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';\nimport { AutkMap }")}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_roads.geojson', outputTableName: 'roads' });

const roads = await db.getLayer('roads');
map.loadCollection('roads', { collection: roads, type: 'roads' });
map.updateColorMap('roads', { colorMap: {
  interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,
  domainSpec: { type: ColorMapDomainStrategy.USER, params: ${variant === 'numeric' ? '[3, 1, 2]' : "['primary', 'secondary', 'other']"} },
} });
map.updateThematic('roads', { collection: roads, property: 'properties.highway' });
map.fitBounds();
map.draw();`;
        case 'S02': return `${DB_MAP.replace("import { AutkMap }", "import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';\nimport { AutkMap }")}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });

const neighborhoods = await db.getLayer('neighborhoods');
map.loadCollection('neighborhoods', { collection: neighborhoods });
map.updateColorMap('neighborhoods', { colorMap: {
  interpolator: ColorMapInterpolator.${variant === 'sequential' ? 'SEQ_VIRIDIS' : 'DIV_SPECTRAL'},
  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },
} });
map.updateThematic('neighborhoods', { collection: neighborhoods, property: 'properties.shape_area' });
map.fitBounds();
map.draw();`;
        case 'S03': return `import { AutkMap } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!);
${variant === 'custom'
                ? "map.style.setCustomStyle({\n  background: '#f7f5ef', surface: '#eee8db', parks: '#c4d9b0',\n  water: '#b6d7e8', roads: '#fff', buildings: '#c8b9a7',\n  points: '#7c3aed', polylines: '#3451b2', polygons: '#d6c5a3',\n});"
                : `map.style.setPredefinedStyle('${variant || 'apple'}');`}
await map.init();

map.loadCollection('neighborhoods', {
  collection: await fetch('/data/mnt_neighs_proj.geojson').then(response => response.json()),
});
map.fitBounds();
map.draw();`;
        case 'S04': return `${DB_MAP}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });

map.loadCollection('neighborhoods', { collection: await db.getLayer('neighborhoods') });
map.updateRenderInfo('neighborhoods', { opacity: ${state.opacity || '0.75'}, showBorders: ${state['show-borders'] !== 'false'} });
map.fitBounds();
map.draw();`;
        case 'B01': return `${TILES}
map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.updateRenderInfo('imagery', { isSkip: ${state['show-tiles'] === 'false'} });
map.draw();`;
        case 'B02': return `${DB_TILES}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
// An opaque surface would cover the imagery beneath the vectors.
map.updateRenderInfo('table_osm_surface', { isSkip: true });
map.draw();`;
        case 'B03': return `${DB_MAP}
await db.loadGeoTiff({
  geotiffFileUrl: ${variant === 'rgb' ? "'/data/rgb-imagery.tif'" : "'/data/mnt_dem.tif'"},
  coordinateFormat: ${variant === 'rgb' ? "'EPSG:32618'" : "'EPSG:3857'"},
  outputTableName: 'image',
});

map.loadCollection('image', {
  collection: await db.getRaster('image'),
  type: 'raster',
  property: ${variant === 'rgb' ? "['band_1', 'band_2', 'band_3']" : "'band_1'"},
});
map.fitBounds();
map.draw();`;
        case 'T01': return `${DB_TERRAIN}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}

map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`;
        case 'T02': return `import { AutkMap, TILE_SOURCES, TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });

map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`;
        case 'T03': return `${DB_TERRAIN}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('table_osm_surface', { isSkip: true });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`;
        case 'T04': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});
await db.loadGeoTiff({
  geotiffFileUrl: '/data/niteroi-elevation.tif',
  coordinateFormat: 'EPSG:3395',
  outputTableName: 'elevation',
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}

map.loadTerrain({ source: { collection: await db.getRaster('elevation'), property: 'band_1' } });
map.draw();`;
        case 'P01': return plot('barchart', "{ axis: ['ntaname', 'shape_area'] }", 'CLICK');
        case 'P02': return plot('scatterplot', "{ axis: ['shape_area', 'shape_leng'] }", 'BRUSH');
        case 'P03': return plot('barchart', "{ axis: ['shape_area', '@transform'] }", 'BRUSH_X', "{ preset: 'binning-1d', options: { bins: 10 } }");
        case 'P04': return plot('heatmatrix', "{ axis: ['shape_area', 'landuse'], color: '@transform' }", 'CLICK', "{ preset: 'binning-2d' }");
        case 'P05': return plot('table', "{ axis: ['ntaname', 'shape_area', 'shape_leng'] }", 'CLICK', "{ preset: 'sort', options: { direction: 'asc' } }");
        case 'P06': return plot('parallel-coordinates', "{ axis: ['shape_area', 'shape_leng', 'cdta2020'] }", 'BRUSH_Y');
        case 'P07': return plot('linechart', "{ axis: ['sjoin.collect.noise', '@transform'] }", 'BRUSH_X',
            "{ preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } }");
        case 'P08': return plot('barchart', "{ axis: ['series', '@transform'] }", 'CLICK',
            "{ preset: 'reduce-series', options: { timestamp: 'timestamp', value: 'value', reducer: 'avg' } }");
        case 'A01': return `${DB_MAP}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });
await db.loadCsv({ csvFileUrl: '/data/noise.csv', outputTableName: 'noise', geometryColumns: true });

await db.spatialQuery({
  tableRootName: 'neighborhoods',
  tableJoinName: 'noise',
  groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
});

const neighborhoods = await db.getLayer('neighborhoods');
map.loadCollection('neighborhoods', { collection: neighborhoods });
map.updateThematic('neighborhoods', { collection: neighborhoods, property: 'properties.sjoin.count.noise' });
map.fitBounds();
map.draw();`;
        case 'A02': return `${DB_MAP}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });
await db.loadCsv({ csvFileUrl: '/data/noise.csv', outputTableName: 'noise', geometryColumns: true });
await db.loadCsv({ csvFileUrl: '/data/parking.csv', outputTableName: 'parking', geometryColumns: true });

for (const table of ['noise', 'parking']) {
  await db.spatialQuery({
    tableRootName: 'neighborhoods',
    tableJoinName: table,
    groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
  });
}

map.loadCollection('neighborhoods', { collection: await db.getLayer('neighborhoods') });
map.fitBounds();
map.draw();`;
        case 'A03': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'roads', 'buildings'] },
});
await db.loadCsv({ csvFileUrl: '/data/noise.csv', outputTableName: 'noise', geometryColumns: true });

const target = ${variant === 'buildings' ? "'table_osm_buildings'" : "'table_osm_roads'"};
await db.spatialQuery({
  tableRootName: target,
  tableJoinName: 'noise',
  near: { distance: 1000 },
  groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
});

const nearby = await db.getLayer(target);
map.loadCollection('nearby', { collection: nearby, type: ${variant === 'buildings' ? "'buildings'" : "'roads'"} });
map.updateThematic('nearby', { collection: nearby, property: 'properties.sjoin.count.noise' });
map.fitBounds();
map.draw();`;
        case 'A04': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
});
await db.loadCsv({ csvFileUrl: '/data/noise.csv', outputTableName: 'noise', geometryColumns: true });

await db.buildHeatmap({
  tableJoinName: 'noise',
  near: { distance: 1000 },
  outputTableName: 'heatmap',
  grid: { rows: ${variant === 'fine' ? 60 : 30}, columns: ${variant === 'fine' ? 60 : 30} },
  groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
});

map.loadCollection('heatmap', { collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1' });
map.updateRenderInfo('heatmap', { opacity: 0.5 });
map.fitBounds();
map.draw();`;
        case 'A05': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeGpgpu } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });

const result = await new ComputeGpgpu().run({
  collection: await db.getLayer('neighborhoods'),
  variableMapping: ${variant === 'roads' ? "{ x: 'lanes' }" : "{ x: 'shape_area', y: 'shape_leng' }"},
  resultField: 'result',
  wgslBody: '${variant === 'roads' ? 'return x;' : 'return (4 * 3.1415927 * x) / (y * y);'}',
});

map.loadCollection('neighborhoods', { collection: result });
map.updateThematic('neighborhoods', { collection: result, property: 'properties.compute.result' });
map.fitBounds();
map.draw();`;
        case 'A06': case 'A07': case 'A08': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeRender } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'roads', 'buildings'] },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.fitBounds();

const result = await new ComputeRender().run({
  layers: [{ id: 'table_osm_buildings', collection: await db.getLayer('table_osm_buildings'), type: 'buildings' }],
  viewpoints: { collection: await db.getLayer('table_osm_roads'), sampling: { directions: 1 } },
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
});

map.updateThematic('table_osm_roads', { collection: result, property: 'properties.compute.render.classes.sky' });
map.draw();`;
        default: throw new Error(`Missing source excerpt for ${id}`);
    }
}

const DB_MAP = `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
`;

const D03_CITIES: Record<string, { workspace: string; table: string; file: string; input: 'url' | 'object' }> = {
    paris: { workspace: 'paris', table: 'arrondissements', file: 'paris-arrondissements.geojson', input: 'url' },
    new_york: { workspace: 'new_york', table: 'neighborhoods', file: 'mnt_neighs.geojson', input: 'object' },
    chicago: { workspace: 'chicago', table: 'community_areas', file: 'chi-community-areas.geojson', input: 'object' },
};

const TILES = `import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
`;

const DB_TILES = `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
`;

const DB_TERRAIN = `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TILE_SOURCES, TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
`;

function plot(type: string, attributes: string, event: string, transform?: string): string {
    return `import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const collection = await fetch('/data/mnt_neighs_proj.geojson').then(response => response.json());

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.loadCollection('neighborhoods', { collection });
map.updateRenderInfo('neighborhoods', { isPick: true });
map.fitBounds();
map.draw();

const plot = new AutkPlot(document.querySelector('#plotBody')!, {
  type: '${type}',
  collection,
  attributes: ${attributes},${transform ? `\n  transform: ${transform},` : ''}
  width: Math.max(280, document.querySelector('#plotBody')!.clientWidth - 40),
  events: [PlotEvent.${event}],
});

map.events.on(MapEvent.PICKING, ({ selection }) => plot.setSelection(selection));
plot.events.on(PlotEvent.${event}, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));`;
}
