/**
 * @module MouseEvents
 * Pointer and mouse interaction controller for the map canvas.
 *
 * This module defines the `MouseEvents` class, which translates DOM pointer,
 * wheel, and double-click input into camera navigation and picking behavior
 * for an `AutkMap` instance. It coordinates drag state, pointer-position
 * tracking, and event binding so map interactions continue to work even when
 * listeners are attached at the document level.
 */

import { MouseStatus } from './types-events';
import { AutkMap } from './map';

/**
 * Handles pointer interactions for the map canvas.
 *
 * This controller binds DOM pointer, wheel, and double-click events to the
 * map camera and active picking layer. It is responsible for panning,
 * orbit-style rotation, scroll-wheel zooming, and forwarding double-click
 * positions to the currently pick-enabled layer.
 *
 * All drag-related listeners (`pointerdown`, `pointermove`, `pointerup`) are
 * registered on the document in capture phase during `bindEvents()`, before
 * any third-party script (e.g. Playwright's recorder) can be injected. This
 * guarantees our handlers fire first regardless of overlay elements or
 * injected capture listeners added later.
 */
export class MouseEvents {
    /** Reference to the owning map instance. */
    private _map!: AutkMap;
    /** Last recorded pointer position in canvas-local CSS pixels. */
    private _lastPoint: number[];
    /** Current pointer interaction state. */
    private _status: MouseStatus;

    /** Bound wheel handler reference used for safe add/remove listener calls. */
    private _onWheel: (e: WheelEvent) => void;
    /** Bound pointerdown handler reference used for safe add/remove listener calls. */
    private _onPointerDown: (e: PointerEvent) => void;
    /** Bound pointerup handler reference used for safe add/remove listener calls. */
    private _onPointerUp: (e: PointerEvent) => void;
    /** Bound contextmenu handler reference used for safe add/remove listener calls. */
    private _onContextMenu: (e: PointerEvent) => void;
    /** Bound pointermove handler reference used for safe add/remove listener calls. */
    private _onPointerMove: (e: PointerEvent) => void;
    /** Bound double-click handler reference used for safe add/remove listener calls. */
    private _onDblClick: (e: MouseEvent) => void;

    /**
     * Creates a mouse and pointer interaction controller for a map instance.
     *
     * @param map Map instance whose camera navigation and picking behavior are controlled by pointer input.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._lastPoint = [0, 0];
        this._status = MouseStatus.IDLE;

        this._onWheel = this.mouseWheel.bind(this);
        this._onPointerDown = this.pointerDown.bind(this);
        this._onPointerUp = this.pointerUp.bind(this);
        this._onContextMenu = this.contextMenu.bind(this);
        this._onPointerMove = this.pointerMove.bind(this);
        this._onDblClick = this.mouseDoubleClick.bind(this);
    }

    /**
     * Attaches all pointer listeners.
     *
     * Drag listeners are registered on the document in capture phase so they
     * are added before Playwright's recorder (or any other injected script)
     * and therefore fire first in the event propagation chain.
     *
     * Canvas-scoped listeners handle wheel, context-menu suppression, and
     * double-click picking. Document-scoped listeners allow an active drag to
     * continue receiving move and release events even when the pointer leaves
     * the canvas bounds.
     *
     * @returns Attaches the bound event handlers to the canvas and document.
     */
    bindEvents(): void {
        const canvas = this._map.renderer.canvas;
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('contextmenu', this._onContextMenu as any, false);
        canvas.addEventListener('dblclick', this._onDblClick, false);
        document.addEventListener('pointerdown', this._onPointerDown, { capture: true });
        document.addEventListener('pointermove', this._onPointerMove, { capture: true });
        document.addEventListener('pointerup',   this._onPointerUp,   { capture: true });
    }

    /**
     * Removes all pointer listeners.
     *
     * This should be called during map teardown to prevent further pointer
     * handling and to release the listener references registered by
     * `bindEvents()`.
     *
     * @returns Detaches the registered event handlers from the canvas and document.
     */
    destroyEvents(): void {
        const canvas = this._map.renderer.canvas;
        canvas.removeEventListener('wheel', this._onWheel);
        canvas.removeEventListener('contextmenu', this._onContextMenu as any);
        canvas.removeEventListener('dblclick', this._onDblClick);
        document.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
        document.removeEventListener('pointermove', this._onPointerMove, { capture: true });
        document.removeEventListener('pointerup',   this._onPointerUp,   { capture: true });
    }

