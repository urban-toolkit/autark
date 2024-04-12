import { ILayerInfo, ILayerRenderInfo } from "utkmap/src/interfaces"
import { LayerGeometryType, LayerPhysicalType, RenderPipeline, ColorMapInterpolators, ThematicAggregationLevel } from "utkmap/src/constants"

export const layerInfo: ILayerInfo = {
    id: 'roads.osm',
    typeGeometry: LayerGeometryType.TRIGMESH_LAYER,
    typePhysical: LayerPhysicalType.WATER_LAYER,
}

export const layerRenderInfo: ILayerRenderInfo = {
    pipeline: RenderPipeline.TRIANGLE_FLAT,
    colorMapInterpolator: ColorMapInterpolators.INTERPOLATE_BLUES,
    isColorMap: true,
    isPicking: false
}

export const layerData = {
    geometry: [{
        position: new Float32Array([
            0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0
        ]),
        indices: new Uint16Array([
            0, 1, 2
        ])
    },
    {
        position: new Float32Array([
            0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0, -0.5, 0.0,
            0.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0,  0.5, 0.0
        ]),
        indices: new Uint16Array([
            0, 1, 2,
            3, 4, 5
        ])
    },
    {
        position: new Float32Array([
            0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, -0.5, 0.0
        ]),
        indices: new Uint16Array([
            0, 1, 2
        ])
    }],
    thematic: [{
        aggregation: ThematicAggregationLevel.AGGREGATION_POINT,
        values: new Float32Array([
            1.0, 0.5, 0.0
        ]),
    },
    {
        aggregation: ThematicAggregationLevel.AGGREGATION_PRIMITIVE,
        values: new Float32Array([
            1.0, 0.0
        ]),
    },
    {
        aggregation: ThematicAggregationLevel.AGGREGATION_COMPONENT,
        values: new Float32Array([
            0.75
        ]),
    }]
}
