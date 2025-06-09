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
import { UtkPlotVega } from 'utkplot';

import { DbStandalone } from './dbStandalone';
import { DbMapIntegration } from './dbMapIntegration';
import { Feature } from 'geojson';

async function runDbMapIntegration() {
    const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
    canvas.width = canvas.height = canvas.parentElement?.clientHeight || 800;

    console.log('Running map integration demo');

    // Database ------
    const db = new DbMapIntegration();
    await db.init();

    // Load Data -----
    await db.loadOsm();
    await db.loadCsv();
    await db.loadCustomLayer();

    // Map -----------
    const bb = await db.loadOsmBoundingBox();
    const map = new UtkMap(canvas);
    await map.init(bb);
    map.draw();

    // Load Layers ---
    const layers = await db.exportLayers();
    for (const json of layers) {
        console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
        map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
    }

    // Spatial Join ---
    await db.spatialJoin();
    const thematic = await db.updateThematicData("neighborhoods");
    map.updateLayerThematic('neighborhoods', thematic);

    // Opacity
    map.updateLayerOpacity('neighborhoods', 0.75);
    map.updateLayerOpacity('table_osm_buildings', 0.75);

    // // Spatial Join Roads
    // await db.spatialJoinNear("table_osm_roads");
    // const thematicRoads = await db.updateThematicData("table_osm_roads");
    // map.updateLayerThematic('table_osm_roads', thematicRoads);

    console.log('Map integration demo completed');

    console.log("utkplot initialized");

    // Utk Plot
    const div = <HTMLElement>document.querySelector('#plot');
    const vegaSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        description: 'A simple bar chart with embedded data.',
        data: {
            values: [],
        },
        selection: {
            "click": { "type": "single" }
        },
        width: 700,
        height: 400,
        mark: 'bar',
        encoding: {
            x: { field: 'ntaname', type: 'ordinal' },
            y: { field: 'sjoin.count', type: 'quantitative' },
            color: {
                condition: {
                    selection: "click",
                    value: "#5dade2"
                },
                "value": "lightgray"
            }
        },
    };

    const plot = new UtkPlotVega(div, vegaSpec);

    const data = (await db.getLayer('neighborhoods')).features.map((f: Feature) => {
        return f.properties;
    });
    plot.loadData(data);
    plot.mapCallback = (selection: number[]) => {
        const layer = map.layerManager.searchByLayerId('neighborhoods');
        
        if(layer) {
            layer.layerRenderInfo.isPick = true;

            layer.clearHighlighted();
            layer.setHighlighted(selection);

            console.log("Selection updated:", selection);
        }
    };

    plot.draw();
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
