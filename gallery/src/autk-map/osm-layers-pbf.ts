import { runExample } from '../example';
import { OsmLayersApi } from './osm-layers-pbf-example';
export { OsmLayersApi } from './osm-layers-pbf-example';

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas);
}
void runExample(main);
