import { AutkMap } from './main';
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
    private _map!: AutkMap

    /**
     * Constructor for KeyEvents
     * @param {AutkMap} map The map instance
     */
    constructor(map: AutkMap) {
        this._map = map;
    }

    /**
     * Key events binding function
     */
    public bindEvents(): void {
        document.removeEventListener('keyup', this.keyUp.bind(this), false);
        document.addEventListener('keyup', this.keyUp.bind(this), false);
    }

    /**
     * Handles key up event
     * @param {KeyboardEvent} event The fired event
     */
    async keyUp(event: KeyboardEvent) {
        if (event.key == 's') {
            const styles = ['default', 'light'];
            const current = MapStyle.currentStyle;

            const id = (styles.indexOf(current) + 1) % 3;
            MapStyle.setPredefinedStyle(styles[id]);

            for (const layer of this._map.layerManager.vectorLayers) {
                layer.makeLayerRenderInfoDirty();
            }
        }
    }
}
