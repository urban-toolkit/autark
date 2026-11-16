/** The core API calls for each task; the full runnable program is under "View full source". */
export function exampleCode(id: string, state: Record<string, string>): string {
    const provider = state['source-select'] || 'osmLight';
    const variant = state.variant;
    switch (id) {
        case 'D01': {
            const [layer, type, tune] = variant === 'lines' ? ['neighborhood-boundaries', ", type: 'polylines'", "map.updateRenderInfo('neighborhood-boundaries', { polylinesWidth: 120 });\n"]
                : variant === 'points' ? ['neighborhood-centers', ", type: 'points'", "map.updateRenderInfo('neighborhood-centers', { pointSize: 160 });\n"]
                    : ['neighborhoods', '', ''];
            return `map.loadCollection('${layer}', { collection${type} });\n${tune}map.fitBounds();\nmap.draw();`;
        }
        case 'D02': return `map.loadCollection('neighborhoods', {\n  collection,\n  sourceCrs: '${state.source || 'EPSG:4326'}',\n});`;
        case 'D03': return `await db.loadGeojson({ ${variant === 'memory' ? 'geojsonObject: collection' : "geojsonFileUrl: '/data/mnt_neighs.geojson'"}, outputTableName: 'neighborhoods' });\nmap.loadCollection('neighborhoods', { collection: await db.getLayer('neighborhoods') });`;
        case 'D04': return `await db.${state.format === 'json' ? 'loadJson' : 'loadCsv'}({\n  ${state.format === 'json' ? 'jsonObject: rows' : "csvFileUrl: '/data/parks.csv'"},\n  outputTableName: 'parks',\n  geometryColumns: ${state.geometry === 'wkt' ? "{ wktColumnName: 'wkt' }" : "{ latColumnName: 'Latitude', longColumnName: 'Longitude' }"},\n});`;
        case 'D05': return `await db.loadOsm({\n  queryArea: ${variant === 'place' ? "{ geocodeArea: 'New York', areas: ['Battery Park City', 'Financial District'] }" : '{ bbox: [-74.019, 40.700, -74.003, 40.714] }'},\n  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },\n});`;
        case 'D06': return `await db.loadOsm({\n  pbfFileUrl: '/data/niteroi.osm.pbf',\n  queryArea: { bbox: ${state.extent === 'clipped' ? '[-43.13, -22.95, -43.08, -22.88]' : '[-43.14, -22.97, -43.03, -22.85]'} },\n  autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },\n});`;
        case 'D07': return "await db.setWorkspace('battery_park_city');\nawait db.loadOsm({ pbfFileUrl: '/data/lower_mnt.osm.pbf', queryArea: { bbox }, autoLoadLayers: { layers } });\nawait db.setWorkspace('financial_district');";
        case 'I01': return "map.updateRenderInfo('table_osm_buildings', { isPick: true });\nmap.events.on(MapEvent.PICKING, ({ selection, layerId }) => {\n  map.setHighlightedIds(layerId, selection);\n});";
        case 'I02': return "map.setSkippedIds('table_osm_buildings', [id]);   // hide\nmap.clearSkippedIds('table_osm_buildings');      // restore all";
        case 'I03': return "map.setView({ center: { latitude: 40.7831, longitude: -73.9712 }, zoom: 12 });\nmap.fitBounds();\nawait new CameraMotion().zoomOut(1.5, 1).pitch(-35, 1).yaw(20, 1).play(map.camera);";
        case 'S01': return `map.updateColorMap('roads', { colorMap: {\n  interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,\n  domainSpec: { type: ColorMapDomainStrategy.USER, params: ${variant === 'numeric' ? '[3, 1, 2]' : "['primary', 'secondary', 'other']"} },\n} });\nmap.updateThematic('roads', { collection: roads, property: 'properties.highway' });`;
        case 'S02': return `map.updateColorMap('neighborhoods', { colorMap: {\n  interpolator: ColorMapInterpolator.${variant === 'sequential' ? 'SEQ_VIRIDIS' : 'DIV_SPECTRAL'},\n  domainSpec: { type: ColorMapDomainStrategy.PERCENTILE },\n} });\nmap.updateThematic('neighborhoods', { collection, property: 'properties.shape_area' });`;
        case 'S03': return variant === 'custom'
            ? "map.style.setCustomStyle({\n  surface: '#eee8db', parks: '#c4d9b0', water: '#b6d7e8',\n  roads: '#fff', buildings: '#c8b9a7', ...\n});"
            : `map.style.setPredefinedStyle('${variant || 'apple'}');`;
        case 'S04': return `map.updateRenderInfo('neighborhoods', {\n  opacity: ${state.opacity || '0.75'},\n  showBorders: ${state['show-borders'] !== 'false'},\n});`;
        case 'B01': return `map.loadTiles('imagery', { source: TILE_SOURCES.${provider} });\nmap.updateRenderInfo('imagery', { isSkip: ${state['show-tiles'] === 'false'} });`;
        case 'B02': return "map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });\n// An opaque surface would cover the imagery beneath the vectors.\nmap.updateRenderInfo('table_osm_surface', { isSkip: true });";
        case 'B03': return variant === 'rgb'
            ? "await db.loadGeoTiff({ geotiffFileUrl: '/data/rgb-imagery.tif', coordinateFormat: 'EPSG:32618', outputTableName: 'image' });\nmap.loadCollection('image', { collection: await db.getRaster('image'), type: 'raster', property: ['band_1', 'band_2', 'band_3'] });"
            : "await db.loadGeoTiff({ geotiffFileUrl: '/data/mnt_dem.tif', coordinateFormat: 'EPSG:3857', outputTableName: 'image' });\nmap.loadCollection('image', { collection: await db.getRaster('image'), type: 'raster', property: 'band_1' });";
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
