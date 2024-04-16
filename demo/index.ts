import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { UtkMap } from 'utkmap';

import { UtkPyData, ToyExample } from './dataset';

console.log(utk());
console.log(utkDb());
console.log(utkRun());

async function main(ex: string = 'utk') {
    const canvas = <HTMLCanvasElement>document.querySelector("#wgpu");
    canvas.width = canvas.height = 1024;
    
    const map = new UtkMap(canvas);
    await map.init();

    if(ex == 'toy') {
        const data = new ToyExample();
        data.loadData();

        map.loadCamera(data.cameraData);
        map.loadLayer(data.layerInfo[0], data.layerRenderInfo[0], data.layerData[0]);
        map.render();
        }
    else {
        const folder = 'manhattan';
        const layers = ['parks', 'water','surface'];

        const utkpy = new UtkPyData(folder, layers);
        await utkpy.loadData();

        map.loadCamera(utkpy.cameraData);
        for (let id = 0; id < layers.length; id++) {
            map.loadLayer(utkpy.layerInfo[id], utkpy.layerRenderInfo[id], utkpy.layerData[id]);
        }
        map.render();
    }
}

main('utk');

