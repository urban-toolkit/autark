import { AutkMap, LayerType } from 'autk-map';

export class StandaloneGeojsonVis {
    protected map!: AutkMap;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        const geojson = await fetch('http://localhost:5173/data/mnt_neighs_proj.geojson').then(res => res.json());
        this.map.loadGeoJsonLayer('neighborhoods', LayerType.BOUNDARIES_LAYER, geojson);

        this.map.draw();
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const example = new StandaloneGeojsonVis();
    await example.run(canvas);
}
main();
