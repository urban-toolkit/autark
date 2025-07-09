import { MapStyle } from './map-style';
import { AutkMap } from './autk-map';
import { AutkMapUi } from './autk-map-ui';

export class KeyEvents {
    private _map!: AutkMap

    constructor(map: AutkMap) {
        this._map = map;
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
            if (!AutkMapUi.currentLayer) {
                return;
            }

            const layerInfo = AutkMapUi.currentLayer.layerInfo;
            const renderInfo = AutkMapUi.currentLayer.layerRenderInfo;

            this._map.updateRenderInfoIsColorMap(layerInfo.id, !renderInfo.isColorMap);
            AutkMapUi.currentLayer.makeLayerRenderInfoDirty();
        }

        if (event.key === 'h' || event.key === 'v') {
            if (!AutkMapUi.currentLayer) {
                return;
            }

            console.log(`Toggling skip for layer: ${AutkMapUi.currentLayer.layerInfo.id}`);

            const layerInfo = AutkMapUi.currentLayer.layerInfo;
            const renderInfo = AutkMapUi.currentLayer.layerRenderInfo;
            this._map.updateRenderInfoSkip(layerInfo.id, !renderInfo.isSkip);

            // Turn off picking as well
            if(renderInfo.isSkip)
                this._map.updateRenderInfoPick(layerInfo.id, false);

            AutkMapUi.currentLayer.makeLayerRenderInfoDirty();
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
