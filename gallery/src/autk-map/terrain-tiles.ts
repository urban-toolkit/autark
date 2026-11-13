import { runExample } from '../example';
import { TerrainTiles } from './terrain-example';

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new TerrainTiles().run(canvas);
}
void runExample(main, true);
