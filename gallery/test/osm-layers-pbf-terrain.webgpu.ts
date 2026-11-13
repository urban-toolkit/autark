import { checkPbfBasemap } from './osm-layers-pbf-basemap.webgpu';

export async function runWebGpuCases() { return checkPbfBasemap({ terrain: true }); }
