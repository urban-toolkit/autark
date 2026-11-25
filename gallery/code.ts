import { ROAD_LENGTH_WGSL } from './src/autk-map/road-length';

/** The exact API calls for each feature; the runnable program is under "Minimal runnable example". */
export function exampleCode(id: string, state: Record<string, string>): string {
    const provider = state['source-select'] || 'osmLight';
    const variant = state.variant;
    switch (id) {
        case 'D01': {
            const [layer, type, style] = variant === 'lines'
                ? ['neighborhood-boundaries', ", type: 'polylines'", "map.updateRenderInfo('neighborhood-boundaries', { polylinesWidth: 120 });\n"]
                : variant === 'points'
                    ? ['neighborhood-centers', ", type: 'points'", "map.updateRenderInfo('neighborhood-centers', { pointSize: 160 });\n"]
                    : ['neighborhoods', '', ''];
            return `map.loadCollection('${layer}', { collection${type} });\n${style}`;
        }
        case 'D02': return `const map = new AutkMap(canvas, { crs: '${state.crs || 'EPSG:3395'}' });
map.loadCollection('community-areas', {
  collection,              // longitude/latitude
  sourceCrs: 'EPSG:4326',  // projected into the workspace CRS
});`;
        case 'D03': {
            const city = state.workspace || 'paris';
            const [workspace, load, layer] = city === 'new_york'
                ? ['new_york', "geojsonObject: collection", 'neighborhoods']
                : city === 'chicago'
                    ? ['chicago', "geojsonObject: collection", 'community_areas']
                    : ['paris', "geojsonFileUrl: '/data/paris-arrondissements.geojson'", 'arrondissements'];
            return `await db.setWorkspace('${workspace}');
await db.loadGeojson({ ${load}, outputTableName: '${layer}' });
map.loadCollection('${layer}', { collection: await db.getLayer('${layer}') });`;
        }
        case 'D04': return `const wkt = { wktColumnName: 'wkt' };
await db.loadCsv({ csvFileUrl: '/data/london-boroughs.csv',
  outputTableName: 'boroughs', geometryColumns: wkt });
await db.loadJson({ jsonFileUrl: '/data/london-tube-lines.json',
  outputTableName: 'tube_lines', geometryColumns: wkt });
await db.loadCsv({ csvFileUrl: '/data/london-tube-entrances.csv',
  outputTableName: 'tube_entrances',
  geometryColumns: { latColumnName: 'lat', longColumnName: 'lon' } });`;
        case 'D06': return `await db.loadOsm({
  pbfFileUrl: '/data/monaco.osm.pbf',
  queryArea: ${variant === 'place' || variant === 'tags' ? "{ geocodeArea: 'Monaco', areas: ['Monaco'] }" : '{ bbox: [7.405, 43.720, 7.445, 43.7525] }'},${variant === 'tags' ? "\n  tagSets: [{ name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] }]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});`;
        case 'I01': return `map.updateRenderInfo('table_osm_buildings', { isClick: true });
map.events.on(MapEvent.CLICK, ({ selection }) => {
  const picked = selection.map(id => buildings.features[id]);
  console.log(picked.length, 'buildings selected');
});`;
        case 'I02': return `const hidden = new Set<number>();
map.events.on(MapEvent.CLICK, ({ selection }) => {
  for (const id of selection) hidden.add(id);
  map.setSkipped('table_osm_buildings', [...hidden]);
});
map.setSkipped('table_osm_buildings', []); // restore all`;
        case 'I03': return `// Reset the camera on every frame; eye and lookAt move along the path.
const step = () => {
  map.camera.resetCamera([0, 0, 1], lookAt, eye);
  map.requestRender();
  requestAnimationFrame(step);
};
requestAnimationFrame(step);`;
        case 'S01': return variant === 'category'
            ? `// Explicit color per category, in domain order.
map.updateColorMap('ortsteile', { colorMap: {
  interpolator: ColorMapInterpolator.CAT_PAIRED,
  domainSpec: { type: ColorMapDomainStrategy.USER, params: bezirke },
} });
map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.bezirk' });
map.updateRenderInfo('ortsteile', { isColorMap: true });`
            : `map.updateColorMap('ortsteile', { colorMap: {
  interpolator: ColorMapInterpolator.${variant === 'diverging' ? 'DIV_RED_BLUE' : 'SEQ_BLUES'},
  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },
} });
map.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.area_km2' });
map.updateRenderInfo('ortsteile', { isColorMap: true });`;
        case 'S03': return `// Before init(): the style applies to every layer loaded after it.
map.style.setPredefinedStyle('${variant || 'google'}');`;
        case 'S04': return `map.updateRenderInfo('table_osm_buildings', { opacity: ${state.opacity || '0.75'} });
map.updateRenderInfo('salzburg-districts', {
  opacity: ${state['district-opacity'] || '0.30'},
  showBorders: ${state['show-borders'] !== 'false'},
});`;
        case 'B01': return `map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.updateRenderInfo('imagery', { isSkip: ${state['show-tiles'] === 'false'} });`;
        case 'B02': return `map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
map.loadCollection('table_osm_surface', { collection, type: 'polygons' });
// An opaque surface would cover the imagery beneath the vectors.
map.updateRenderInfo('table_osm_surface', { isSkip: true });`;
        case 'B03': return variant === 'rgb'
            ? `await db.loadGeoTiff({ geotiffFileUrl: '/data/lisbon-corine-2018-rgb.tif',
  sourceCrs: 'EPSG:4326', outputTableName: 'land_cover', resampleMethod: 'nearest' });
map.loadCollection('land_cover', {
  collection: await db.getRaster('land_cover'),
  type: 'raster',
  property: ['band_1', 'band_2', 'band_3'], // RGB bands
});`
            : `await db.loadGeoTiff({ geotiffFileUrl: '/data/lisbon-population-2020.tif',
  sourceCrs: 'EPSG:4326', outputTableName: 'population' });
map.loadCollection('population', {
  collection: await db.getRaster('population'),
  type: 'raster',
  property: 'band_1',
});`;
        case 'T01': return `map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });`;
        case 'T02': return `map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });`;
        case 'T03': return `map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
map.updateRenderInfo('table_osm_surface', { isSkip: true });
map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });`;
        case 'T04': return `await db.loadGeoTiff({ geotiffFileUrl: '/data/niteroi-elevation.tif',
  sourceCrs: 'EPSG:3395', outputTableName: 'elevation' });
map.loadTerrain({ source: { collection: await db.getRaster('elevation'), property: 'band_1' } });`;
        case 'P01': return plot('barchart', "{ axis: ['ntaname', 'shape_area'] }", 'CLICK');
        case 'P02': return plot('scatterplot', "{ axis: ['shape_area', 'shape_leng'] }", 'BRUSH');
        case 'P03': return plot('barchart', "{ axis: ['shape_area', '@transform'] }", 'BRUSH_X', "{ preset: 'binning-1d', options: { bins: 10 } }");
        case 'P04': return plot('heatmatrix', "{ axis: ['shape_area', 'shape_leng'], color: '@transform' }", 'CLICK', "{ preset: 'binning-2d' }");
        case 'P05': return plot('table', "{ axis: ['ntaname', 'shape_area', 'shape_leng'] }", 'CLICK', "{ preset: 'sort', options: { direction: 'asc' } }");
        case 'P06': return plot('parallel-coordinates', "{ axis: ['shape_area', 'shape_leng', 'cdta2020'] }", 'BRUSH_Y');
        case 'P07': return plot('linechart', "{ axis: ['sjoin.collect.noise', '@transform'] }", 'BRUSH_X',
            "{ preset: 'binning-events', options: { timestamp: 'date', resolution: 'day', reducer: 'count' } }", variant === 'roads' ? 'roads' : 'neighborhoods');
        case 'P08': return plot('boxplot', "{ axis: ['cdta2020', 'shape_area', '@transform'] }", 'CLICK', "{ preset: 'box-stats' }");
        case 'P09': return `const scatter = new AutkPlot(document.querySelector('#plotScatter')!, {
  type: 'scatterplot', collection, attributes: { axis: ['shape_area', 'shape_leng'] },
  events: [PlotEvent.BRUSH],
});
const histogram = new AutkPlot(document.querySelector('#plotHistogram')!, {
  type: 'barchart', collection, attributes: { axis: ['shape_area', '@transform'] },
  transform: { preset: 'binning-1d', options: { bins: 10 } },
  events: [PlotEvent.CLICK],
});

scatter.events.on(PlotEvent.BRUSH, ({ selection }) => {
  map.setSelection('neighborhoods', selection);
  histogram.setSelection(selection);
});`;
        case 'A01': return `await db.spatialQuery({
  tableRootName: 'neighborhoods',
  tableJoinName: 'noise',
  groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
});
map.updateThematic('neighborhoods', {
  collection: await db.getLayer('neighborhoods'),
  property: 'properties.sjoin.count.noise',
});
map.updateRenderInfo('neighborhoods', { isColorMap: true });`;
        case 'A02': return `const groupBy = [{ column: 'Unique Key', aggregateFn: 'count' }];
for (const table of ['noise', 'parking']) {
  await db.spatialQuery({ tableRootName: 'neighborhoods', tableJoinName: table, groupBy });
}
// Both counts are available on the same neighborhood collection.
const neighborhoods = await db.getLayer('neighborhoods');
const complaint = document.querySelector<HTMLSelectElement>('#select')!;
const updateThematic = () => map.updateThematic('neighborhoods', {
  collection: neighborhoods,
  property: \`properties.sjoin.count.\${complaint.value}\`,
});
updateThematic();
map.updateRenderInfo('neighborhoods', { isColorMap: true });
complaint.addEventListener('change', updateThematic);`;
        case 'A03': return `await db.spatialQuery({
  tableRootName: ${variant === 'buildings' ? "'table_osm_buildings'" : "'table_osm_roads'"},
  tableJoinName: 'noise',
  near: { distance: 200 },
  groupBy: [{ column: 'key', aggregateFn: 'count' }],
});`;
        case 'A04': return `await db.buildHeatmap({
  tableJoinName: 'noise',
  near: { distance: 200 },
  outputTableName: 'heatmap',
  grid: { rows: ${variant === 'fine' ? 120 : 60}, columns: ${variant === 'fine' ? 120 : 60} },
  smoothingSigma: ${variant === 'fine' ? 3 : 1.5},
  groupBy: [{ column: 'key', aggregateFn: 'count' }],
});
map.loadCollection('heatmap', {
  collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1',
});
map.updateRenderInfo('heatmap', { opacity: 0.5, isColorMap: true });`;
        case 'A05': return `const layer = ${variant === 'roads' ? "'table_osm_roads'" : "'neighborhoods'"};
const result = await new ComputeGpgpu().run({
  collection: await db.getLayer(layer),
  variableMapping: ${variant === 'roads' ? "{ road: 'geometry' }" : "{ x: 'shape_area', y: 'shape_leng' }"},
  resultField: 'result',
  wgslBody: ${variant === 'roads' ? `\`\n${ROAD_LENGTH_WGSL}\n\`` : "'return (4 * 3.1415927 * x) / (y * y);'"},
});
map.updateThematic(layer, { collection: result, property: 'properties.compute.result' });
map.updateRenderInfo(layer, { isColorMap: true });`;
        case 'A06': return `const result = await new ComputeRender().run({
  layers: [{ id: 'table_osm_buildings', collection: buildings, type: 'buildings' }],
  viewpoints: { collection: roads, sampling: { directions: 1 } },
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
});
// Each road viewpoint gets a share of sky in properties.compute.render.classes.sky.
map.updateThematic('table_osm_roads', {
  collection: result, property: 'properties.compute.render.classes.sky',
});`;
        case 'A07': return `const result = await new ComputeRender().run({
  layers: [
    { id: 'table_osm_parks', collection: parks, type: 'parks' },
    { id: 'table_osm_water', collection: water, type: 'water' },
  ],
  // One viewpoint per window of the picked building.
  viewpoints: { collection: picked, strategy: { type: 'building-windows', floors: 3 } },
  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
  tileSize: 32,
});`;
        case 'A08': return `const result = await new ComputeRender().run({
  layers: [{
    id: 'table_osm_buildings',
    collection: scene,
    type: 'buildings',
    objectIdProperty: '_renderObjectId',
  }],
  viewpoints: { collection: picked, sampling: { directions: 36 } },
  aggregation: { type: 'objects' },
  tileSize: 64,
});
// Each viewpoint reports every sampled building under compute.render.objects.
const objects = result.features[0].properties?.compute?.render?.objects ?? {};`;
        default: throw new Error(`Missing code excerpt for ${id}`);
    }
}

function plot(type: string, attributes: string, event: string, transform?: string, layer = 'neighborhoods'): string {
    const brush = event !== 'CLICK';
    const events = (brush ? [event, 'HOVER'] : ['CLICK', 'HOVER']).map(name => `PlotEvent.${name}`).join(', ');
    const selectionLink = brush
        ? `plot.events.on(PlotEvent.${event}, ({ selection }) => map.setSelection('${layer}', selection));`
        : `plot.events.on(PlotEvent.CLICK, ({ selection }) => map.setSelection('${layer}', selection));`;
    return `const plot = new AutkPlot(document.querySelector('#plotBody')!, {
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
