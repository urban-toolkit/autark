import { CAMERA_TOUR_ROUTE } from './src/autk-map/camera-tour-route';
import { CORINE_CLASSES } from './src/autk-map/corine-palette';
import { ROAD_LENGTH_WGSL } from './src/autk-map/road-length';
import temporalEventsSource from './src/autk-plot/temporal-events-click.ts?raw';

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
  pbfFileUrl: '/data/monaco.osm.pbf',
  queryArea: ${variant === 'place' || variant === 'tags' ? "{ geocodeArea: 'Monaco', areas: ['Monaco'] }" : '{ bbox: [7.405, 43.720, 7.445, 43.7525] }'},${variant === 'tags' ? "\n  tagSets: [\n    { name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] },\n  ]," : ''}
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
        case 'I01': return `${DB_MAP.replace("import { AutkMap }", "import { MapEvent, AutkMap }").replace("const map = new AutkMap(document.querySelector('canvas')!);", "const map = new AutkMap(document.querySelector('canvas')!, { showUi: false });")}
await db.loadOsm({
  pbfFileUrl: '/data/lower_mnt.osm.pbf',
  queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
  autoLoadLayers: { layers: ['surface', 'buildings'] },
});
const buildings = await db.getLayer('table_osm_buildings');

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: layer.name === 'table_osm_buildings'
    ? buildings : await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('table_osm_buildings', { isPick: true });
map.fitBounds();

// Picking toggles ids, so repeated clicks accumulate a selection.
map.setHover(true);
map.events.on(MapEvent.CLICK, ({ selection }) => {
  const picked = selection.map(id => buildings.features[id]);
  console.log(picked.length, 'selected');
});
map.draw();`;
        case 'I02': return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';

