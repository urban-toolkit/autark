import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { UtkMap } from 'utkmap';

import { UtkPyParser, ToyExample } from './dataset';

console.log(utk());
console.log(utkDb());
console.log(utkRun());

async function main(ex: string = 'utk') {
    let data = null;
    
    if(ex == 'toy') {
        data = new ToyExample();
        data.loadData();
    }
    else {
        data = new UtkPyParser('manhattan', 'parks');
        await data.loadData();
    }

    const canvas = <HTMLCanvasElement>document.querySelector("#wgpu");
    canvas.width = canvas.height = 1024;
    
    const map = new UtkMap(canvas);
    await map.init();

    map.loadCamera(data.cameraData);
    map.loadLayer(data.layerInfo, data.layerRenderInfo, data.layerData);
    map.render();
}

main('toy');

