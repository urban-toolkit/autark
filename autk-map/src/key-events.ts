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
         if (event.key === 't') {
            if (!this._map.ui.currentLayer) {
                return;
            }

            const layerInfo = this._map.ui.currentLayer.layerInfo;
            const renderInfo = this._map.ui.currentLayer.layerRenderInfo;

            this._map.updateRenderInfoProperty(layerInfo.id, 'isColorMap', !renderInfo.isColorMap);
            this._map.ui.currentLayer.makeLayerRenderInfoDirty();
        }

        if (event.key === 'h' || event.key === 'v') {
            if (!this._map.ui.currentLayer) {
                return;
            }

            const layerInfo = this._map.ui.currentLayer.layerInfo;
            const renderInfo = this._map.ui.currentLayer.layerRenderInfo;

            this._map.updateRenderInfoProperty(layerInfo.id, 'isSkip', !renderInfo.isSkip);

            // Turn off picking as well
            if(renderInfo.isSkip)
                this._map.updateRenderInfoProperty(layerInfo.id, 'isPick', false);

            this._map.ui.currentLayer.makeLayerRenderInfoDirty();
        }

        if (event.key == 's') {
            const styles = ['default', 'light'];
            const current = MapStyle.currentStyle;

            const id = (styles.indexOf(current) + 1) % 3;
            MapStyle.setPredefinedStyle(styles[id]);

            for (const layer of this._map.layerManager.layers) {
                layer.makeLayerRenderInfoDirty();
            }
        }
    }
}