const db = new AutkDb();
await db.init();
await db.loadOsm({
  pbfFileUrl: '/data/boston-harbor.osm.pbf',
  queryArea: { bbox: [-71.090, 42.340, -71.035, 42.377] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

const map = new AutkMap(document.querySelector('canvas')!, { showUi: false });
await map.init();
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('table_osm_buildings', { isPick: true });
map.fitBounds();

const hidden = new Set<number>();
map.events.on(MapEvent.CLICK, ({ selection }) => {
  // Keep previously hidden buildings hidden; restore everything with clearSkippedIds.
  for (const id of selection) hidden.add(id);
  map.setSkippedIds('table_osm_buildings', [...hidden]);
});
map.draw();`;
        case 'I03': return `import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { computeOrigin, lonLatToCrs } from '@urban-toolkit/autk-core';

const bbox: [number, number, number, number] = [-74.019, 40.700, -74.003, 40.714];
const db = new AutkDb();
await db.init();
await db.loadOsm({ pbfFileUrl: '/data/lower_mnt.osm.pbf', queryArea: { bbox },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] } });
const map = new AutkMap(document.querySelector('canvas')!, { showUi: false });
await map.init();
const roads = await db.getLayer('table_osm_roads');
map.loadCollection('table_osm_roads', { collection: roads, type: 'roads' });
for (const layer of db.getLayersMetadata()) {
  if (layer.name !== 'table_osm_roads')
    map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
const origin = computeOrigin(roads);
const route: Array<[number, number]> = ${JSON.stringify(CAMERA_TOUR_ROUTE)};
const path = route.map(([lon, lat]) => {
  const [x, y] = lonLatToCrs(map.workspaceCrs, lon, lat);
  return [x - origin[0], y - origin[1]];
});
const distances = [0];
for (let i = 1; i < path.length; i++)
  distances.push(distances[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
const total = distances[distances.length - 1];
const sampleRoad = (distance: number) => {
  const d = Math.max(0, Math.min(distance, total));
  const i = distances.findIndex(value => value >= d);
  if (i <= 0) return path[0];
  const t = (d - distances[i - 1]) / (distances[i] - distances[i - 1]);
  return path[i - 1].map((v, axis) => v + (path[i][axis] - v) * t);
};
// Soften small bends while keeping the camera close to the mapped path.
const point = (distance: number) => {
  const d = Math.max(0, Math.min(distance, total));
  const radius = Math.min(8, d, total - d);
  const before = sampleRoad(d - radius), current = sampleRoad(d), after = sampleRoad(d + radius);
  return current.map((v, axis) => (before[axis] + 2 * v + after[axis]) / 4);
};
const sw = lonLatToCrs(map.workspaceCrs, bbox[0], bbox[1]);
const ne = lonLatToCrs(map.workspaceCrs, bbox[2], bbox[3]);
map.fitBounds([sw[0], sw[1], ne[0], ne[1]]);
const center = map.camera.getLookAt();
const height = map.camera.getEye()[2];
const finalEye = [center[0], center[1] - height * 0.55, height * 1.05];
const end = path[path.length - 1], before = point(total - 22.5);
const startAngle = Math.atan2(end[1] - before[1], end[0] - before[0]);
const endAngle = Math.atan2(center[1] - end[1], center[0] - end[0]);
const delta = Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle));
const ease = (t: number) => t * t * (3 - 2 * t);
map.draw();
let start: number | undefined;
const step = (time: number) => {
  start ??= time;
  const elapsed = (time - start) / 1000;
  if (elapsed < 42) {
    const distance = ease(elapsed / 42) * total;
    const eye = point(distance), behind = point(distance - 22.5), ahead = point(distance + 22.5);
    const angle = Math.atan2(ahead[1] - behind[1], ahead[0] - behind[0]);
    map.camera.resetCamera([0, 0, 1], [eye[0] + Math.cos(angle) * 45, eye[1] + Math.sin(angle) * 45, 15], [eye[0], eye[1], 12]);
  } else if (elapsed < 50) {
    const angle = startAngle + delta * ease((elapsed - 42) / 8);
    map.camera.resetCamera([0, 0, 1], [end[0] + Math.cos(angle) * 45, end[1] + Math.sin(angle) * 45, 15], [end[0], end[1], 12]);
  } else {
    const t = ease(Math.min((elapsed - 50) / 20, 1));
    const initialLook = [end[0] + Math.cos(endAngle) * 45, end[1] + Math.sin(endAngle) * 45, 15];
    const eye = [end[0] + (finalEye[0] - end[0]) * t, end[1] + (finalEye[1] - end[1]) * t, 12 + (finalEye[2] - 12) * t];
    map.camera.resetCamera([0, 0, 1], initialLook.map((v, axis) => v + (center[axis] - v) * t), eye);
  }
  map.requestRender();
  if (elapsed < 70) requestAnimationFrame(step);
};
requestAnimationFrame(step);`;
        case 'S01': return `${DB_MAP.replace("import { AutkMap }", "import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';\nimport { AutkMap }")}

const BERLIN_BEZIRKE = ['Mitte', 'Friedrichshain-Kreuzberg', 'Pankow', 'Charlottenburg-Wilmersdorf', 'Spandau', 'Steglitz-Zehlendorf', 'Tempelhof-Schöneberg', 'Neukölln', 'Treptow-Köpenick', 'Marzahn-Hellersdorf', 'Lichtenberg', 'Reinickendorf'];

await db.loadGeojson({ geojsonFileUrl: '/data/berlin-ortsteile.geojson', outputTableName: 'ortsteile' });

const ortsteile = await db.getLayer('ortsteile');
map.loadCollection('ortsteile', { collection: ortsteile });
${variant === 'category' ? `map.updateColorMap('ortsteile', { colorMap: {
  interpolator: ColorMapInterpolator.CAT_PAIRED,
  domainSpec: { type: ColorMapDomainStrategy.USER, params: BERLIN_BEZIRKE },
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

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type,
    loadConfig: { buildingsZeroHeight: true } });
}
map.fitBounds();
map.draw();`;
        case 'S04': return `${DB_MAP}
await db.loadOsm({
  pbfFileUrl: '/data/salzburg.osm.pbf',
  queryArea: { bbox: [13.030, 47.790, 13.065, 47.815] },
  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
});

for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type,
    loadConfig: { buildingsZeroHeight: true } });
}
const response = await fetch('/data/salzburg-districts.geojson');
if (!response.ok) throw new Error('Could not load Salzburg districts');
map.loadCollection('salzburg-districts', { collection: await response.json(), type: 'polygons', sourceCrs: 'EPSG:4326' });
map.updateRenderInfo('table_osm_buildings', { opacity: ${state.opacity || '0.75'} });
map.updateRenderInfo('salzburg-districts', {
  opacity: ${state['district-opacity'] || '0.30'},
  strokeColor: { r: 25, g: 54, b: 117, alpha: 1 },
  showBorders: ${state['show-borders'] !== 'false'},
});
// Credit the district dataset in the page footer: Stadt Salzburg, CC BY 3.0 AT (grouped and cropped).
map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);
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
        case 'B03': return variant === 'rgb' ? `import { ColorMapDomainStrategy, type ColorMapConfig } from '@urban-toolkit/autk-core';
${DB_MAP}
const classes = ${JSON.stringify(CORINE_CLASSES)};
const palette = {
  type: 'categorical',
  domainSpec: { type: ColorMapDomainStrategy.USER, params: classes.map(([name]) => name) },
  colors: classes.map(([, color]) => color as \`#\${string}\`),
} satisfies ColorMapConfig;
map.style.setPredefinedStyle('light');
await db.loadOsm({
  pbfFileUrl: '/data/lisbon.osm.pbf',
  queryArea: { bbox: [-9.240416615, 38.669583380, -9.039583283, 38.820416713] },
  autoLoadLayers: { layers: ['surface', 'water', 'roads'] },
});
await db.loadGeoTiff({
  geotiffFileUrl: '/data/lisbon-corine-2018-rgb.tif',
  coordinateFormat: 'EPSG:4326',
  outputTableName: 'land_cover',
  resampleMethod: 'nearest',
});
map.loadCollection('land_cover', {
  collection: await db.getRaster('land_cover'),
  type: 'raster',
  property: ['band_1', 'band_2', 'band_3'],
});
map.updateColorMap('land_cover', { colorMap: palette });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('land_cover', { isColorMap: true, opacity: ${state['raster-opacity'] ?? '0.78'} });
map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);
map.fitBounds();
map.draw();` : `import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
${DB_MAP}
map.style.setPredefinedStyle('light');
await db.loadOsm({
  pbfFileUrl: '/data/lisbon.osm.pbf',
  queryArea: { bbox: [-9.240416615, 38.669583380, -9.039583283, 38.820416713] },
  autoLoadLayers: { layers: ['surface', 'water', 'roads'] },
});
// WorldPop, Portugal 2020 (CC BY 4.0), cropped to Lisbon.
await db.loadGeoTiff({
  geotiffFileUrl: '/data/lisbon-population-2020.tif',
  coordinateFormat: 'EPSG:4326',
  outputTableName: 'population',
});
map.loadCollection('population', { collection: await db.getRaster('population'), type: 'raster', property: 'band_1' });
map.updateColorMap('population', { colorMap: {
  interpolator: ColorMapInterpolator.SEQ_YL_OR_RD,
  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [0, 98] },
} });
for (const layer of db.getLayersMetadata()) {
  map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
}
map.updateRenderInfo('population', { isColorMap: true, opacity: ${state['raster-opacity'] ?? '0.78'} });
map.ui.setAttribution([{ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' }]);
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
        case 'P04': return plot('heatmatrix', "{ axis: ['shape_area', 'shape_leng'], color: '@transform' }", 'CLICK', "{ preset: 'binning-2d' }");
        case 'P05': return plot('table', "{ axis: ['ntaname', 'shape_area', 'shape_leng'] }", 'CLICK', "{ preset: 'sort', options: { direction: 'asc' } }");
        case 'P06': return plot('parallel-coordinates', "{ axis: ['shape_area', 'shape_leng', 'cdta2020'] }", 'BRUSH_Y');
        case 'P07': return temporalEventsSource
            .replace("import { exampleVariant, onExampleDispose, runExample } from '../example';\n", '')
            .replace("exampleVariant('Group noise reports by', { neighborhoods: 'Neighborhoods', roads: 'Roads' })", JSON.stringify(variant === 'roads' ? 'roads' : 'neighborhoods'))
            .replace(/^ {4}onExampleDispose\(.*\);\n/gm, '')
            .replace(/^ {4}document\.querySelector\('#join-description'\)![\s\S]*?(?=^})/m, '')
            .replace('const BASE_URL = (import.meta as any).env.BASE_URL;', "const BASE_URL = '/';")
            .replace('void runExample(main);', 'await main();');
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
  variableMapping: ${variant === 'roads' ? "{ road: 'geometry' }" : "{ x: 'shape_area', y: 'shape_leng' }"},
  resultField: 'result',
  wgslBody: ${variant === 'roads' ? `\`\n${ROAD_LENGTH_WGSL}\n\`` : "'return (4 * 3.1415927 * x) / (y * y);'"},
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
  events: [PlotEvent.${event}, PlotEvent.HOVER],
});

map.events.on(MapEvent.CLICK, ({ selection }) => plot.setSelection(selection));
plot.events.on(PlotEvent.${event}, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));
plot.events.on(PlotEvent.HOVER, ({ selection }) =>
  map.setHighlightedIds('neighborhoods', [...new Set([...plot.selection, ...selection])]));`;
}
