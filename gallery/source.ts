import { ROAD_LENGTH_WGSL } from './src/autk-map/road-length';

/**
 * Minimal runnable programs shown under "Minimal runnable example".
 * Each assumes an HTML page containing a <canvas> (and `#plotBody` for charts).
 */
export function exampleSource(id: string, state: Record<string, string>): string {
    const provider = state['source-select'] || 'osmLight';
    const variant = state.variant;
    switch (id) {
        case 'D01': {
            const [layer, file, type, style] = variant === 'lines'
                ? ['neighborhood-boundaries', 'mnt_neigh_boundaries', ", type: 'polylines'", 'polylinesWidth: 120']
                : variant === 'points'
                    ? ['neighborhood-centers', 'mnt_neigh_centers', ", type: 'points'", 'pointSize: 160']
                    : ['neighborhoods', 'mnt_neighs_proj', '', ''];
            return `import { AutkMap } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();

const collection = await fetch('/data/${file}.geojson').then(response => response.json());
map.loadCollection('${layer}', { collection${type} });${style ? `\nmap.updateRenderInfo('${layer}', { ${style} });` : ''}
map.fitBounds();
map.draw();`;
        }
        case 'D02': return `import { AutkMap } from '@urban-toolkit/autk-map';

const map = new AutkMap(document.querySelector('canvas')!, { crs: '${state.crs || 'EPSG:3395'}' });
await map.init();
map.setView({ center: { latitude: 41.855, longitude: -87.665 }, zoom: 11 });

// The source is longitude/latitude; the map projects it into the workspace CRS.
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

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.loadCollection('${table}', { collection: await db.getLayer('${table}') });
map.fitBounds();
map.draw();`;
        }
        case 'D04': return `${DB_MAP}
// CSV + WKT: boroughs first, so they set the workspace extent.
await db.loadCsv({ csvFileUrl: '/data/london-boroughs.csv',
  outputTableName: 'boroughs', geometryColumns: { wktColumnName: 'wkt' } });
// JSON + WKT: the same geometry option.
await db.loadJson({ jsonFileUrl: '/data/london-tube-lines.json',
  outputTableName: 'tube_lines', geometryColumns: { wktColumnName: 'wkt' } });
// CSV + coordinates instead of WKT.
await db.loadCsv({ csvFileUrl: '/data/london-tube-entrances.csv',
  outputTableName: 'tube_entrances',
  geometryColumns: { latColumnName: 'lat', longColumnName: 'lon' } });

for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();
map.draw();`;
        case 'D06': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/monaco.osm.pbf',
  queryArea: ${variant === 'place' || variant === 'tags' ? "{ geocodeArea: 'Monaco', areas: ['Monaco'] }" : '{ bbox: [7.405, 43.720, 7.445, 43.7525] }'},${variant === 'tags' ? "\n  tagSets: [{ name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] }]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});

for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();
map.draw();`;
        case 'I01': return `${DB_MAP_EVENTS}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'buildings'] },
});
const buildings = await db.getLayer('table_osm_buildings');
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: name === 'table_osm_buildings'
    ? buildings : await db.getLayer(name), type });
}
map.updateRenderInfo('table_osm_buildings', { isClick: true });
map.fitBounds();

map.events.on(MapEvent.CLICK, ({ selection }) => {
  const picked = selection.map(id => buildings.features[id]);
  const heights = picked.map(feature => Number(feature.properties?.height) || 0);
  console.log(picked.length, 'selected; tallest', Math.max(0, ...heights));
});
map.draw();`;
        case 'I02': return `${DB_MAP_EVENTS}
