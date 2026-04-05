import { AutkMap } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class StandaloneGeojsonVis {
    protected map!: AutkMap;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        const geojson = await fetch(`${URL}data/mnt_neighs_proj.geojson`).then(res => res.json());
        this.map.loadCollection({ id: 'neighborhoods', collection: geojson });

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
