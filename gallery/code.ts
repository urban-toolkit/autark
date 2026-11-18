/** The core API calls for each task; the full runnable program is under "View full source". */
export function exampleCode(id: string, state: Record<string, string>): string {
    const provider = state['source-select'] || 'osmLight';
    const variant = state.variant;
    switch (id) {
        case 'D01': {
            const [layer, type, tune] = variant === 'lines' ? ['neighborhood-boundaries', ", type: 'polylines'", "map.updateRenderInfo('neighborhood-boundaries', { polylinesWidth: 120 });\n"]
                : variant === 'points' ? ['neighborhood-centers', ", type: 'points'", "map.updateRenderInfo('neighborhood-centers', { pointSize: 160 });\n"]
                    : ['neighborhoods', '', ''];
            return `new AutkMap(canvas, { showUi: false });\nmap.loadCollection('${layer}', { collection${type} });\n${tune}map.fitBounds();\nmap.draw();`;
        }
        case 'D02': return `new AutkMap(canvas, { crs: '${state.crs || 'EPSG:3395'}', showUi: false });\nmap.loadCollection('community-areas', { collection, sourceCrs: 'EPSG:4326' });`;
        case 'D03': {
            const city = state.workspace || 'paris';
            const [workspace, load, layer] = city === 'new_york'
                ? ['new_york', "geojsonObject: collection", 'neighborhoods']
                : city === 'chicago'
                    ? ['chicago', "geojsonObject: collection", 'community_areas']
                    : ['paris', "geojsonFileUrl: '/data/paris-arrondissements.geojson'", 'arrondissements'];
            return `await db.setWorkspace('${workspace}');\nawait db.loadGeojson({ ${load}, outputTableName: '${layer}' });\nmap.loadCollection('${layer}', { collection: await db.getLayer('${layer}'), type: 'polygons' });`;
        }
        case 'D04': return `await db.loadCsv({
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
});`;
        case 'D05': return `await db.loadOsm({
  queryArea: ${variant === 'place' ? "{ geocodeArea: 'Comunidad de Madrid', areas: ['Sol'] }" : '{ bbox: [-3.7089, 40.4135, -3.6992, 40.4204] }'},${variant === 'tags' ? "\n  tagSets: [\n    { name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] },\n  ]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});${variant === 'tags' ? "\nmap.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });" : ''}`;
        case 'D06': return `await db.loadOsm({
  pbfFileUrl: '/data/monaco.osm.pbf',
  queryArea: ${variant === 'place' || variant === 'tags' ? "{ geocodeArea: 'Monaco', areas: ['Monaco'] }" : '{ bbox: [7.405, 43.720, 7.445, 43.7525] }'},${variant === 'tags' ? "\n  tagSets: [\n    { name: 'cafes', type: 'points', tags: [{ key: 'amenity', value: 'cafe' }] },\n  ]," : ''}
  autoLoadLayers: { layers: ${variant === 'tags' ? "['surface', 'parks', 'water', 'roads']" : "['surface', 'parks', 'water', 'roads', 'buildings']"} },
});${variant === 'tags' ? "\nmap.updateRenderInfo('table_osm_cafes_points', { pointSize: 20 });" : ''}`;
        case 'I01': return `const map = new AutkMap(canvas, { showUi: false });\nmap.updateRenderInfo('buildings', { isPick: true });\nmap.events.on(MapEvent.PICKING, ({ selection }) => {\n  // Each click toggles one id, so the selection keeps growing.\n  summarize(selection.map(id => buildings.features[id]));\n});`;
        case 'I02': return "map.setSkippedIds('buildings', [id]);\nmap.clearSkippedIds('buildings');";
        case 'I03': return `// Update the eye and look-at target on each animation frame.
map.camera.resetCamera([0, 0, 1], lookAt, eye);
map.requestRender();`;
        case 'S01': return variant === 'category'
            ? `map.updateColorMap('ortsteile', { colorMap: {\n  interpolator: ColorMapInterpolator.CAT_PAIRED,\n  domainSpec: { type: ColorMapDomainStrategy.USER, params: BERLIN_BEZIRKE },\n} });\nmap.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.bezirk' });\nmap.updateRenderInfo('ortsteile', { isColorMap: true });`
            : `map.updateColorMap('ortsteile', { colorMap: {\n  interpolator: ColorMapInterpolator.${variant === 'diverging' ? 'DIV_RED_BLUE' : 'SEQ_BLUES'},\n  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },\n} });\nmap.updateThematic('ortsteile', { collection: ortsteile, property: 'properties.area_km2' });\nmap.updateRenderInfo('ortsteile', { isColorMap: true });`;
        case 'S03': return `map.style.setPredefinedStyle('${variant || 'google'}');`;
        case 'S04': return `map.updateRenderInfo('table_osm_buildings', { opacity: ${state.opacity || '0.75'} });\nmap.updateRenderInfo('salzburg-districts', { opacity: ${state['district-opacity'] || '0.30'}, showBorders: ${state['show-borders'] !== 'false'} });`;
        case 'B01': return `map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });\nmap.updateRenderInfo('imagery', { isSkip: ${state['show-tiles'] === 'false'} });`;
        case 'B02': return "map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });\n// An opaque surface would cover the imagery beneath the vectors.\nmap.updateRenderInfo('table_osm_surface', { isSkip: true });";
        case 'B03': return variant === 'rgb'
            ? "await db.loadGeoTiff({ geotiffFileUrl: '/data/lisbon-corine-2018-rgb.tif', coordinateFormat: 'EPSG:4326', outputTableName: 'imagery' });\nmap.loadCollection('imagery', { collection: await db.getRaster('imagery'), type: 'raster', property: ['band_1', 'band_2', 'band_3'], loadConfig: { rgbRange: [0, 255] } });\nmap.updateRenderInfo('imagery', { opacity: " + (state['raster-opacity'] ?? '0.78') + " });"
            : "await db.loadGeoTiff({ geotiffFileUrl: '/data/lisbon-population-2020.tif', coordinateFormat: 'EPSG:4326', outputTableName: 'population' });\nmap.loadCollection('population', { collection: await db.getRaster('population'), type: 'raster', property: 'band_1' });\nmap.updateRenderInfo('population', { opacity: " + (state['raster-opacity'] ?? '0.78') + " });";
        case 'T01': return "map.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });";
        case 'T02': return `map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });\nmap.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });`;
        case 'T03': return "map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });\nmap.updateRenderInfo('table_osm_surface', { isSkip: true });\nmap.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium });";
        case 'T04': return "await db.loadGeoTiff({ geotiffFileUrl: '/data/niteroi-elevation.tif', coordinateFormat: 'EPSG:3395', outputTableName: 'elevation' });\nmap.loadTerrain({ source: { collection: await db.getRaster('elevation'), property: 'band_1' } });";
        case 'P01': return plot('barchart', "{ axis: ['ntaname', 'shape_area'] }", 'PlotEvent.CLICK');
        case 'P02': return plot('scatterplot', "{ x: 'shape_area', y: 'shape_leng' }", 'PlotEvent.BRUSH');
        case 'P03': return plot('barchart', "{ axis: ['shape_area', '@transform'] }", 'PlotEvent.BRUSH_X', "{ preset: 'binning-1d', options: { bins: 10 } }");
        case 'P04': return plot('heatmatrix', "{ x: 'boroname', y: 'ntatype' }", 'PlotEvent.CLICK');
        case 'P05': return plot('table', "{ columns: ['ntaname', 'shape_area'] }", 'PlotEvent.CLICK');
        case 'P06': return plot('parallel-coordinates', "{ axis: ['shape_area', 'shape_leng', 'borocode'] }", 'PlotEvent.CLICK');
        case 'P07': return plot('temporal-events', "{ axis: ['timestamp'] }", 'PlotEvent.CLICK');
        case 'P08': return plot('timeseries', "{ axis: ['timestamp', 'value'] }", 'PlotEvent.CLICK');
        case 'A01': return "await db.spatialQuery({\n  tableRootName: 'neighborhoods', tableJoinName: 'noise',\n  groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],\n});\nmap.updateThematic('neighborhoods', { collection, property: 'properties.sjoin.count.noise' });";
        case 'A02': return "for (const table of ['noise', 'parking']) {\n  await db.spatialQuery({ tableRootName: 'neighborhoods', tableJoinName: table, groupBy });\n}";
        case 'A03': return `await db.spatialQuery({\n  tableRootName: ${variant === 'buildings' ? "'table_osm_buildings'" : "'table_osm_roads'"},\n  tableJoinName: 'noise', near: { distance: 1000 }, groupBy,\n});`;
        case 'A04': return `await db.buildHeatmap({\n  tableJoinName: 'noise', near: { distance: 1000 }, outputTableName: 'heatmap',\n  grid: { rows: ${variant === 'fine' ? 60 : 30}, columns: ${variant === 'fine' ? 60 : 30} },\n  groupBy,\n});\nmap.loadCollection('heatmap', { collection: await db.getRaster('heatmap'), type: 'raster', property: 'band_1' });`;
        case 'A05': return `const result = await new ComputeGpgpu().run({\n  collection,\n  variableMapping: ${variant === 'roads' ? "{ x: 'lanes' }" : "{ x: 'shape_area', y: 'shape_leng' }"},\n  resultField: 'result',\n  wgslBody: '${variant === 'roads' ? 'return x;' : 'return (4 * 3.1415927 * x) / (y * y);'}',\n});`;
        case 'A06': case 'A07': case 'A08': return "const result = await new ComputeRender().run({\n  layers: [{ id, collection, type }],\n  viewpoints: { collection: roads, sampling: { directions: 1 } },\n  aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },\n});";
        default: throw new Error(`Missing code excerpt for ${id}`);
    }
}

function plot(type: string, attributes: string, event: string, transform?: string): string {
    return `const plot = new AutkPlot(document.querySelector('#plot')!, {\n  type: '${type}',\n  collection,\n  attributes: ${attributes},${transform ? `\n  transform: ${transform},` : ''}\n  events: [${event}],\n});\n\nmap.events.on(MapEvent.PICKING, ({ selection }) => plot.setSelection(selection));\nplot.events.on(${event}, ({ selection }) => map.setHighlightedIds('neighborhoods', selection));`;
}
