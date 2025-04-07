// Utk Serveless Examples
//
// Utk Serveless requires pbf files.
// You can find instructions on how to create pbf files from OSM data here:
//
// https://docs.opentripplanner.org/en/v2.1.0/Preparing-OSM/#cropping-osm-data
//
// In the example below, we are using a pbf file of lower Manhattan, New York City, defined by the following bounding box:
// -74.0217296397,40.6989916231,-74.0005168092,40.7131479624
//
// You can create this pbf file using the following command:
// osmium extract --strategy complete_ways --bbox -74.0217296397,40.6989916231,-74.0005168092,40.7131479624 new-york-latest.osm.pbf -o lower-mn.osm.pbf

import { LayerType, UtkMap } from 'utkmap';

import { DbStandalone } from './dbStandalone';
import { DbMapIntegration } from './dbMapIntegration';

async function runDbMapIntegration() {
  const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
  canvas.width = canvas.height = 1280;

  const map = new UtkMap(canvas);
  await map.init();

  const db = new DbMapIntegration();
  await db.init();

  await db.loadOsm();
  await db.loadCustomLayer();

  // await db.loadCsv();
  // await db.spatialJoin();

  const layers = await db.exportLayers();

  // TODO: Get origin from db
  const origin = [-8239012.438994927, 4941135.512524911, 0];

  console.log({
    bBox: db.loadOsmBoundingBox(),
  });
  // const bBox = db.getBoundingBox();
  // map.setOrigin(bBox);

  for (const json of layers) {
    map.loadGeoJsonLayer(json.data, origin, (json.name.split('_')[2] || json.name) as LayerType);
    // map.loadGeoJsonLayer(json.data, json.type as LayerType);
  }

  map.draw();
}

async function runDbStandalone() {
  const db = new DbStandalone();
  await db.init();
  await db.spatialJoin();
}

//Set to true to run the map integration demo
const MAP_DEMO = true;

if (MAP_DEMO) {
  runDbMapIntegration();
} else {
  runDbStandalone();
}

// TODO:
// 2. source: osm, geojson, csv
// 3. type: osm (water, parks, etc), geojson (2dLayer), csv (Pointset)
// 4. Crop data on db?
