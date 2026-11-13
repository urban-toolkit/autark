import { runExample } from '../example';
import { TilesBasemap } from './tiles-example';

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new TilesBasemap().run(canvas);
}
void runExample(main, true);
