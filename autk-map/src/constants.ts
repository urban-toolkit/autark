export {
    LayerType,
    NormalizationMode,
    NormalizationConfig,
    ColorMapInterpolator,
    ColorHEX,
    ColorRGB,
    ColorTEX,
    BoundingBox,
} from 'autk-types';

/**
 * Map events for interaction.
 * @property {string} PICK - Event triggered when a feature is picked.
 */
export enum MapEvent {
  PICK = 'pick',
}

/**
 * Thematic aggregation levels for thematic data.
 * @property {string} AGGREGATION_POINT - Represents aggregation at the point level.
 * @property {string} AGGREGATION_PRIMITIVE - Represents aggregation at the primitive level.
 * @property {string} AGGREGATION_COMPONENT - Represents aggregation at the component level.
 */
export enum ThematicAggregationLevel {
  AGGREGATION_POINT = 'aggregationPoint',
  AGGREGATION_PRIMITIVE = 'aggregationPrimitive',
  AGGREGATION_COMPONENT = 'aggregationComponent',
}

/**
 * Mouse status for interaction state.
 * @property {string} MOUSE_IDLE - Mouse is idle.
 * @property {string} MOUSE_DRAG - Mouse is dragging.
 */
export enum MouseStatus {
  MOUSE_IDLE = 'mouseIdle',
  MOUSE_DRAG = 'mouseDrag',
}

/**
 * Map event listener type.
 * @param {number[]} selection - The selected feature identifiers.
 * @param {string} layerId - The ID of the layer associated with the event.
 */
export type MapEventListener = (
    selection: number[],
    layerId: string
) => void;
