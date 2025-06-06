import { MapStyle } from './map-style';
import { UtkMap } from './utk-map';
import { Layer } from './layer';

export class KeyEvents {
    private _map!: UtkMap;
    private _currentLayer!: Layer;

    constructor(utkMap: UtkMap) {
        this._map = utkMap;
    }

    bindEvents(): void {
        document.removeEventListener('keyup', this.keyUp.bind(this), false);
        document.addEventListener('keyup', this.keyUp.bind(this), false);
    }

    changeLayer(layer: Layer): void {
        this._currentLayer = layer;
        console.log(`Current layer: ${this._currentLayer.layerInfo.id}`);

        // Turn off picking for all layers
        this._map.layerManager.layers.forEach(layer => {
            if(layer.layerInfo.id == this._currentLayer.id)
                return;
            this._map.updateRenderInfoPick(layer.layerInfo.id, false);
            layer.makeLayerRenderInfoDirty();
        });

        // Setting pick to true
        this._map.updateRenderInfoPick(this._currentLayer.layerInfo.id, true);
        this._currentLayer.makeLayerRenderInfoDirty();
    }

    /**
     * Handles key up event
     * @param {KeyboardEvent} event The fired event
     */
    async keyUp(event: KeyboardEvent) {
        if (event.key === 'ArrowUp') {
            if(this._map.layerManager.layers.length === 0) {
                return;
            }

            let id = this._map.layerManager.layers.indexOf(this._currentLayer);
            id = (id + 1) % this._map.layerManager.layers.length;
            this.changeLayer(this._map.layerManager.layers[id]);
        }

        if (event.key === 'ArrowDown') {
            if(this._map.layerManager.layers.length === 0) {
                return;
            }

            let id = this._map.layerManager.layers.indexOf(this._currentLayer);

            id = (id - 1) % this._map.layerManager.layers.length;
            id = id < 0 ? this._map.layerManager.layers.length - 1: id;
            this.changeLayer(this._map.layerManager.layers[id]);
        }

        if (event.key === 't') {
            if (!this._currentLayer) {
                return;
            }

            const layerInfo = this._currentLayer.layerInfo;
            const renderInfo = this._currentLayer.layerRenderInfo;

            this._map.updateRenderInfoIsColorMap(layerInfo.id, !renderInfo.isColorMap);
            this._currentLayer.makeLayerRenderInfoDirty();
        }

        if (event.key === 'h' || event.key === 'v') {
            if (!this._currentLayer) {
                return;
            }

            console.log(`Toggling skip for layer: ${this._currentLayer.layerInfo.id}`);

            const layerInfo = this._currentLayer.layerInfo;
            const renderInfo = this._currentLayer.layerRenderInfo;
            this._map.updateRenderInfoSkip(layerInfo.id, !renderInfo.isSkip);

            // Turn off picking as well
            if(renderInfo.isSkip)
                this._map.updateRenderInfoPick(layerInfo.id, false);

            this._currentLayer.makeLayerRenderInfoDirty();
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
