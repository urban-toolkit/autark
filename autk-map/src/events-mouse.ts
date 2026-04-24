import { MouseStatus } from './types-events';
import { AutkMap } from './map';

/**
 * Handles pointer interactions for the map canvas.
 *
 * This controller wires DOM mouse events to camera operations
 * (pan, rotate, zoom) and feature picking.
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
     * @param map - Map instance whose camera and picking state are controlled by pointer input.
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
     * @returns Nothing. Existing listeners are replaced by bound handler references.
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
     * @returns Nothing. Registered listeners are detached from the canvas and document.
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
     * @param event - Fired pointer event.
     * @returns Nothing. Default browser behavior is prevented.
     */
    contextMenu(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Starts a drag when the pointer goes down over the canvas.
     *
     * The canvas bounds check is necessary because this listener fires for
     * all document pointerdown events.
     *
     * @param event - Fired pointer event.
     * @returns Nothing. Drag state is updated when the event targets the map canvas.
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
     * drag start here by checking event.buttons while in IDLE state.
     *
     * @param event - Fired pointer event.
     * @returns Nothing. Camera motion is applied while dragging.
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
     * No-op when not in DRAG state.
     *
     * @param event - Fired pointer event.
     * @returns Nothing. Drag state is reset to idle when appropriate.
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
     * @param event - Fired wheel event.
     * @returns Nothing. Camera zoom is updated based on wheel delta.
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
     * @param event - Fired mouse event.
     * @returns Nothing. Picking coordinates are queued on the active picking layer when present.
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
     * @param event - Pointer or mouse event containing viewport coordinates.
     * @returns Two-element array `[x, y]` relative to the canvas bounds.
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