await db.loadOsm({
  pbfFileUrl: '/data/boston-harbor.osm.pbf',
  queryArea: { bbox: [-71.090, 42.340, -71.035, 42.377] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.updateRenderInfo('table_osm_buildings', { isClick: true });
map.fitBounds();

const hidden = new Set<number>();
map.events.on(MapEvent.CLICK, ({ selection }) => {
  for (const id of selection) hidden.add(id);
  map.setSkipped('table_osm_buildings', [...hidden]);
});
// map.setSkipped('table_osm_buildings', []) restores every hidden building.
map.draw();`;
        case 'I03': return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { computeOrigin, lonLatToCrs } from '@urban-toolkit/autk-core';

const db = new AutkDb();
await db.init();
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'roads', 'buildings'] },
});
const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();
map.draw();

// Two points on the route, in map coordinates.
const origin = computeOrigin(await db.getLayer('table_osm_roads'));
const start = lonLatToCrs(map.workspaceCrs, -74.010, 40.707).map((v, i) => v - origin[i]);
const end = lonLatToCrs(map.workspaceCrs, -74.005, 40.710).map((v, i) => v - origin[i]);

// Drive the camera from start to end in 8 seconds.
const began = performance.now();
const step = (time: number) => {
  const t = Math.min((time - began) / 8000, 1);
  const x = start[0] + (end[0] - start[0]) * t;
  const y = start[1] + (end[1] - start[1]) * t;
  map.camera.resetCamera([0, 0, 1], [x + 45, y, 15], [x, y, 12]);
  map.requestRender();
  if (t < 1) requestAnimationFrame(step);
};
requestAnimationFrame(step);`;
        case 'S01': return `${DB_MAP.replace("import { AutkMap }", "import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';\nimport { AutkMap }")}
await db.loadGeojson({ geojsonFileUrl: '/data/berlin-ortsteile.geojson', outputTableName: 'ortsteile' });
const ortsteile = await db.getLayer('ortsteile');
map.loadCollection('ortsteile', { collection: ortsteile });
${variant === 'category' ? `const bezirke = [...new Set(ortsteile.features.map(feature => feature.properties?.bezirk))];
map.updateColorMap('ortsteile', { colorMap: {
  interpolator: ColorMapInterpolator.CAT_PAIRED,
  domainSpec: { type: ColorMapDomainStrategy.USER, params: bezirke },
} });
map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.bezirk' });` : `map.updateColorMap('ortsteile', { colorMap: {
  interpolator: ColorMapInterpolator.${variant === 'diverging' ? 'DIV_RED_BLUE' : 'SEQ_BLUES'},
  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },
} });
map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.area_km2' });`}
map.updateRenderInfo('ortsteile', { isColorMap: true });
map.fitBounds();
map.draw();`;
        case 'S03': return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();
await db.loadOsm({
  pbfFileUrl: '/data/venice.osm.pbf',
  queryArea: { bbox: [12.300, 45.420, 12.360, 45.450] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

const map = new AutkMap(document.querySelector('canvas')!);
map.style.setPredefinedStyle('${variant || 'google'}');
await map.init();
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();
map.draw();`;
        case 'S04': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/salzburg.osm.pbf',
  queryArea: { bbox: [13.030, 47.790, 13.065, 47.815] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
const districts = await fetch('/data/salzburg-districts.geojson').then(response => response.json());
map.loadCollection('salzburg-districts', { collection: districts, sourceCrs: 'EPSG:4326' });

map.updateRenderInfo('table_osm_buildings', { opacity: ${state.opacity || '0.75'} });
map.updateRenderInfo('salzburg-districts', {
  opacity: ${state['district-opacity'] || '0.30'},
  showBorders: ${state['show-borders'] !== 'false'},
});
map.fitBounds();
map.draw();`;
        case 'B01': return `${TILES}
map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.draw();`;
        case 'B02': return `${DB_TILES}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
// An opaque surface would cover the imagery beneath the vectors.
map.updateRenderInfo('table_osm_surface', { isSkip: true });
map.draw();`;
        case 'B03': return variant === 'rgb' ? `${DB_MAP}
await db.loadGeoTiff({
  geotiffFileUrl: '/data/lisbon-corine-2018-rgb.tif',
  sourceCrs: 'EPSG:4326',
  outputTableName: 'land_cover',
  resampleMethod: 'nearest',
});
map.loadCollection('land_cover', {
  collection: await db.getRaster('land_cover'),
  type: 'raster',
  property: ['band_1', 'band_2', 'band_3'],
});
map.fitBounds();
map.draw();` : `${DB_MAP.replace("import { AutkMap }", "import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';\nimport { AutkMap }")}
await db.loadGeoTiff({
  geotiffFileUrl: '/data/lisbon-population-2020.tif',
  sourceCrs: 'EPSG:4326',
  outputTableName: 'population',
});
map.loadCollection('population', {
  collection: await db.getRaster('population'),
  type: 'raster',
  property: 'band_1',
});
map.updateColorMap('population', { colorMap: {
  interpolator: ColorMapInterpolator.SEQ_YL_OR_RD,
  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [0, 98] },
} });
map.updateRenderInfo('population', { isColorMap: true });
map.fitBounds();
map.draw();`;
        case 'T01': return `${DB_TERRAIN_ONLY}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`;
        case 'T02': return `${TILES}
map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`
            .replace("import { AutkMap, TILE_SOURCES }", "import { AutkMap, TERRAIN_TILE_SOURCES, TILE_SOURCES }");
        case 'T03': return `${DB_TERRAIN}
