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
    private _map!: AutkMap;
    private _lastPoint: number[];
    private _status: MouseStatus;

    private _onWheel: (e: WheelEvent) => void;
    private _onPointerDown: (e: PointerEvent) => void;
    private _onPointerUp: (e: PointerEvent) => void;
    private _onContextMenu: (e: PointerEvent) => void;
    private _onPointerMove: (e: PointerEvent) => void;
    private _onDblClick: (e: MouseEvent) => void;

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

    contextMenu(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    private _getPoint(event: PointerEvent | MouseEvent): number[] {
        const canvas = this._map.renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        return [
            event.clientX - rect.left,
            event.clientY - rect.top,
        ];
    }

    /**
     * Starts a drag when the pointer goes down over the canvas.
     *
     * The canvas bounds check is necessary because this listener fires for
     * all document pointerdown events.
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
     */
    pointerMove(event: PointerEvent): void {
        if (this._status === MouseStatus.IDLE && (event.buttons === 1 || event.buttons === 4)
                && event.target === this._map.renderer.canvas) {
            this._lastPoint = this._getPoint(event);
            this._status = MouseStatus.DRAG;
        }

        if (this._status !== MouseStatus.DRAG) return;

        const canvas = this._map.renderer.canvas;
        event.preventDefault();
        event.stopPropagation();

        const point = this._getPoint(event);
        const dx = -point[0] + this._lastPoint[0];
        const dy =  point[1] - this._lastPoint[1];

        if ((event.buttons & 1) === 1 && event.shiftKey) {
            this._map.camera.yaw(dx / canvas.offsetWidth);
            this._map.camera.pitch(dy / canvas.offsetHeight);
        } else {
            this._map.camera.translate(dx / canvas.offsetWidth, dy / canvas.offsetHeight);
        }

        this._lastPoint = point;
    }

    /**
     * Ends the current drag interaction.
     * No-op when not in DRAG state.
     */
    pointerUp(event: PointerEvent): void {
        if (this._status !== MouseStatus.DRAG) return;

        event.preventDefault();
        event.stopPropagation();
        this._status = MouseStatus.IDLE;
    }

    mouseWheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();

        const canvas = this._map.renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / canvas.offsetWidth;
        const y = 1.0 - (event.clientY - rect.top) / canvas.offsetHeight;

        this._map.camera.zoom(event.deltaY * 0.01, x, y);
    }

    mouseDoubleClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        const canvas = this._map.renderer.canvas;
        const rect = canvas.getBoundingClientRect();

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const scaleX = canvas.width / canvas.offsetWidth;
        const scaleY = canvas.height / canvas.offsetHeight;

        const adjustedX = Math.floor(mouseX * scaleX);
        const adjustedY = Math.floor(mouseY * scaleY);

        this._map.layerManager.layers.forEach((layer) => {
            if (layer.layerRenderInfo.isPick) {
                layer.layerRenderInfo.pickedComps = [adjustedX, adjustedY];
            }
        });
    }
}
