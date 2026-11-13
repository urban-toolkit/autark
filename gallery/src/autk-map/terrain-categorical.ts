import { runExample } from '../example';
import { TerrainCategoricalExample } from './terrain-categorical-example';

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new TerrainCategoricalExample().run(canvas);
}
void runExample(main, true);
