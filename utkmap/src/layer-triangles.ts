import { ILayerData, ILayerGeometry, ILayerInfo, ILayerThematic } from "./interfaces";

import Layer from "./layer";
import Renderer from "./renderer";
import PassIndexFlat from "./pass-index-flat";
import { ThematicAggregationLevel } from "./constants";

export default class TrianglesLayer extends Layer {
    protected _position!: Float32Array;
    protected _thematic!: Float32Array;
    protected _indices!: Uint16Array;
    protected _components: number[]  = [];

    protected _pass!: PassIndexFlat;

    constructor(layerInfo: ILayerInfo, layerData: ILayerData, picking: boolean = false) {
        super(layerInfo, picking);
        this.loadData(layerData);
    }

    loadData(layerData: ILayerData) {
        this.loadGeometry(layerData.geometry);
        this.loadThematic(layerData.thematic);

        console.log(this._position);
        console.log(this._thematic);
        console.log(this._indices);
    }

    loadGeometry(layerGeometry: ILayerGeometry[]): void {
        const position = [];
        const indices  = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            position.push(...layerGeometry[id].position);

            if(layerGeometry[id].indices !== undefined) {
                const fix = layerGeometry[id].indices?.map(a => a + indices.length)
                indices.push(...<Uint16Array>fix);

                this._components.push(indices.length / 3)
            }
        }

        this._position = new Float32Array(position);
        this._indices  = new Uint16Array(indices);
        this._thematic = new Float32Array(0);

        console.log(this._components);
    }
    
    loadThematic(layerThematic: ILayerThematic[]): void {
        const thematic = [];

        for (let id = 0; id < layerThematic.length; id++) {
            switch (layerThematic[id].aggregation) {
                case ThematicAggregationLevel.AGGREGATION_POINT:
                    thematic.push(...this.aggregateThematicPoint(layerThematic[id]));
                break;
                case ThematicAggregationLevel.AGGREGATION_PRIMITIVE:
                    thematic.push(...this.aggregateThematicPrimitive(id, layerThematic[id]));
                break;
                case ThematicAggregationLevel.AGGREGATION_COMPONENT:
                    thematic.push(...this.aggregateThematicComponenet(id, layerThematic[id]));
                break;
                default:
                    console.error(`Unknown thematic layer aggregation type: ${layerThematic[id].aggregation}.`);
                break;
            }
        }

        this._thematic = new Float32Array(thematic);
    }

    buildRenderPass(renderer: Renderer) {
        this._pass = new PassIndexFlat(renderer);
        this._pass.build({
            positions: this._position,
            colors: new Float32Array([
                1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0,
                1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0,
                1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0
            ]),
            indices: this._indices
        });
    }

    setRenderPass() {
        this._pass.setRenderPass();
    }

    private aggregateThematicPoint(layerThematic: ILayerThematic): Float32Array {
        return layerThematic.values;
    }

    private aggregateThematicPrimitive(component: number, layerThematic: ILayerThematic): Float32Array {
        const thematic = new Float32Array(this._position.length / 3);

        const lower = component > 0 ? component - 1 : 0

        for(let id = 3 * lower; id < 3 * this._components[component]; id++) {
            const vid = this._indices[id];
            const tid = id / 3;

            thematic[vid] = layerThematic.values[tid];
        }

        return thematic;
    }

    private aggregateThematicComponenet(component: number, layerThematic: ILayerThematic): Float32Array {
        const thematic = new Float32Array(this._position.length / 3);

        const lower = component > 0 ? component - 1 : 0

        for(let vid = 0, id = 3 * lower; id < 3 * this._components[component]; vid++, id++) {
            thematic[id] = layerThematic.values[0];
        }

        return thematic;
    }
}