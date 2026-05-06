import type { SelectionData } from './types-core';

/**
 * Interaction events emitted by plot instances.
 *
 * Each event carries a payload with `selection`, where values are source
 * feature ids represented by currently selected marks.
 */
export enum PlotEvent {
    /**
     * Emitted after click-based selection updates.
     */
    CLICK = 'click',
    /**
     * Emitted after 2D rectangular brush interactions.
     */
    BRUSH = 'brush',
    /**
     * Emitted after vertical brush interactions.
     */
    BRUSH_Y = 'brushY',
    /**
     * Emitted after horizontal brush interactions.
     */
    BRUSH_X = 'brushX'
}

/**
 * Payload emitted by all plot interaction events.
 *
 * Reuses the shared `SelectionData` shape from `autk-core`.
 */
export type PlotEventData = SelectionData;

/**
 * Event map consumed by the typed plot event emitter.
 *
 * Each plot interaction event resolves to a `PlotEventData` payload.
 */
export type PlotEventRecord = Record<PlotEvent, PlotEventData>;
