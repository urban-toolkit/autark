import { LayerType, UtkMap } from 'utkmap';

import { UtkDbExample } from './dataset';

async function run() {
    const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
    canvas.width = canvas.height = 1280;

    const map = new UtkMap(canvas);
    await map.init();

    // https://docs.opentripplanner.org/en/v2.1.0/Preparing-OSM/#cropping-osm-data
    // bbox: -74.0217296397,40.6989916231,-74.0005168092,40.7131479624
    // command: osmium extract --strategy complete_ways --bbox -74.0217296397,40.6989916231,-74.0005168092,40.7131479624 new-york-latest.osm.pbf -o lower-mn.osm.pbf

    const db = new UtkDbExample('http://localhost:5173/data/lower-mn.osm.pbf', 'manhattan', [LayerType.OSM_COASTLINE]);
    // const db = new UtkDbExample('http://localhost:5173/data/lower-mn.osm.pbf', 'manhattan', [LayerType.OSM_COASTLINE, LayerType.OSM_PARKS, LayerType.OSM_WATER, LayerType.OSM_BUILDINGS]);
    await db.loadData();

    const layers = await db.exportLayers();
    const origin = [-8239012.438994927, 4941135.512524911, 0]; //TODO: await.db.getOrigin();

    for (const json of layers) {
        map.loadGeoJsonLayer(json.data, origin, json.name as LayerType);
    }

    map.draw();
}

run();

// TODO LIST

// Roads
// Coastline

// CHECK
// def get_overpass_filters(layer_type):
// osm.py - linha 1292

// Load de geojson fora do OSM como uma layer.
// Ex: Bairros
// Tratar os GeoJsons gerais (atualmente só estamos lendo lista de linestrings)

// Load csv (que passe pelos parques/bairros)
// Join parques/bairros (count, média)

// Thematic data API
