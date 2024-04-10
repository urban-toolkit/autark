import { utk } from 'utk';
import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { UtkMap } from 'utkmap';

console.log(utk());
console.log(utkDb());
console.log(utkRun());

async function main() {
    const canvas = <HTMLCanvasElement>document.querySelector("#wgpu");
    canvas.width = canvas.height = 1024;
    
    const map = new UtkMap(canvas);
    await map.init();
    map.render();
}

main();

