import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';
import { DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '@urban-toolkit/autk-core';

export interface TilePanelStatus { text: string; state: 'loading' | 'error' | 'ready'; busy: boolean }

/** Provider controls shared by imagery-only and imagery-with-terrain examples. */
export class TilesBasemap {
    static readonly coordinateFormat = DEFAULT_WORKSPACE_COORDINATE_FORMAT;
    protected map!: AutkMap;
    protected center = { latitude: -22.9, longitude: -43.1 };
    protected zoom = 13;
    // Compatibility hooks for legacy combined examples until their catalog migration is complete.
    protected showStatistics = false;
    protected showOpacity = false;
    private overview!: { target: number[]; eye: number[]; near: number; far: number };
    private timer?: ReturnType<typeof setInterval>;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        this.map.setView({ center: this.center, zoom: this.zoom });
        this.changeSource();
        await this.initializeView();
        const { lookAt: target, eye, near, far } = this.map.camera.saveState();
        this.overview = { target, eye, near, far };
        this.map.draw();
        document.querySelector('#source-select')!.addEventListener('change', () => this.changeSource());
        document.querySelector('#view-overview')!.addEventListener('click', () => {
            this.map.camera.resetCamera([0, 1, 0], this.overview.target, this.overview.eye, this.overview.far, this.overview.near);
        });
        document.querySelector('#view-tilted')!.addEventListener('click', () => {
            const { target, eye, near, far } = this.overview;
            const distance = eye[2] - target[2];
            this.map.camera.resetCamera([0, Math.cos(1), Math.sin(1)], target,
                [target[0], target[1] - distance * Math.sin(1), target[2] + distance * Math.cos(1)], far, near);
        });
        document.querySelector('#show-tiles')!.addEventListener('change', event => {
            this.map.updateRenderInfo('imagery', { isSkip: !(event.target as HTMLInputElement).checked });
        });
        this.updatePanel();
        this.timer = setInterval(() => this.updatePanel(), 250);
        window.addEventListener('pagehide', () => this.dispose(), { once: true });
    }

    protected async loadLayers(): Promise<void> {}
    protected async initializeView(): Promise<void> {}

    private changeSource(): void {
        const key = (document.querySelector('#source-select') as HTMLSelectElement).value as keyof typeof TILE_SOURCES;
        if (!TILE_SOURCES[key]) throw new Error(`Unknown imagery provider: ${key}`);
        this.map.removeLayer('imagery');
        this.map.loadTiles('imagery', { source: TILE_SOURCES[key] });
    }

    protected updatePanel(tiles = this.map.getTileStats('imagery'), override?: TilePanelStatus): void {
        if (!tiles) return;
        const busy = tiles.visible && !tiles.idle;
        const resolved = override ?? { text: !tiles.visible ? 'Imagery hidden' : busy ? 'Loading imagery…'
            : tiles.missingTiles ? 'Some imagery is unavailable' : 'Interactive map', state: tiles.missingTiles ? 'error' : busy ? 'loading' : 'ready', busy };
        const status = document.querySelector<HTMLElement>('#map-status')!;
        if (status.textContent !== resolved.text) status.textContent = resolved.text;
        status.dataset.state = resolved.state;
        document.querySelector('.map-stage')!.setAttribute('aria-busy', String(resolved.busy));
    }

    dispose(): void {
        clearInterval(this.timer);
        this.map?.destroy();
    }
}