await db.loadOsm({
  pbfFileUrl: '/data/niteroi.osm.pbf',
  queryArea: { bbox: [-43.14, -22.97, -43.03, -22.85] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.updateRenderInfo('table_osm_surface', { isSkip: true });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });
map.draw();`;
        case 'T04': return `${DB_MAP}
await db.loadGeoTiff({
  geotiffFileUrl: '/data/niteroi-elevation.tif',
  sourceCrs: 'EPSG:3395',
  outputTableName: 'elevation',
});
map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTerrain({ source: { collection: await db.getRaster('elevation'), property: 'band_1' } });
map.draw();`;
        case 'P01': return plot('barchart', "{ axis: ['ntaname', 'shape_area'] }", 'CLICK');
        case 'P02': return plot('scatterplot', "{ axis: ['shape_area', 'shape_leng'] }", 'BRUSH');
        case 'P03': return plot('barchart', "{ axis: ['shape_area', '@transform'] }", 'BRUSH_X', "{ preset: 'binning-1d', options: { bins: 10 } }");
        case 'P04': return plot('heatmatrix', "{ axis: ['shape_area', 'shape_leng'], color: '@transform' }", 'CLICK', "{ preset: 'binning-2d' }");
        case 'P05': return plot('table', "{ axis: ['ntaname', 'shape_area', 'shape_leng'] }", 'CLICK', "{ preset: 'sort', options: { direction: 'asc' } }");
        case 'P06': return plot('parallel-coordinates', "{ axis: ['shape_area', 'shape_leng', 'cdta2020'] }", 'BRUSH_Y');
        case 'P07': return plot('linechart', "{ axis: ['sjoin.collect.noise', '@transform'] }", 'BRUSH_X',
            "{ preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } }", variant === 'roads' ? 'roads' : 'neighborhoods');
        case 'P08': return plot('boxplot', "{ axis: ['cdta2020', 'shape_area', '@transform'] }", 'CLICK', "{ preset: 'box-stats' }");
        case 'P09': return `import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const collection = await fetch('/data/mnt_neighs_proj.geojson').then(response => response.json());
const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.loadCollection('neighborhoods', { collection });
map.updateRenderInfo('neighborhoods', { isClick: true, isHover: true });
map.fitBounds();
map.draw();

const scatter = new AutkPlot(document.querySelector('#plotScatter')!, {
  type: 'scatterplot', collection, attributes: { axis: ['shape_area', 'shape_leng'] },
  events: [PlotEvent.CLICK, PlotEvent.HOVER],
});
const histogram = new AutkPlot(document.querySelector('#plotHistogram')!, {
  type: 'barchart', collection, attributes: { axis: ['shape_area', '@transform'] },
  transform: { preset: 'binning-1d', options: { bins: 10 } },
  events: [PlotEvent.CLICK, PlotEvent.HOVER],
});

scatter.events.on(PlotEvent.CLICK, ({ selection }) => {
  map.setSelection('neighborhoods', selection);
  histogram.setSelection(selection);
});
scatter.events.on(PlotEvent.HOVER, ({ selection }) => {
  map.setHover('neighborhoods', selection);
  histogram.setHover(selection);
});
histogram.events.on(PlotEvent.CLICK, ({ selection }) => {
  map.setSelection('neighborhoods', selection);
  scatter.setSelection(selection);
});
histogram.events.on(PlotEvent.HOVER, ({ selection }) => {
  map.setHover('neighborhoods', selection);
  scatter.setHover(selection);
});

map.events.on(MapEvent.CLICK, ({ selection }) => {
  scatter.setSelection(selection);
  histogram.setSelection(selection);
});
map.events.on(MapEvent.HOVER, ({ selection, source }) => {
  if (source !== 'pointer') return;
  scatter.setHover(selection);
  histogram.setHover(selection);
});`;
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
map.updateThematic('neighborhoods', {
  collection: neighborhoods,
  property: 'properties.sjoin.count.noise',
});
map.fitBounds();
map.draw();`;
        case 'A02': return `${DB_MAP}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });
for (const table of ['noise', 'parking']) {
  await db.loadCsv({ csvFileUrl: \`/data/\${table}.csv\`, outputTableName: table, geometryColumns: true });
  await db.spatialQuery({
    tableRootName: 'neighborhoods',
    tableJoinName: table,
    groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
  });
}

const neighborhoods = await db.getLayer('neighborhoods');
map.loadCollection('neighborhoods', { collection: neighborhoods });
map.updateThematic('neighborhoods', {
  collection: neighborhoods,
  property: 'properties.sjoin.count.noise',
});
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
map.loadCollection(target, { collection: nearby, type: ${variant === 'buildings' ? "'buildings'" : "'roads'"} });
map.updateThematic(target, { collection: nearby, property: 'properties.sjoin.count.noise' });
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
map.loadCollection('heatmap', {
  collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1',
});
map.fitBounds();
map.draw();`;
        case 'A05': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeGpgpu } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadGeojson({ geojsonFileUrl: '/data/mnt_neighs.geojson', outputTableName: 'neighborhoods' });
const neighborhoods = await db.getLayer('neighborhoods');

