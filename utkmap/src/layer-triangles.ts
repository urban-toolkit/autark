import { LayerGeometryType, LayerPhysicalType, RenderStyle } from "./constants";

import Layer from "./layer";
import PassIndexFlat from "./pass-index-flat";
import Renderer from "./renderer";

export default class TrianglesLayer extends Layer {
    protected _positions: Float32Array;
    protected _colors: Float32Array;
    protected _indices: Uint16Array;

    protected _pass!: PassIndexFlat;

    constructor(id: string, physical: LayerPhysicalType, renderStyle: RenderStyle, picking: boolean = false) {
        super(id, LayerGeometryType.TRIGMESH_LAYER, physical, renderStyle, picking);

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