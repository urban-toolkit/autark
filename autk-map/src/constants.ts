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
 * @property {string} PICKING - Event triggered when a feature is picked.
 */
export enum MapEvent {
  PICKING = 'pick',
}

/**
 * Thematic aggregation levels for thematic data.
 * @property {string} POINT - Represents aggregation at the point level.
 * @property {string} PRIMITIVE - Represents aggregation at the primitive level.
 * @property {string} COMPONENT - Represents aggregation at the component level.
 */
export enum ThematicAggregationLevel {
  POINT = 'aggregationPoint',
  PRIMITIVE = 'aggregationPrimitive',
  COMPONENT = 'aggregationComponent',
}

/**
 * Mouse status for interaction state.
 * @property {string} IDLE - Mouse is idle.
 * @property {string} DRAG - Mouse is dragging.
 */
export enum MouseStatus {
  IDLE = 'mouseIdle',
  DRAG = 'mouseDrag',
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
