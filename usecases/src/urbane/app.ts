import type { FeatureCollection } from 'geojson';
import { computeRoadSkyView, computeScore } from './compute';
import { UrbaneData } from './data';
import { UrbaneMap } from './map';
import { UrbanePlots } from './plot';
import { DATASETS, DEFAULT_DISTANCE, DEFAULT_WEIGHTS, type UrbaneLevel } from './config';

export class UrbaneApp {
    private readonly data = new UrbaneData();
    private map!: UrbaneMap;
    private plots!: UrbanePlots;
    private neighborhoods!: FeatureCollection;
    private activeBuildings!: FeatureCollection;
    private busy = false;

    public currentLevel: UrbaneLevel = 'neighborhoods';
    public selectedNeighIds: number[] = [];
    public readonly distance = DEFAULT_DISTANCE;
    public readonly datasets = [...DATASETS];
    public weights = [...DEFAULT_WEIGHTS];
    public skyExposureWeight = 0;

    public async init(args: {
        canvas: HTMLCanvasElement;
        plotDivParallel: HTMLElement;
        plotDivTable: HTMLElement;
        onProgress: (message: string, note?: string) => void;
    }): Promise<void> {
        args.onProgress('Initializing spatial database...');
        await this.data.init();
        args.onProgress('Loading Manhattan datasets...', 'Importing local OSM, neighborhoods and point datasets.');
        await this.data.loadBaseData(this.datasets);
        args.onProgress('Computing road sky view...', 'Running render-based GPU analysis.');
        const roadsWithSky = await computeRoadSkyView(
            await this.data.getLayer('table_osm_buildings'), await this.data.getLayer('table_osm_roads'),
        );
        await this.data.updateLayer('table_osm_roads', roadsWithSky);
        args.onProgress('Joining sky exposure to neighborhoods...');
        await this.data.joinNeighborhoodSkyExposure();
        args.onProgress('Computing neighborhood scores...');
        this.neighborhoods = await computeScore(await this.data.getLayer('neighborhoods'), this.datasets, this.weights, this.skyExposureWeight);
        args.onProgress('Initializing map and plots...');
        this.map = new UrbaneMap(args.canvas);
        await this.map.init(this.data.getLayersMetadata(), (name) => this.data.getLayer(name), this.neighborhoods, roadsWithSky);
        this.plots = new UrbanePlots(args.plotDivParallel, args.plotDivTable);
        this.reloadPlots();
        this.map.onSelection((level, ids) => {
            if (level !== this.currentLevel) return;
            this.plots.setSelection(ids);
            this.updateSelection(ids);
        });
    }

    public updateThematic(column: string): void {
        this.map.updateThematic(this.currentLevel, this.getCurrentCollection(), column);
    }

    public async updateWeights(newWeights: number[], thematicColumn: string): Promise<void> {
        if (this.busy) throw new Error('Please wait for the current operation to finish.');
        this.busy = true;
        try {
            if (newWeights.length !== this.datasets.length + 1) throw new Error('Provide a weight for each dataset and sky exposure.');
            const weights = newWeights.slice(0, this.datasets.length);
            const skyWeight = newWeights[this.datasets.length];
            const scored = await computeScore(await this.data.getLayer(this.currentLevel), this.datasets, weights, skyWeight);
            this.weights = weights;
            this.skyExposureWeight = skyWeight;
            if (this.currentLevel === 'neighborhoods') this.neighborhoods = scored;
            else this.activeBuildings = scored;
            this.plots.updateCollection(scored);
            this.plots.setSelection([]);
            this.map.highlight(this.currentLevel, []);
            this.selectedNeighIds = [];
            this.updateThematic(thematicColumn);
        } finally { this.busy = false; }
    }

    public async drillDown(thematicColumn: string): Promise<void> {
        if (this.busy) throw new Error('Please wait for the current operation to finish.');
        const names = [...new Set(this.selectedNeighIds
            .map((id) => this.neighborhoods.features[id]?.properties?.ntaname)
            .filter((name): name is string => typeof name === 'string' && name.length > 0))];
        if (!names.length) throw new Error('Select at least one neighborhood before drilling into buildings.');
        this.busy = true;
        try {
            const buildings = await this.data.loadActiveBuildings(this.datasets, names, this.distance);
            const scored = await computeScore(buildings, this.datasets, this.weights, this.skyExposureWeight);
            this.map.showBuildings(scored);
            this.activeBuildings = scored;
            this.currentLevel = 'active_buildings';
            this.reloadPlots();
            this.updateThematic(thematicColumn);
        } finally { this.busy = false; }
    }

    public async drillUp(thematicColumn: string): Promise<void> {
        if (this.busy) throw new Error('Please wait for the current operation to finish.');
        this.busy = true;
        try {
            await this.data.removeLayer('active_buildings');
            this.map.showNeighborhoods();
            this.currentLevel = 'neighborhoods';
            this.selectedNeighIds = [];
            this.reloadPlots();
            this.updateThematic(thematicColumn);
        } finally { this.busy = false; }
    }

    private reloadPlots(): void {
        this.plots.show(this.currentLevel, this.datasets, this.getCurrentCollection(), (ids) => {
            this.map.highlight(this.currentLevel, ids);
            this.updateSelection(ids);
        });
    }

    private updateSelection(ids: number[]): void {
        if (this.currentLevel === 'neighborhoods') this.selectedNeighIds = ids;
    }

    private getCurrentCollection(): FeatureCollection {
        return this.currentLevel === 'neighborhoods' ? this.neighborhoods : this.activeBuildings;
    }
}
