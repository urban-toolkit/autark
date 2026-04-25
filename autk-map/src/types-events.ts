/**
 * @module AutkMapEvents
 * Typed event definitions for `autk-map` interaction and picking signals.
 *
 * This module defines the event names, payload shapes, and event-bus record
 * used by the map's public interaction API. It covers pointer-driven picking
 * notifications and the mouse state values used by event controllers to track
 * drag lifecycle.
 */

/**
 * Event names emitted by the map interaction bus.
 */
export enum MapEvent {
  /** Selection payload emitted when features are picked from a layer. */
  PICKING = 'picking',
}

/**
 * Mouse interaction states tracked by map event handlers.
 */
export enum MouseStatus {
  /** Pointer input is idle and not dragging the map. */
  IDLE = 'mouseIdle',
  /** Pointer input is actively dragging the map. */
  DRAG = 'mouseDrag',
}

import type { SelectionData } from 'autk-core';

/**
 * Payload emitted for feature-picking events.
 *
 * The payload extends the shared selection data shape with the identifier of
 * the layer that produced the hit results.
 */
export interface MapEventData extends SelectionData {
    /** Identifier of the layer that emitted the event. */
    layerId: string;
}

/**
 * Typed event-bus payload map for `MapEvent` listeners.
 */
export type MapEventRecord = Record<MapEvent, MapEventData>;
