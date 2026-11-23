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
export type PickableLayer = VectorLayer | SpriteLayer;

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
    /** Hover samples report a hit without touching selection state. */
    onHover?: (id: number | null) => void;
};

/**
 * Coordinates picking readback and selection event emission.
 *
 * Render paths own the actual picking draw pass, while this controller owns the
 * common state transition from requested pick to emitted selection.
 */
export class MapPickingController {
    private hoverRequest: PendingPick | null = null;

    queueHover(request: PendingPick | null): void {
        this.hoverRequest = request;
        if (request) this.requestRender();
    }
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
        private readonly requestRender: () => void = () => {},
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
        if (!activePickingLayer || activePickingLayer.layerRenderInfo.isSkip || !activePickingLayer.layerRenderInfo.pickedComps) {
            const hover = this.hoverRequest;
            this.hoverRequest = null;
            return hover;
        }

        if (this.hoverRequest) this.requestRender();
        const [x, y] = activePickingLayer.layerRenderInfo.pickedComps;
        activePickingLayer.layerRenderInfo.pickedComps = undefined;

        if (!(activePickingLayer instanceof VectorLayer) && !(activePickingLayer instanceof SpriteLayer)) {
            activePickingLayer.clearHighlightedIds();
            return null;
        }

        return { layer: activePickingLayer, pickableLayer: activePickingLayer, x, y };
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
            if (!pendingPick.onHover) console.warn('Picking readback buffers are still busy; skipping this picking frame.');
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
            const { layer, pickableLayer, onHover } = pendingPick;
            if (onHover) {
                onHover(id >= 0 ? id : null);
                return;
            }

            if (id >= 0) pickableLayer.toggleHighlightedIds([id]);
            else layer.clearHighlightedIds();
            const payload = { selection: pickableLayer.highlightedIds, layerId: layer.layerInfo.id };
            this.mapEvents.emit(MapEvent.CLICK, payload);
        });
    }
}
