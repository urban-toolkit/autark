/**
 * @module KeyEvents
 * Keyboard interaction controller for map-level shortcuts.
 *
 * This module defines the `KeyEvents` class, which binds global keyboard
 * listeners for an `AutkMap` instance and translates supported shortcuts into
 * map-side updates. It currently manages style-cycling behavior and triggers
 * layer render-info invalidation so visual changes are applied on the next
 * render pass.
 */

import { AutkMap } from './map';
import { MapStyle } from './map-style';

/**
 * Keyboard interaction controller for map shortcuts.
 *
 * `KeyEvents` owns the lifecycle of global keyboard listeners associated with a
 * map instance. Supported shortcuts update shared map presentation state and may
 * mark existing layers dirty so dependent GPU-side render configuration is
 * rebuilt.
 */
export class KeyEvents {
    /** Owning map instance. */
    private _map!: AutkMap;
    /** Bound keyup handler reference used for safe add/remove listener calls. */
    private _onKeyUp: (event: KeyboardEvent) => void;

    /**
     * Creates a keyboard interaction controller for a map instance.
     *
     * @param map Map instance whose state is updated by supported keyboard shortcuts.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._onKeyUp = this.keyUp.bind(this);
    }

    /**
     * Registers keyboard listeners handled by this controller.
     *
     * Listener registration is idempotent for this instance: any previously
     * registered `keyup` handler is removed before the current bound handler is
     * added again. Listeners are attached to `window`.
     *
     * @returns Nothing. The controller starts receiving global keyboard events.
     */
    bindEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Removes keyboard listeners registered by this controller.
     *
     * This detaches the controller's bound `keyup` listener from `window`. It is
     * safe to call even when listeners are not currently registered.
     *
     * @returns Nothing. Keyboard shortcuts handled by this controller are disabled.
     */
    destroyEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Handles keyboard shortcuts on key release.
     *
     * Currently supported shortcuts:
     * - `s`: cycles to the next predefined map style in
     *   `MapStyle.availableStyles`, wrapping to the first style after the last.
     *   After the style is changed, every existing layer is marked render-info
     *   dirty so style-dependent rendering state is refreshed.
     *
     * All other keys are ignored.
     *
     * @param event Keyboard event fired on key release.
     * @returns Nothing. Supported shortcuts update shared style state and layer invalidation flags.
     */
    keyUp(event: KeyboardEvent) {
        if (event.key.toLowerCase() === 's') {
            const styles: string[] = MapStyle.availableStyles;
            const current = MapStyle.currentStyle;

            const id = (styles.indexOf(current) + 1) % styles.length;
            MapStyle.setPredefinedStyle(styles[id]);

            for (const layer of this._map.layerManager.layers) {
                layer.makeLayerRenderInfoDirty();
            }
        }
    }
}
