import { UtkPyData, ToyExample, UtkDbExample } from './dataset';

import { LayerType, UtkMap } from 'utkmap';

async function legacy(ex: string = 'utk') {
    const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
    canvas.width = canvas.height = 1024;

    const map = new UtkMap(canvas);
    await map.init();

    if (ex === 'toy') {
        const data = new ToyExample();
        data.loadData();

        map.createCamera(data.cameraData);
        map.createLayer(data.layerInfo[0], data.layerRenderInfo[0], data.layerData[0]);
    }

    if (ex === 'utk') {
        const folder = 'manhattan';
        const layers = ['surface', 'water', 'parks', 'roads', 'buildings'];

        const utkpy = new UtkPyData(folder, layers);
        await utkpy.loadData();

        map.createCamera(utkpy.cameraData);
        for (let id = 0; id < layers.length; id++) {
            map.createLayer(utkpy.layerInfo[id], utkpy.layerRenderInfo[id], utkpy.layerData[id]);
        }
    }

    map.draw()
}

async function run() {
    const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
    canvas.width = canvas.height = 1024;

    const map = new UtkMap(canvas);
    await map.init();

    // https://docs.opentripplanner.org/en/v2.1.0/Preparing-OSM/#cropping-osm-data
    const db = new UtkDbExample('http://localhost:5173/data/lower-mn.osm.pbf', 'manhattan', [LayerType.OSM_PARKS, LayerType.OSM_WATER]);
    await db.loadData();

    const layers = await db.exportLayers();
    const origin = [-8239012.438994927, 4941135.512524911, 1]; //TODO: await.db.getOrigin();

    for (const json of layers) {
        map.loadGeoJsonLayer(json.data, origin, json.name as LayerType);
    }

    map.draw();
}

run();

// legacy("utk")