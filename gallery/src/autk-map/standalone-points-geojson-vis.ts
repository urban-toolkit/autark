import { AutkMap } from 'autk-map';

export class StandaloneGeojsonVis {
    protected map!: AutkMap;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        const neighs = await fetch('http://localhost:5173/data/mnt_neighs_proj.geojson').then(res => res.json());
        const points = await fetch('http://localhost:5173/data/mnt_points_test_proj.geojson').then(res => res.json());

        this.map.loadGeoJsonLayer('neighborhoods', neighs);
        this.map.loadGeoJsonLayer('points', points);

        this.map.draw();
    }
}

async function main() {
    const example = new StandaloneGeojsonVis();

    const canvas = document.querySelector('canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    await example.run(canvas);
}
main();
