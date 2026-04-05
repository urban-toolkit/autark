import { AutkMap } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class StandaloneGeojsonVis {
    protected map!: AutkMap;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        const neighs = await fetch(`${URL}data/mnt_neighs_proj.geojson`).then(res => res.json());
        const points = await fetch(`${URL}data/mnt_points_test_proj.geojson`).then(res => res.json());

        this.map.loadCollection({ id: 'neighborhoods', collection: neighs });
        this.map.loadCollection({ id: 'points', collection: points });

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
