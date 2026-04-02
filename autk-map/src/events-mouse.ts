import { MouseStatus } from './events-types';
import { AutkMap } from './main';

/**
 * Handles pointer interactions for the map canvas.
 *
 * This controller wires DOM mouse events to camera operations
 * (pan, rotate, zoom) and feature picking.
 */
export class MouseEvents {
    /**
     * Parent map instance used to access camera, renderer, and layers.
     */
    private _map!: AutkMap;

    /**
     * Last pointer position in canvas pixel coordinates.
     */
    private _lastPoint: number[];

    /**
     * Current interaction state.
     */
    private _status: MouseStatus;

    /** Bound wheel handler used for add/remove listener symmetry. */
    private _onWheel: (e: WheelEvent) => void;
    /** Bound mouse down handler used for add/remove listener symmetry. */
    private _onMouseDown: (e: MouseEvent) => void;
    /** Bound mouse up handler used for add/remove listener symmetry. */
    private _onMouseUp: (e: MouseEvent) => void;
    /** Bound context menu handler used for add/remove listener symmetry. */
    private _onContextMenu: (e: MouseEvent) => void;
    /** Bound mouse move handler used for add/remove listener symmetry. */
    private _onMouseMove: (e: MouseEvent) => void;
    /** Bound double click handler used for add/remove listener symmetry. */
    private _onDblClick: (e: MouseEvent) => void;

    /**
     * Creates a mouse interaction controller for a map instance.
     *
     * @param map Target map instance.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._lastPoint = [0, 0];
        this._status = MouseStatus.IDLE;

        this._onWheel = this.mouseWheel.bind(this);
        this._onMouseDown = this.mouseDown.bind(this);
        this._onMouseUp = this.mouseUp.bind(this);
        this._onContextMenu = this.contextMenu.bind(this);
        this._onMouseMove = this.mouseMove.bind(this);
        this._onDblClick = this.mouseDoubleClick.bind(this);
    }

    /**
     * Attaches all mouse listeners to the renderer canvas.
     */
    bindEvents(): void {
        const canvas = this._map.renderer.canvas;
        canvas.addEventListener('wheel', this._onWheel, { passive: false });
        canvas.addEventListener('mousedown', this._onMouseDown, false);
        canvas.addEventListener('mouseup', this._onMouseUp, false);
        canvas.addEventListener('contextmenu', this._onContextMenu, false);
        canvas.addEventListener('mousemove', this._onMouseMove, false);
        canvas.addEventListener('dblclick', this._onDblClick, false);
    }

    /**
     * Removes all mouse listeners from the map canvas.
     */
    destroyEvents(): void {
        const canvas = this._map.renderer.canvas;
        canvas.removeEventListener('wheel', this._onWheel);
        canvas.removeEventListener('mousedown', this._onMouseDown);
        canvas.removeEventListener('mouseup', this._onMouseUp);
        canvas.removeEventListener('contextmenu', this._onContextMenu);
        canvas.removeEventListener('mousemove', this._onMouseMove);
        canvas.removeEventListener('dblclick', this._onDblClick);
    }

    /**
     * Prevents the browser context menu on the map canvas.
     *
     * @param event Native mouse event.
     */
    contextMenu(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Starts a drag interaction for left or middle mouse button.
     *
     * @param event Native mouse event.
     */
    mouseDown(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        if (event.button == 0 || event.button == 1) {
            this._lastPoint = [event.offsetX, event.offsetY];
            this._status = MouseStatus.DRAG;
        }
    }

    /**
     * Applies camera pan or orbit while dragging.
     *
     * Hold Shift + left drag to orbit; otherwise drag pans.
     *
     * @param event Native mouse event.
     */
    mouseMove(event: MouseEvent): void {
        const canvas = this._map.renderer.canvas;

        if (this._status === MouseStatus.DRAG) {
            event.preventDefault();
            event.stopPropagation();
            const dx = -event.offsetX + this._lastPoint[0];
            const dy = event.offsetY - this._lastPoint[1];

            if (event.buttons === 1 && event.shiftKey) {
                this._map.camera.yaw(dx / canvas.offsetWidth);
                this._map.camera.pitch(dy / canvas.offsetHeight);
            } else {
                this._map.camera.translate(dx / canvas.offsetWidth, dy / canvas.offsetHeight);
            }

            this._lastPoint = [event.offsetX, event.offsetY];
        }
    }

    /**
     * Ends the current drag interaction.
     *
     * @param event Native mouse event.
     */
    mouseUp(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        this._status = MouseStatus.IDLE;
    }

    /**
     * Zooms the camera around the cursor position.
     *
     * @param event Native wheel event.
     */
    mouseWheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();

        const canvas = this._map.renderer.canvas;

        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / canvas.offsetWidth;
        const y = 1.0 - (event.clientY - rect.top) / canvas.offsetHeight;

        this._map.camera.zoom(event.deltaY * 0.01, x, y);
    }

    /**
     * Queues a picking request at the double-clicked canvas position.
     *
     * The position is converted from CSS pixels to the actual backing
     * canvas resolution before being stored.
     *
     * @param event Native mouse event.
     */
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
