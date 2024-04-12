import { UtkMap } from "./utk-map";

export class KeyEvents {
    private _map!: UtkMap;

    constructor( utkMap: UtkMap) {
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
        if (event.key == "t") {
            const layers = this._map.layerManager.layers;

            for(const layer of layers) {
                const layerInfo = layer.info;                
                const renderInfo = layer.renderInfo;

                renderInfo.isColorMap = !renderInfo.isColorMap;
                this._map.updateRenderInfo(layerInfo, renderInfo);
            }
        }
    }
}