import { AutkMap } from './map';
import { MapStyle } from './map-style';

/**
 * KeyEvents class handles keyboard interactions with the map.
 * It allows toggling layer properties and changing map styles using keyboard shortcuts.
 */
export class KeyEvents {
    /**
     * Reference to the AutkMap instance.
     * @type {AutkMap}
     */
    private _map!: AutkMap;
    /** Bound keyup handler reference used for safe add/remove listener calls. */
    private _onKeyUp: (event: KeyboardEvent) => void;

    /**
     * Constructor for KeyEvents
     * @param {AutkMap} map The map instance
     */
    constructor(map: AutkMap) {
        this._map = map;
        this._onKeyUp = this.keyUp.bind(this);
    }

    /**
     * Key events binding function
     */
    bindEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Removes keyboard listeners registered by this controller.
     */
    destroyEvents(): void {
        window.removeEventListener('keyup', this._onKeyUp, false);
    }

    /**
     * Handles key up event
     * @param {KeyboardEvent} event The fired event
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
