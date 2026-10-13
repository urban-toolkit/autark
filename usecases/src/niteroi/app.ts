import { NiteroiData } from './data';
import { computeLstRegression } from './compute';
import { NiteroiMap } from './map';
import { NiteroiPlots } from './plot';
import { ROADS_LAYER, START_YEAR, yearBand, type ColorMode } from './config';

export class NiteroiApp {
    private readonly data = new NiteroiData();
    private map!: NiteroiMap;
    private plots!: NiteroiPlots;
    private roads!: Awaited<ReturnType<typeof computeLstRegression>>;
    private raster!: Awaited<ReturnType<NiteroiData['db']['getRaster']>>;
    private selectionTimer: ReturnType<typeof setTimeout> | undefined;
    private mode: ColorMode = 'angle';
    private year = START_YEAR;

    public async init(args: {
        canvas: HTMLCanvasElement;
        scatterHost: HTMLElement;
        lineHost: HTMLElement;
        onProgress: (message: string, note?: string) => void;
    }): Promise<void> {
        await this.data.load(args.onProgress);
        args.onProgress('Running GPU regression...');
        this.roads = await computeLstRegression(await this.data.db.getLayer(ROADS_LAYER));
        this.raster = await this.data.db.getRaster('lst');
        args.onProgress('Initializing map...');
        this.map = new NiteroiMap(args.canvas);
        await this.map.init(this.data.db.getLayersMetadata(), (name) => this.data.db.getLayer(name), this.roads, this.raster);
        this.plots = new NiteroiPlots(args.scatterHost, args.lineHost, this.roads);
        // The app owns linked selection: neither view imports the other.
        this.map.onSelection((ids) => {
            clearTimeout(this.selectionTimer);
            this.plots.setSelection(ids);
            this.plots.updateTimeseries(ids);
        });
        this.plots.onSelection((ids) => {
            this.map.highlight(ids);
            clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => this.plots.updateTimeseries(ids), 200);
        });
        this.updateThematic();
    }

    public changeMode(mode: ColorMode): void {
        this.mode = mode;
        this.updateThematic();
    }

    public changeYear(year: number): void {
        yearBand(year);
        this.year = year;
        this.updateThematic();
    }

    private updateThematic(): void {
        this.map.updateThematic(this.roads, this.raster, this.mode, this.year);
    }
}
