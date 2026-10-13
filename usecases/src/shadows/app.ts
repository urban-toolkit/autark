import type { FeatureCollection } from 'geojson';
import { ShadowsData } from './data';
import { computeShadows } from './compute';
import { ShadowsMap, type DisplayMode } from './map';
import { ShadowsPlot } from './plot';
import { DEFAULT_MONTH, isMonthCode, resolveBuildingFootprint, resolveBuildingHeight,
    clearRoadsCompute, mergeComputedRoads, type MonthCode } from './utils';

export class ShadowsApp {
    private readonly data = new ShadowsData();
    private map!: ShadowsMap;
    private plot!: ShadowsPlot;
    private roads!: FeatureCollection;
    private buildings!: FeatureCollection;
    private building: { ring: number[][]; height: number } | null = null;
    private revision = 0;
    private month: MonthCode = DEFAULT_MONTH;
    private mode: DisplayMode = 'heatmap';

    public async init(args: {
        canvas: HTMLCanvasElement;
        histogramHost: HTMLElement;
        onProgress: (message: string, note?: string) => void;
        onError: (error: unknown) => void;
    }): Promise<void> {
        const collections = await this.data.load(args.onProgress);
        this.roads = collections.roads;
        this.buildings = collections.buildings;
        args.onProgress('Initializing map...');
        this.map = new ShadowsMap(args.canvas);
        await this.map.init(this.data.db.getLayersMetadata(), (name) => this.data.db.getLayer(name), this.roads, this.buildings);
        this.plot = new ShadowsPlot(args.histogramHost);
        this.reloadHistogram();
        this.updateThematic();
        this.map.onBuildingSelection((id) => {
            void this.selectBuilding(id).catch(args.onError);
        });
    }

    public async selectBuilding(id: number | null): Promise<void> {
        // Invalidate pending calculations, even on deselection or invalid geometry.
        const revision = ++this.revision;
        this.building = null;
        clearRoadsCompute(this.roads);
        this.map.highlightBuilding(null);
        this.updateThematic();
        if (id === null) return;
        const feature = this.buildings.features[id];
        const ring = feature && resolveBuildingFootprint(feature);
        if (!ring) throw new Error('The selected building has no valid polygon footprint.');
        this.building = { ring, height: resolveBuildingHeight(feature) };
        this.map.highlightBuilding(id);
        await this.recompute(revision);
    }

    public async changeMonth(month: string): Promise<void> {
        if (!isMonthCode(month)) throw new Error('Unsupported month.');
        this.month = month;
        const revision = ++this.revision;
        clearRoadsCompute(this.roads);
        this.map.highlightRoads([]);
        this.reloadHistogram();
        this.updateThematic();
        await this.recompute(revision);
    }

    public changeDisplayMode(mode: DisplayMode): void {
        this.mode = mode;
        this.map.highlightRoads([]);
        this.updateThematic();
    }

    private async recompute(revision: number): Promise<void> {
        if (!this.building) return;
        const { ring, height } = this.building;
        const result = await computeShadows(this.roads, ring, height, this.month);
        if (revision !== this.revision) return;
        mergeComputedRoads(this.roads, result);
        this.updateThematic();
    }

    private updateThematic(): void { this.map.updateThematic(this.roads, this.month, this.mode); }

    private reloadHistogram(): void {
        this.plot.show(this.roads, this.month, (ids) => this.map.highlightRoads(ids));
    }
}