    /**
     * Suppresses the browser context menu over the map canvas.
     *
     * @param event Pointer event raised for the context-menu gesture.
     * @returns Prevents the browser context menu from opening and stops further propagation.
     */
    contextMenu(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Starts a drag when the pointer goes down over the canvas.
     *
     * The canvas bounds check is necessary because this listener fires for
     * all document `pointerdown` events. Only primary-button and middle-button
     * presses over the map canvas begin a drag interaction.
     *
     * @param event Pointer event raised on press.
     * @returns Records the drag start position and switches the interaction state to drag when the event targets the canvas.
     */
    pointerDown(event: PointerEvent): void {
        if (event.target !== this._map.renderer.canvas) return;

        if (event.button === 0 || event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            this._lastPoint = this._getPoint(event);
            this._status = MouseStatus.DRAG;
        }
    }

    /**
     * Applies camera pan or orbit while dragging.
     *
     * If pointerdown was deferred (e.g. by Playwright's recorder), we detect
     * drag start here by checking `event.buttons` while in the idle state.
     * During a drag, `Shift` + primary button rotates the camera by updating
     * yaw and pitch; all other supported drags translate the camera.
     *
     * Movement deltas are normalized by the renderer's CSS width and height
     * before being passed to the camera.
     *
     * @param event Pointer event raised on move.
     * @returns Updates the camera and the stored pointer position while an active drag is in progress.
     */
    pointerMove(event: PointerEvent): void {
        if (this._status === MouseStatus.IDLE && (event.buttons === 1 || event.buttons === 4)
                && event.target === this._map.renderer.canvas) {
            this._lastPoint = this._getPoint(event);
            this._status = MouseStatus.DRAG;
        }

        if (this._status !== MouseStatus.DRAG) return;

        const cssWidth = this._map.renderer.cssWidth;
        const cssHeight = this._map.renderer.cssHeight;
        event.preventDefault();
        event.stopPropagation();

        const point = this._getPoint(event);
        const dx = -point[0] + this._lastPoint[0];
        const dy =  point[1] - this._lastPoint[1];

        if ((event.buttons & 1) === 1 && event.shiftKey) {
            this._map.camera.yaw(dx / cssWidth);
            this._map.camera.pitch(dy / cssHeight);
        } else {
            this._map.camera.translate(dx / cssWidth, dy / cssHeight);
        }

        this._lastPoint = point;
    }

    /**
     * Ends the current drag interaction.
     *
     * Calls received while the controller is not in drag mode are ignored.
     *
     * @param event Pointer event raised on release.
     * @returns Resets the interaction state to idle and suppresses the handled release event.
     */
    pointerUp(event: PointerEvent): void {
        if (this._status !== MouseStatus.DRAG) return;

        event.preventDefault();
        event.stopPropagation();
        this._status = MouseStatus.IDLE;
    }

    /**
     * Applies scroll-wheel zoom centered on the pointer position.
     *
     * The wheel position is converted into normalized canvas coordinates so
     * zooming can be anchored to the current pointer location.
     *
     * @param event Wheel event raised over the canvas.
     * @returns Updates the camera zoom and suppresses the browser's default scroll handling.
     */
    mouseWheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();

        const rect = this._map.renderer.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / this._map.renderer.cssWidth;
        const y = 1.0 - (event.clientY - rect.top) / this._map.renderer.cssHeight;

        this._map.camera.zoom(event.deltaY * 0.01, x, y);
    }

    /**
     * Triggers picking on double click for the currently active pick-enabled layer.
     *
     * If no active picking layer is available, or the active layer is not
     * currently configured for picking, the event is ignored after its default
     * browser behavior is suppressed.
     *
     * @param event Mouse event raised on double click.
     * @returns Stores the canvas-relative click position on the active picking layer when picking is enabled.
     */
    mouseDoubleClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        const rect = this._map.renderer.canvas.getBoundingClientRect();

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const activePickingLayer = this._map.activePickingLayer;
        if (activePickingLayer?.layerRenderInfo.isPick) {
            activePickingLayer.layerRenderInfo.pickedComps = [mouseX, mouseY];
        }
    }

    /**
     * Computes pointer coordinates in canvas-local CSS pixels.
     *
     * The returned coordinates are measured from the top-left corner of the
     * renderer canvas using the canvas's current client bounding box.
     *
     * @param event Pointer or mouse event containing viewport coordinates.
     * @returns Two-element array `[x, y]` relative to the canvas bounds in CSS pixels.
     */
    private _getPoint(event: PointerEvent | MouseEvent): number[] {
        const canvas = this._map.renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        return [
            event.clientX - rect.left,
            event.clientY - rect.top,
        ];
    }
}
