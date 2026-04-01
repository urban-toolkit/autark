export { 
    NormalizationMode, 
    ColorMapInterpolator 
} from 'autk-types';

export type { LayerType, NormalizationConfig, ColorHEX, ColorRGB, ColorTEX, BoundingBox } from 'autk-types';

/**
 * Map events for interaction.
 * @property {string} PICKING - Event triggered when a feature is picked.
 */
export enum MapEvent {
  PICKING = 'pick',
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
 * @param {object} event - The event object.
 * @param {number[]} event.selection - The selected feature identifiers.
 * @param {string} event.layerId - The ID of the layer associated with the event.
 */
export type MapEventListener = (
    event: { selection: number[]; layerId: string }
) => void;
