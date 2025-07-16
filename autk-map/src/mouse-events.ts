import { MouseStatus } from './constants';
import { AutkMap } from './main';

/** 
 * MouseEvents class handles mouse interactions with the map.
 * It allows for panning, zooming, and picking features on the map.
 */
export class MouseEvents {
    /**
     * Reference to the AutkMap instance.
     * @type {AutkMap}
     */
    private _map!: AutkMap;

    /**
     * Last mouse position in pixels.
     * This is used to calculate the movement of the mouse for panning.
     * @type {number[]}
     */
    private _lastPoint: number[];

    /**
     * Current mouse status.
     * This indicates whether the mouse is idle, dragging, or performing another action.
     * @type {MouseStatus}
     */
    private _status: MouseStatus;

    /**
     * Constructor for MouseEvents
     * @param {AutkMap} map The map instance
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._lastPoint = [0, 0];

        this._status = MouseStatus.MOUSE_IDLE;
    }

    /**
     * Mouse events binding function
     */
    bindEvents(): void {
        // sets the canvas listeners
        this._map.renderer.canvas.addEventListener('wheel', this.mouseWheel.bind(this), { passive: false });

        this._map.renderer.canvas.addEventListener('mousedown', this.mouseDown.bind(this), false);
        this._map.renderer.canvas.addEventListener('mouseup', this.mouseUp.bind(this), false);
        this._map.renderer.canvas.addEventListener('contextmenu', this.contextMenu.bind(this), false);
        this._map.renderer.canvas.addEventListener('mousemove', this.mouseMove.bind(this), false);
        this._map.renderer.canvas.addEventListener('dblclick', this.mouseDoubleClick.bind(this), false);
    }

    /**
     * Handles mouse right click event
     * @param {MouseEvent} event The fired event
     */
    contextMenu(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Handles mouse down event
     * @param {MouseEvent} event The fired event
     */
    mouseDown(event: MouseEvent): void {
        // captures the event.
        event.preventDefault();
        event.stopPropagation();

        if (event.button == 0 || event.button == 1) {
            // left click
            this._lastPoint = [event.offsetX, event.offsetY];
            this._status = MouseStatus.MOUSE_DRAG;
        }
    }

    /**
     * Handles mouse move event
     * @param {MouseEvent} event The fired event
     */
    mouseMove(event: MouseEvent): void {
        // captures the event.
        event.preventDefault();
        event.stopPropagation();

        // gets the map canvas
        const canvas = this._map.renderer.canvas;

        // left click drag
        if (this._status === MouseStatus.MOUSE_DRAG) {
            const dx = -event.offsetX + this._lastPoint[0];
            const dy = event.offsetY - this._lastPoint[1];

            if (event.buttons === 1 && event.shiftKey) {
                // left button
                this._map.camera.yaw(dx / canvas.offsetWidth);
                this._map.camera.pitch(dy / canvas.offsetHeight);
            } else {
                this._map.camera.translate(dx / canvas.offsetWidth, dy / canvas.offsetHeight);
            }

            this._lastPoint = [event.offsetX, event.offsetY];
        }
    }

    /**
     * Handles mouse up event
     * @param {MouseEvent} event The fired event
     */
    mouseUp(event: MouseEvent): void {
        // captures the event.
        event.preventDefault();
        event.stopPropagation();

        // changes the values
        this._status = MouseStatus.MOUSE_IDLE;
    }

    /**
     * Handles mouse down event
     * @param {WheelEvent} event The fired event
     */
    mouseWheel(event: WheelEvent) {
        // captures the event.
        event.preventDefault();
        event.stopPropagation();

        // gets the map canvas
        const canvas = this._map.renderer.canvas;

        // changes the values
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / canvas.offsetWidth;
        const y = 1.0 - (event.clientY - rect.top) / canvas.offsetHeight;

        this._map.camera.zoom(event.deltaY * 0.01, x, y);
    }

    /**
     * Handles mouse double click event
     * @param {MouseEvent} event The fired event
     */
    mouseDoubleClick(event: MouseEvent) {
        const canvas = this._map.renderer.canvas;
        const rect = canvas.getBoundingClientRect();

        // Mouse position relative to canvas
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Scale factors from CSS size to actual canvas resolution
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
