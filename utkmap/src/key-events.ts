import { MapStyle } from './map-style';
import { UtkMap } from './utk-map';
import { UtkMapUi } from './utk-map-ui';

export class KeyEvents {
    private _map!: UtkMap

    constructor(utkMap: UtkMap) {
        this._map = utkMap;
    }

    bindEvents(): void {
        document.removeEventListener('keyup', this.keyUp.bind(this), false);
        document.addEventListener('keyup', this.keyUp.bind(this), false);
    }

    /**
     * Handles key up event
     * @param {KeyboardEvent} event The fired event
     */
    async keyUp(event: KeyboardEvent) {
         if (event.key === 't') {
            if (!UtkMapUi.currentLayer) {
                return;
            }

            const layerInfo = UtkMapUi.currentLayer.layerInfo;
            const renderInfo = UtkMapUi.currentLayer.layerRenderInfo;

            this._map.updateRenderInfoIsColorMap(layerInfo.id, !renderInfo.isColorMap);
            UtkMapUi.currentLayer.makeLayerRenderInfoDirty();
        }

        if (event.key === 'h' || event.key === 'v') {
            if (!UtkMapUi.currentLayer) {
                return;
            }

            console.log(`Toggling skip for layer: ${UtkMapUi.currentLayer.layerInfo.id}`);

            const layerInfo = UtkMapUi.currentLayer.layerInfo;
            const renderInfo = UtkMapUi.currentLayer.layerRenderInfo;
            this._map.updateRenderInfoSkip(layerInfo.id, !renderInfo.isSkip);

            // Turn off picking as well
            if(renderInfo.isSkip)
                this._map.updateRenderInfoPick(layerInfo.id, false);

            UtkMapUi.currentLayer.makeLayerRenderInfoDirty();
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
