import { ILayerData } from "./interfaces";

import Layer from "./layer";
import PassIndexFlat from "./pass-index-flat";
import Renderer from "./renderer";

export default class TrianglesLayer extends Layer {
    protected _positions: Float32Array;
    protected _colors: Float32Array;
    protected _indices: Uint16Array;

    protected _pass!: PassIndexFlat;

    constructor(layerInfo: ILayerData, picking: boolean = false) {
        super(layerInfo.id, layerInfo.type, layerInfo.physical, layerInfo.renderStyle, picking);

        this._positions = new Float32Array([
            1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0
        ])
        this._colors = new Float32Array([
            1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0
        ]);
        this._indices = new Uint16Array([
            0, 1, 2
        ]);
    }

    buildRenderPass(renderer: Renderer) {
        this._pass = new PassIndexFlat(renderer);
        this._pass.build({
            positions: this._positions,
            colors: this._colors,
            indices: this._indices
        });
    }

    setRenderPass() {
        this._pass.setRenderPass();
    }
}