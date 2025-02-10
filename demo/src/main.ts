import { UtkPyData, ToyExample, ParksExample, ApiExample } from './dataset';

import { UtkMap } from 'utkmap';

async function main(ex: string = 'utk') {
    const canvas = <HTMLCanvasElement>document.querySelector('#wgpu');
    canvas.width = canvas.height = 1024;

    console.time("UtMap initialization")
    //----------------------------------------
    const map = new UtkMap(canvas);
    await map.init();
    //----------------------------------------
    console.timeEnd("UtMap initialization")

    if (ex === 'toy') {
        const data = new ToyExample();
        data.loadData();

        map.createCamera(data.cameraData);
        map.createLayer(data.layerInfo[0], data.layerRenderInfo[0], data.layerData[0]);
    }
    if (ex === 'utk') {
        const folder = 'manhattan';
        const layers = ['surface', 'water', 'parks', 'roads', 'buildings'];
        // const layers = ['buildings'];

        const utkpy = new UtkPyData(folder, layers);
        await utkpy.loadData();

        map.createCamera(utkpy.cameraData);
        for (let id = 0; id < layers.length; id++) {
            map.createLayer(utkpy.layerInfo[id], utkpy.layerRenderInfo[id], utkpy.layerData[id]);
        }
    }
    if (ex === 'parks') {
        // pbf extract creation on win, linux and mac
        // https://docs.opentripplanner.org/en/v2.1.0/Preparing-OSM/#cropping-osm-data

        const data = new ParksExample('http://localhost:5173/data/lower-mn.osm.pbf');
        await data.loadData();

        map.createCamera(data.cameraData);
        map.createLayer(data.layerInfo[0], data.layerRenderInfo[0], data.layerData[0]);
    }
    if (ex === 'api') {
        const data = new ApiExample('http://localhost:5173/data/lower-mn.osm.pbf', ['parks']);
        await data.loadData();
    }

    map.render()
}

main('parks');
