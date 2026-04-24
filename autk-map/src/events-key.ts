import { AutkMap } from './map';
import { MapStyle } from './map-style';

/**
 * KeyEvents class handles keyboard interactions with the map.
 * It allows toggling layer properties and changing map styles using keyboard shortcuts.
 */
export class KeyEvents {
    /**
     * Reference to the owning map instance.
     */
    private _map!: AutkMap;
    /** Bound keyup handler reference used for safe add/remove listener calls. */
    private _onKeyUp: (event: KeyboardEvent) => void;

    /**
     * Creates a keyboard interaction controller for a map instance.
     *
     * @param map - Map instance whose state and style are controlled by keyboard shortcuts.
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._onKeyUp = this.keyUp.bind(this);
    }

    /**
     * Registers keyboard listeners handled by this controller.
     *
     * @returns Nothing. Existing listener bindings are replaced.
     */
    bindEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Removes keyboard listeners registered by this controller.
     *
     * @returns Nothing. Registered listeners are detached from `window`.
     */
    destroyEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Handles keyboard shortcuts on key release.
     *
     * Currently supported shortcuts:
     * - `s`: cycle through predefined map styles and mark all layers dirty
     *   so their render state is refreshed.
     *
     * @param event - Fired keyboard event.
     * @returns Nothing. Matching shortcuts update map style or layer state.
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
