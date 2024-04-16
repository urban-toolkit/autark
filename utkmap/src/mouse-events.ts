import { MouseStatus } from "./constants";
import { UtkMap } from "./utk-map";

export class MouseEvents {
    // div to attach the events
    private _map!: UtkMap;
    // last clicked point
    private _lastPoint: number[];
    // mouse status
    private _status: MouseStatus;

    constructor(utkMap: UtkMap) {
        this._map = utkMap;
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

        if(event.button == 0 || event.button == 1){ // left click
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
            const dx = (-event.offsetX + this._lastPoint[0]);
            const dy = event.offsetY - this._lastPoint[1];
      
            if (event.buttons === 1 && event.shiftKey) { // left button
              this._map.camera.yaw(dx / canvas.clientWidth);
              this._map.camera.pitch(dy / canvas.clientHeight);
            } else {
              this._map.camera.translate(dx / canvas.clientWidth, dy / canvas.clientHeight);
            }
      
            this._lastPoint = [event.offsetX, event.offsetY];
        }
    }

    /**
     * Handles mouse up event
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
        const maxAxisLength = Math.max(canvas.clientWidth, canvas.clientHeight);
        const x = event.offsetX / maxAxisLength;
        const y = (canvas.height - event.offsetY) / maxAxisLength;

        this._map.camera.zoom(event.deltaY * 0.01, x, y);
    }
}