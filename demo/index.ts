import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { MapStyle, UtkMap } from 'utkmap';

import { UtkPyData, ToyExample } from './dataset';

console.log(utk());
console.log(utkDb());
console.log(utkRun());

async function main(ex: string = 'utk') {
    const canvas = <HTMLCanvasElement>document.querySelector("#wgpu");
    canvas.width = canvas.height = 1024;

    const map = new UtkMap(canvas);
    await map.init();

    if (ex == 'toy') {
        const data = new ToyExample();
        data.loadData();

        map.createCamera(data.cameraData);
        map.createLayer(data.layerInfo[0], data.layerRenderInfo[0], data.layerData[0]);
    }
    if (ex == 'utk') {
        const folder = 'manhattan';
        const layers = ['surface', 'water', 'parks', 'roads'];

        const utkpy = new UtkPyData(folder, layers);
        await utkpy.loadData();

        map.createCamera(utkpy.cameraData);
        for (let id = 0; id < layers.length; id++) {
            map.createLayer(utkpy.layerInfo[id], utkpy.layerRenderInfo[id], utkpy.layerData[id]);
        }
    }
    map.render();
}

main('utk');

