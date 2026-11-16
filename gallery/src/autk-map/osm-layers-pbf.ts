import { runExample, exampleVariant } from '../example';
import { OsmLayersApi } from './osm-layers-pbf-example';
export { OsmLayersApi } from './osm-layers-pbf-example';

async function main() {
    exampleVariant('Extract extent', { full: 'City extract', clipped: 'Bounding-box filter' }, 'extent');
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas);
}
void runExample(main);
