import { runExample } from '../example';
import { TilesCategoricalExample } from './tiles-categorical-example';

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new TilesCategoricalExample().run(canvas);
}
void runExample(main, true);
