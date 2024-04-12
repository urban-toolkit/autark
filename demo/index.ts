import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { UtkMap } from 'utkmap';

import { UtkPyParser, ToyExample } from './dataset';

console.log(utk());
console.log(utkDb());
console.log(utkRun());

async function main(data: any) {
    const canvas = <HTMLCanvasElement>document.querySelector("#wgpu");
    canvas.width = canvas.height = 1024;
    
    const map = new UtkMap(canvas);
    await map.init();

    map.loadLayer(data.layerInfo, data.layerRenderInfo, data.layerData);
    map.render();
}


const toy = new ToyExample();
toy.loadData();

const parks = new UtkPyParser('manhattan', 'parks');
parks.loadData();

main(toy);

