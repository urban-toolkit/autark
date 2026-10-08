/**
 * @module MapCamera
 * Map camera that reports its own changes.
 *
 * This module defines `MapCamera`, the `Camera` an `AutkMap` navigates with.
 * Every call that moves, turns, resets or resizes it runs a change callback,
 * which on-demand rendering uses to schedule the next frame. Rebuilding the
 * matrices with `update()` changes nothing, so it does not report.
 */

import { Camera } from '@urban-toolkit/autk-core';

/**
 * Camera that runs a callback after each change to its view or viewport.
 *
 * Mouse, touch, keyboard and resize handlers, `CameraMotion` animations and
 * application code all change the map camera through these methods, so one
 * callback observes every camera change.
 */
export class MapCamera extends Camera {
    /** Callback run after each change. Unset while the base constructor resets the camera. */
    private _onChange?: () => void;

    /**
     * Creates a camera at the default map view.
     *
     * @param onChange Callback run after each change to the camera's view or viewport.
     * @throws Never throws.
     */
    constructor(onChange: () => void) {
        super();
        this._onChange = onChange;
    }

    /** Resets the camera, then reports the change. */
    override resetCamera(wUp: number[], wLookAt: number[], wEye: number[]): void {
        super.resetCamera(wUp, wLookAt, wEye);
        this._onChange?.();
    }

    /** Resizes the viewport, then reports the change. */
    override resize(width: number, height: number): void {
        super.resize(width, height);
        this._onChange?.();
    }

    /** Zooms at the cursor, then reports the change. */
    override zoom(delta: number, x: number, y: number): void {
        super.zoom(delta, x, y);
        this._onChange?.();
    }

    /** Pans, then reports the change. */
    override translate(dx: number, dy: number): void {
        super.translate(dx, dy);
        this._onChange?.();
    }

    /** Rotates around the world Z axis, then reports the change. */
    override yaw(delta: number): void {
        super.yaw(delta);
        this._onChange?.();
    }

    /** Tilts, then reports the change. */
    override pitch(delta: number): void {
        super.pitch(delta);
        this._onChange?.();
    }

    /** Switches to an orthographic view, then reports the change. */
    override setOrthographicBounds(left: number, right: number, bottom: number, top: number): void {
        super.setOrthographicBounds(left, right, bottom, top);
        this._onChange?.();
    }
}
