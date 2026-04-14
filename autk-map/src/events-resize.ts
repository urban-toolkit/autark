import { AutkMap } from './map';

/**
 * ResizeEvents handles window resize interactions with the map.
 * It keeps the canvas, camera, renderer, and UI in sync with the layout size.
 */
export class ResizeEvents {
    private _map: AutkMap;

    /** Bound resize handler stored for add/remove listener symmetry. */
    private _onResize: () => void;

    /**
     * @param map Target map instance.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._onResize = this.resize.bind(this);
    }

    /**
     * Attaches the resize listener to the window.
     */
    bindEvents(): void {
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Removes the resize listener from the window.
     */
    destroyEvents(): void {
        window.removeEventListener('resize', this._onResize);
    }

    /**
     * Resizes the canvas to match its CSS layout size and updates the camera,
     * renderer, and UI accordingly. Called once on init and on every window resize.
     */
    resize(): void {
        const canvas = this._map.canvas;
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        canvas.width = width * (window.devicePixelRatio || 1);
        canvas.height = height * (window.devicePixelRatio || 1);

        this._map.camera.resize(width, height);
        this._map.renderer.resize(width, height);
        this._map.ui.handleResize();
    }
}
