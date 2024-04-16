import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { UtkMap } from 'utkmap';

import { UtkPyParser, ToyExample } from './dataset';

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
        map.loadLayer(data.layerInfo, data.layerRenderInfo, data.layerData);
        map.render();
        }
    else {
        const parks = new UtkPyParser('manhattan', 'parks');
        await parks.loadData();
        const water = new UtkPyParser('manhattan', 'water');
        await water.loadData();

        map.loadCamera(parks.cameraData);
        map.loadLayer(water.layerInfo, water.layerRenderInfo, water.layerData);
        map.loadLayer(parks.layerInfo, parks.layerRenderInfo, parks.layerData);
        map.render();
    }

}

main('to');

