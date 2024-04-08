import { utk } from 'utk';

import { utkDb } from 'utkdb';
import { utkRun } from 'utkrun';

import { MapView } from 'utkmap';


console.log(utk());
console.log(utkDb());
console.log(utkRun());

const canvas = document.querySelector("#wgpu") as HTMLCanvasElement;
canvas.width = canvas.height = 640;

const map = new MapView(canvas);
