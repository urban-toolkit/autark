/**
 * @module map-picking
 * Shared picking coordination for map render paths.
 *
 * This module centralizes picking state consumption, GPU readback scheduling,
 * and map-event emission so flat and terrain render paths resolve selections in
 * the same way.
 */

import { EventEmitter } from '@urban-toolkit/autk-core';

import { Layer } from './layer';
import { LayerManager } from './layer-manager';
import { SpriteLayer } from './layer-sprite';
import { VectorLayer } from './layer-vector';
import { Renderer } from './renderer';
import { MapEvent } from './types-events';
import type { MapEventRecord } from './types-events';

/** Layer families that can toggle highlighted feature ids after picking. */
type PickableLayer = VectorLayer | SpriteLayer;

/**
 * Pending picking request captured from the active layer.
 *
 * Coordinates are stored in canvas pixel space and are consumed once per frame.
 */
export type PendingPick = {
    /** Original active layer that requested picking. */
    layer: Layer;
    /** Layer instance that supports highlight toggling. */
    pickableLayer: PickableLayer;
    /** X coordinate to read from the picking texture. */
    x: number;
    /** Y coordinate to read from the picking texture. */
    y: number;
    /** `select` toggles the highlight and emits `picking`; `hover` only emits `hover`. */
    kind: 'select' | 'hover';
    /** For a hover, the epoch it was requested in; a result from an older one is dropped. */
    epoch: number;
};

/**
 * Coordinates picking readback and selection event emission.
 *
 * Render paths own the actual picking draw pass, while this controller owns the
 * common state transition from requested pick to emitted selection.
 */
export class MapPickingController {
    /**
     * Creates a picking controller bound to a renderer and event bus.
     *
     * @param renderer Renderer that owns picking textures and readback buffers.
     * @param layerManager Ordered layer source used to find the active picking layer.
     * @param mapEvents Event bus used to emit selection updates.
     * @throws Never throws.
     * @example
     * const picking = new MapPickingController(renderer, layerManager, events);
     */
    constructor(
        /** Renderer used to reserve and read picking buffers. */
        private readonly renderer: Renderer,
        /** Layer manager used to locate the currently pick-enabled layer. */
        private readonly layerManager: LayerManager,
        /** Event emitter notified when picking resolves a selection. */
        private readonly mapEvents: EventEmitter<MapEventRecord>,
    ) {}

    /**
     * Consumes one pending picking request from the active pick-enabled layer.
     *
     * Unsupported layer types have their highlight state cleared and do not
     * produce a pending pick.
     *
     * @returns Pending pick data, or `null` when there is no valid request.
     * @throws Never throws.
     * @example
     * const pending = picking.consumePendingPick();
     * if (pending) renderPickingPass(pending);
     */
    consumePendingPick(): PendingPick | null {
        const activePickingLayer = this.layerManager.layers.find((layer) => layer.layerRenderInfo.isPick) ?? null;
        if (!activePickingLayer || activePickingLayer.layerRenderInfo.isSkip) {
            return null;
        }

        const info = activePickingLayer.layerRenderInfo;
        const select = info.pickedComps;
        const hover = info.hoverComps;
        if (!select && !hover) {
            return null;
        }

        // A pick the user asked for goes first; a hover waiting beside it is dropped, since the next move asks again.
        const kind = select ? 'select' : 'hover';
        const [x, y] = (select ?? hover) as number[];
        info.pickedComps = undefined;
        info.hoverComps = undefined;

        if (!(activePickingLayer instanceof VectorLayer) && !(activePickingLayer instanceof SpriteLayer)) {
            if (kind === 'select') {
                activePickingLayer.clearHighlightedIds();
            }
            return null;
        }

        return { layer: activePickingLayer, pickableLayer: activePickingLayer, x, y, kind, epoch: this._hoverEpoch };
    }

    /** Bumped when a hover result in flight should no longer be reported. */
    private _hoverEpoch = 0;

    /**
     * Drops any hover read that is still in flight, so its result is not reported after the pointer has left or the view
     * has moved.
     *
     * @returns Nothing.
     */
    invalidateHover(): void {
        this._hoverEpoch++;
    }

    /**
     * Schedules readback of the selected pixel for a rendered picking pass.
     *
     * @param pendingPick Pending pick whose coordinates should be read.
     * @returns Reserved readback slot, or `null` when all slots are busy.
     * @throws Never throws.
     * @example
     * const slot = picking.enqueuePickingReadback(pendingPick);
     */
    enqueuePickingReadback(pendingPick: PendingPick): number | null {
        const pickReadbackSlot = this.renderer.reservePickingReadbackSlot(1);
        if (pickReadbackSlot === null) {
            // A hover is asked for again a moment later, so a busy slot is ordinary there and not worth a warning.
            if (pendingPick.kind !== 'hover') {
                console.warn('Picking readback buffers are still busy; skipping this picking frame.');
            }
            return null;
        }

        this.renderer.enqueuePickingReadback(pickReadbackSlot, 0, pendingPick.x, pendingPick.y);
        return pickReadbackSlot;
    }

    /**
     * Resolves a completed picking readback and emits the selection event.
     *
     * The selected object id toggles highlight state on pickable layers. A
     * negative or missing id clears the active layer selection.
     *
     * @param pendingPick Pending pick that produced the readback request.
     * @param pickReadbackSlot Slot returned by `enqueuePickingReadback`.
     * @returns Nothing. Selection updates are emitted asynchronously.
     * @throws Never throws synchronously. Readback promise failures are owned by the renderer.
     * @example
     * picking.resolvePickingReadback(pendingPick, slot);
     */
    resolvePickingReadback(pendingPick: PendingPick | null, pickReadbackSlot: number | null): void {
        if (pickReadbackSlot === null || !pendingPick) {
            return;
        }

        this.renderer.readPickingResults(pickReadbackSlot, 1).then((ids) => {
            const id = ids[0] ?? -1;
            const { layer, pickableLayer } = pendingPick;

            if (pendingPick.kind === 'hover') {
                if (pendingPick.epoch === this._hoverEpoch) {
                    this.mapEvents.emit(MapEvent.HOVER, {
                        layerId: layer.layerInfo.id, id: id >= 0 ? id : null, x: pendingPick.x, y: pendingPick.y,
                    });
                }
                return;
            }

            if (id >= 0) {
                pickableLayer.toggleHighlightedIds([id]);
                this.mapEvents.emit(MapEvent.PICKING, { selection: pickableLayer.highlightedIds, layerId: layer.layerInfo.id });
            } else {
                layer.clearHighlightedIds();
                this.mapEvents.emit(MapEvent.PICKING, { selection: [], layerId: layer.layerInfo.id });
            }
        });
    }
}
