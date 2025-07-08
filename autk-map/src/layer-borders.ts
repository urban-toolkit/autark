import { ILayerData, ILayerInfo, ILayerRenderInfo } from './interfaces';

import { Camera } from './camera';
import { Renderer } from './renderer';

import { FeaturesLayer } from './layer-features';
import { PipelineBorderFlat } from './pipeline-border-flat';

export class BordersLayer extends FeaturesLayer {
    protected _borderPos!: number[];
    protected _borderIds!: number[];

    protected _pipelineBorder!: PipelineBorderFlat;

    constructor(layerInfo: ILayerInfo, layerRenderInfo: ILayerRenderInfo, layerData: ILayerData, dimension: number = 2) {
        super(layerInfo, layerRenderInfo, layerData);
        this._dimension = dimension;

        this.loadData(layerData);
    }

    get borderPos(): number[] {
        return this._borderPos;
    }

    get borderIds(): number[] {
        return this._borderIds;
    }

    createPipeline(renderer: Renderer): void {
        super.createPipeline(renderer);

        this._pipelineBorder = new PipelineBorderFlat(renderer);
        this._pipelineBorder.build(this);
    }

    loadData(layerData: ILayerData): void {
        super.loadData(layerData);

        const borders = layerData.border || [];

        const position: number[] = [];
        const indices: number[] = [];

        for (let id = 0; id < borders.length; id++) {
            // fix the index count
            borders[id].indices.forEach((a) => {
                const b = a + position.length / 3;
                indices.push(b);
            });

            // merges the position data
            borders[id].position.forEach((d, id) => {
                if (this._dimension === 2) {
                    position.push(d);

                    if (id % 2 === 1) {
                        const z = this._layerInfo.zIndex;
                        position.push(z);
                    }
                }

                if (this._dimension === 3) {
                    if (id % 3 === 2) {
                        d += this._layerInfo.zIndex;
                    }

                    position.push(d);
                }
            });
        }

        this._borderPos = position;
        this._borderIds = indices;

    }

    renderPass(camera: Camera): void {
        super.renderPass(camera);
        this._pipelineBorder.renderPass(camera);
    }
}