import type { SelectionData } from './core-types';

/**
 * Interaction events emitted by chart instances.
 *
 * Each event carries a payload with `selection`, where values are source
 * feature ids represented by currently selected marks.
 */
export enum ChartEvent {
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

/** Payload emitted by all chart interaction events. */
export type ChartEventData = SelectionData;

/** Event map consumed by the typed chart event emitter. */
export type ChartEventRecord = Record<ChartEvent, ChartEventData>;
