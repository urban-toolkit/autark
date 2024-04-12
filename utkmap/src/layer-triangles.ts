import { ILayerData, ILayerGeometry, ILayerInfo, ILayerRenderInfo, ILayerThematic } from "./interfaces";

import { Layer } from "./layer";
import { ColorMap } from "./colormap";
import { MapStyle } from "./map-style";
import { Renderer } from "./renderer";
import { PipelineTriangleFlat } from "./pipeline-triangle-flat";
import { ThematicAggregationLevel } from "./constants";
import { Camera } from "./camera";

export class TrianglesLayer extends Layer {
    protected _position!: Float32Array;
    protected _thematic!: Float32Array;
    protected _indices!: Uint16Array;

    protected _components: { nPoints: number, nTriangles: number }[] = [];

    protected _pipeline!: PipelineTriangleFlat;

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData) {
        super(layerInfo, layerRenderInfo);
        this.loadData(layerData);
    }

    get position(): Float32Array {
        return this._position;
    }

    get thematic(): Float32Array {
        return this._thematic;
    }

    get indices(): Uint16Array {
        return this._indices;
    }

    loadData(layerData: ILayerData) {
        this.loadGeometry(layerData.geometry);

        if (layerData.thematic.length) {
            this.loadThematic(layerData.thematic);
        }
    }

    loadGeometry(layerGeometry: ILayerGeometry[]): void {
        const position = [];
        const indices = [];

        for (let id = 0; id < layerGeometry.length; id++) {
            position.push(...layerGeometry[id].position);

            if (layerGeometry[id].indices !== undefined) {
                const fix = layerGeometry[id].indices?.map(a => a + indices.length)
                indices.push(...<Uint16Array>fix);
            }

            const component = {
                nPoints: position.length / 3,
                nTriangles: indices.length / 3,
            }
            this._components.push(component);
        }

        this._position = new Float32Array(position);
        this._indices = new Uint16Array(indices);
        this._thematic = new Float32Array(0);
    }

    loadThematic(layerThematic: ILayerThematic[]): void {
        const thematic = [];
        for (let compId = 0; compId < layerThematic.length; compId++) {
            switch (layerThematic[compId].level) {
                case ThematicAggregationLevel.AGGREGATION_POINT:
                    thematic.push(...this.aggregateThematicPoint(layerThematic[compId]));
                    break;
                case ThematicAggregationLevel.AGGREGATION_PRIMITIVE:
                    thematic.push(...this.aggregateThematicPrimitive(compId, layerThematic[compId]));
                    break;
                case ThematicAggregationLevel.AGGREGATION_COMPONENT:
                    thematic.push(...this.aggregateThematicComponenet(compId, layerThematic[compId]));
                    break;
                default:
                    console.error(`Unknown thematic layer aggregation type: ${layerThematic[compId].level}.`);
                    break;
            }
        }
        this._thematic = new Float32Array(thematic);
    }

    buildPipeline(renderer: Renderer, camera: Camera) {
        this._pipeline = new PipelineTriangleFlat(renderer);
        this._pipeline.build(this, camera, {
            color: MapStyle.getColor(this._info.typePhysical),
            colorMap: ColorMap.getColorMap(this._renderInfo.colorMapInterpolator),
            isColorMap: <boolean>this._renderInfo.isColorMap
        });
    }

    setRenderPass() {
        this._pipeline.setRenderPass();
    }

    private aggregateThematicPoint(layerThematic: ILayerThematic): Float32Array {
        return layerThematic.values;
    }

    private aggregateThematicPrimitive(component: number, layerThematic: ILayerThematic): Float32Array {
        // component points: start/end indices and number of points 
        const sPoint = (component > 0 ? this._components[component - 1].nPoints : 0);
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        // component triangles: start/end indices 
        const sTriangle = (component > 0 ? this._components[component - 1].nTriangles : 0);
        const eTriangle = this._components[component].nTriangles;

        const thematic = new Float32Array(nPoint);

        for (let id = 3 * sTriangle; id < 3 * eTriangle; id++) {
            const vid = this._indices[id] - sPoint;
            const tid = Math.floor(id / 3) - sTriangle;

            thematic[vid] = layerThematic.values[tid];
        }

        return thematic;
    }

    private aggregateThematicComponenet(component: number, layerThematic: ILayerThematic): Float32Array {
        const sPoint = (component > 0 ? this._components[component - 1].nPoints : 0);
        const ePoint = this._components[component].nPoints;
        const nPoint = ePoint - sPoint;

        const thematic = new Float32Array(nPoint);

        for (let vId = 0; vId < nPoint; vId++) {
            thematic[vId] = layerThematic.values[0];
        }

        return thematic;
    }
}