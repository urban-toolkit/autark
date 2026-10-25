/**
 * The Autark map of the regions, linked to the plots by feature indices.
 *
 * The map is one-to-one with the features: it highlights whole regions, and
 * picking regions (double click) selects them in every plot.
 */

import { AutkMap, MapEvent } from '@urban-toolkit/autk-map';

import { MAP_LAYER } from './config';
import type { Collection } from './data';

/** Vertical field of view of the Autark camera (45°). */
const FIELD_OF_VIEW = Math.PI / 4;

/** Extent of every coordinate of the collection (map units). */
function extentOf(collection: Collection): { width: number; height: number } {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = (value: unknown): void => {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number') {
            x0 = Math.min(x0, value[0]); x1 = Math.max(x1, value[0]);
            y0 = Math.min(y0, value[1]); y1 = Math.max(y1, value[1]);
            return;
        }
        value.forEach(visit);
    };
    collection.features.forEach(feature => visit((feature.geometry as { coordinates?: unknown } | null)?.coordinates));
    return { width: x1 - x0, height: y1 - y0 };
}

/**
 * Moves the camera back until the whole collection fits the canvas, with a
 * margin. The map looks at the center of the first collection's bounds, so
 * only the distance depends on the extent and on the canvas aspect.
 */
function fitCamera(map: AutkMap, collection: Collection): void {
    const { width, height } = extentOf(collection);
    const aspect = (map.canvas.offsetWidth || 1) / (map.canvas.offsetHeight || 1);
    const half = Math.max(height / 2, width / 2 / aspect) * 1.08;
    const distance = half / Math.tan(FIELD_OF_VIEW / 2);
    if (!Number.isFinite(distance) || distance <= 0) return;
    map.camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, distance]);
    map.camera.update();
}

export class ProvenanceMap {
    private constructor(private readonly map: AutkMap, private readonly collection: Collection) {}

    /**
     * Loads the regions on an Autark map, as the gallery examples do.
     *
     * @returns The map, or `undefined` when the browser has no WebGPU.
     * @throws Never: a missing WebGPU leaves the plots working on their own.
     */
    public static async load(canvas: HTMLCanvasElement, collection: Collection): Promise<ProvenanceMap | undefined> {
        try {
            if (!('gpu' in navigator)) throw new Error('WebGPU unavailable');
            const map = new AutkMap(canvas);
            await map.init();
            map.loadCollection(MAP_LAYER, { collection });
            map.updateRenderInfo(MAP_LAYER, { isPick: true });
            fitCamera(map, collection);
            map.draw();
            return new ProvenanceMap(map, collection);
        } catch (error) {
            console.warn('autk-map not loaded:', error);
            return undefined;
        }
    }

    /** Calls `listener` with the regions picked on the map. */
    public onSelection(listener: (selection: number[]) => void): void {
        this.map.events.on(MapEvent.PICKING, ({ selection }) => listener(selection));
    }

    /** Highlights whole regions. */
    public highlight(selection: number[]): void {
        this.map.setHighlightedIds(MAP_LAYER, selection);
    }

    /** Brings the camera back to the initial view of all regions. */
    public fit(): void {
        fitCamera(this.map, this.collection);
        this.map.requestRender();
    }

    /** Removes every highlight. */
    public clear(): void {
        this.map.clearHighlightedIds(MAP_LAYER);
    }
}
