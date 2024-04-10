import { LayerGeometryType, LayerPhysicalType, RenderStyle } from './constants';

import Renderer from './renderer';

export default abstract class Layer {
    // layer id
    protected _id: string;
    // layer geometry type
    protected _type: LayerGeometryType;
    // physical layer type
    protected _physical: LayerPhysicalType;

    // render styles available
    protected _renderStyle: RenderStyle;

    // picking shader
    protected _picking: boolean;

    get id() {
        return this._id;
    }

    constructor(id: string, type: LayerGeometryType, physical: LayerPhysicalType, renderStyle: RenderStyle, picking: boolean = false) {
        this._id = id;
        this._type = type;
        this._physical = physical;
        this._renderStyle = renderStyle;
        this._picking = picking;
    }

    abstract buildRenderPass(renderer: Renderer): void;

    abstract setRenderPass(): void;
}