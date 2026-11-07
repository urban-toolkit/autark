/**
 * @module AutkMapEvents
 * Typed event definitions for `@urban-toolkit/autk-map` interaction and picking signals.
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
  /** The feature under the pointer, emitted as the pointer moves over the map once hover is enabled. */
  HOVER = 'hover',
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

import type { SelectionData } from '@urban-toolkit/autk-core';

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
 * Payload emitted when the pointer rests over, or leaves, a feature of the pick layer.
 *
 * It is emitted only after `AutkMap.setHover(true)`, at most about ten times a second while the pointer moves, and
 * once with `id: null` when the pointer leaves the canvas, starts a drag or zooms.
 */
export interface HoverEventData {
  /** Identifier of the layer that was read, or an empty string when there is none. */
  layerId: string;
  /** Component id (the feature's position in its layer) under the pointer, or `null` when there is none. */
  id: number | null;
  /** Pointer position relative to the canvas, in CSS pixels. */
  x: number;
  /** Pointer position relative to the canvas, in CSS pixels. */
  y: number;
}

/**
 * Typed event-bus payload map for `MapEvent` listeners.
 */
export type MapEventRecord = {
  [MapEvent.PICKING]: MapEventData;
  [MapEvent.HOVER]: HoverEventData;
};
