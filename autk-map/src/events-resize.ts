/**
 * @module ResizeEvents
 * Window resize controller for a map instance.
 *
 * This module defines the `ResizeEvents` class, which keeps the map viewport in
 * sync with the canvas layout size. It updates the camera and renderer using the
 * canvas's current CSS dimensions and the active device pixel ratio, then notifies
 * the map UI so overlay layout can react to the new viewport size.
 */

import { AutkMap } from './map';

/**
 * Window resize controller for the map viewport.
 *
 * `ResizeEvents` binds a single window-level resize listener and forwards each
 * event to the module's resize function. The resize routine reads the canvas's
 * current layout size, updates the camera and renderer to match, and then asks
 * the map UI to recompute any size-dependent layout.
 */
export class ResizeEvents {
    /** Reference to the owning map instance. */
    private _map: AutkMap;

    /** Bound resize handler stored for add/remove listener symmetry. */
    private _onResize: () => void;

    /**
     * Creates a resize interaction controller for a map instance.
     *
     * @param map Target map instance.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._onResize = this.resize.bind(this);
    }

    /**
     * Attaches the resize listener to the window.
     *
     * Repeated calls register the same bound handler again because the method does
     * not guard against duplicate bindings.
     *
     * @returns Nothing. Future window resize events are forwarded to {@link ResizeEvents.resize}.
     */
    bindEvents(): void {
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Removes the resize listener from the window.
     *
     * This only removes the handler previously registered by
     * {@link ResizeEvents.bindEvents}.
     *
     * @returns Nothing. The bound window resize listener is detached.
     */
    destroyEvents(): void {
        window.removeEventListener('resize', this._onResize);
    }

    /**
     * Synchronizes the map viewport with the canvas's current layout size.
     *
     * The method reads the canvas element's `offsetWidth` and `offsetHeight`,
     * uses `window.devicePixelRatio` with a fallback of `1`, then propagates the
     * updated dimensions to the camera, renderer, and UI. It does not modify the
     * canvas size directly in this class; resizing is delegated to the renderer.
     *
     * @returns Nothing. The camera, renderer, and UI are updated for the current viewport size.
     */
    resize(): void {
        const canvas = this._map.canvas;
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        const devicePixelRatio = window.devicePixelRatio || 1;

        this._map.camera.resize(width, height);
        this._map.renderer.resize(width, height, devicePixelRatio);
        this._map.ui.handleResize();
    }
}
