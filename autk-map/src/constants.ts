/**
 * Runtime exports re-exposed from `autk-core` for map styling and normalization.
 */
export {
    NormalizationMode,
    ColorMapInterpolator
} from 'autk-core';

/**
 * Shared type exports re-exposed from `autk-core` for map layer configuration.
 */
export type {
    LayerType,
    SequentialDomain,
    ColorHEX,
    ColorRGB,
    ColorTEX,
    BoundingBox
} from 'autk-core';

/**
 * Map event names emitted by interactive map components.
 */
export enum MapEvent {
  /** Fired when one or more features are picked from a layer. */
  PICKING = 'picking',
}

/**
 * Mouse interaction states tracked by the map.
 */
export enum MouseStatus {
  /** The pointer is not currently dragging the map. */
  IDLE = 'mouseIdle',
  /** The pointer is actively dragging the map. */
  DRAG = 'mouseDrag',
}

/**
 * Payload emitted for feature-picking map events.
 */
export interface MapEventData {
    /** Currently selected feature identifiers for the emitted layer. */
    selection: number[];
    /** Identifier of the layer that emitted the event. */
    layerId: string;
}

/**
 * Event map consumed by the typed map event emitter.
 */
export type MapEventRecord = Record<MapEvent, MapEventData>;