const result = await new ComputeGpgpu().run({
  collection: neighborhoods,
  variableMapping: ${variant === 'roads' ? "{ road: 'geometry' }" : "{ x: 'shape_area', y: 'shape_leng' }"},
  resultField: 'result',
  wgslBody: ${variant === 'roads' ? `\`\n${ROAD_LENGTH_WGSL}\n\`` : "'return (4 * 3.1415927 * x) / (y * y);'"},
});

map.loadCollection('neighborhoods', { collection: result });
map.updateThematic('neighborhoods', { collection: result, property: 'properties.compute.result' });
map.fitBounds();
map.draw();`;
        case 'A06': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeRender } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'roads', 'buildings'] },
});
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();

const result = await new ComputeRender().run({
  layers: [{
    id: 'table_osm_buildings',
    collection: await db.getLayer('table_osm_buildings'),
    type: 'buildings',
  }],
  viewpoints: { collection: await db.getLayer('table_osm_roads'), sampling: { directions: 1 } },
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
});
map.updateThematic('table_osm_roads', {
  collection: result, property: 'properties.compute.render.classes.sky',
});
map.updateRenderInfo('table_osm_roads', { isColorMap: true });
map.draw();`;
        case 'A07': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeRender } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'buildings'] },
});
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();

// Three buildings are enough to show the window viewpoints.
const buildings = await db.getLayer('table_osm_buildings');
const picked = { ...buildings, features: buildings.features.slice(0, 3) };
const result = await new ComputeRender().run({
  layers: [
    { id: 'table_osm_parks', collection: await db.getLayer('table_osm_parks'), type: 'parks' },
    { id: 'table_osm_water', collection: await db.getLayer('table_osm_water'), type: 'water' },
  ],
  viewpoints: { collection: picked, strategy: { type: 'building-windows', floors: 3 } },
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
  tileSize: 32,
});
const sky = result.features.map(feature => Number(feature.properties?.compute?.render?.classes?.sky) || 0);
console.log(sky.length, 'windows; max sky exposure', Math.max(0, ...sky));
map.draw();`;
        case 'A08': return `${DB_MAP.replace("import { AutkMap }", "import { ComputeRender } from '@urban-toolkit/autk-compute';\nimport { AutkMap }")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'roads', 'buildings'] },
});
for (const { name, type } of db.getLayersMetadata()) {
  map.loadCollection(name, { collection: await db.getLayer(name), type });
}
map.fitBounds();

const result = await new ComputeRender().run({
  layers: [{
    id: 'table_osm_buildings',
    collection: await db.getLayer('table_osm_buildings'),
    type: 'buildings',
  }],
  viewpoints: { collection: await db.getLayer('table_osm_roads'), sampling: { directions: 8 } },
  aggregation: { type: 'objects' },
  tileSize: 64,
});
// Each viewpoint reports every sampled building under compute.render.objects.
const samples = result.features.reduce((count, feature) =>
  count + Object.keys(feature.properties?.compute?.render?.objects ?? {}).length, 0);
console.log(samples, 'building samples from', result.features.length, 'road viewpoints');
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

const DB_MAP_EVENTS = DB_MAP.replace("import { AutkMap }", "import { MapEvent, AutkMap }");

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

const DB_TERRAIN_ONLY = `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';

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

function plot(type: string, attributes: string, event: string, transform?: string, layer = 'neighborhoods'): string {
    const brush = event !== 'CLICK';
    const events = (brush ? [event, 'HOVER'] : ['CLICK', 'HOVER']).map(name => `PlotEvent.${name}`).join(', ');
    const selectionLink = brush
        ? `plot.events.on(PlotEvent.${event}, ({ selection }) => map.setSelection('${layer}', selection));`
        : `plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setSelection('${layer}', selection));`;
    return `import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';
import { AutkPlot, PlotEvent } from '@urban-toolkit/autk-plot';

const collection = await fetch('/data/mnt_neighs_proj.geojson').then(response => response.json());

const map = new AutkMap(document.querySelector('canvas')!);
await map.init();
map.loadCollection('neighborhoods', { collection });
map.updateRenderInfo('neighborhoods', { isClick: true });
map.fitBounds();
map.draw();

const plot = new AutkPlot(document.querySelector('#plotBody')!, {
  type: '${type}',
  collection,
  attributes: ${attributes},${transform ? `\n  transform: ${transform},` : ''}
  events: [${events}],
});

map.updateRenderInfo('neighborhoods', { isHover: true });
map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
map.events.on(MapEvent.HOVER, ({ selection, source }) => {
  if (source === 'pointer') plot.setHover(selection);
});
${selectionLink}
plot.events.on(PlotEvent.HOVER, ({ selection }) => map.setHover('${layer}', selection));`;
}
