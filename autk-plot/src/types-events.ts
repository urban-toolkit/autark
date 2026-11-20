import type { SelectionData } from '@urban-toolkit/autk-core';

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
export type PlotEventData = SelectionData & {
    /** For brush events: the brushed box in data units. Absent when the brush was cleared, or the plot cannot invert its scales. */
    extent?: BrushExtent;
    /** For brush events: `start` and `brush` while dragging, `end` when the pointer is released or the brush is cleared. */
    phase?: 'start' | 'brush' | 'end';
};

/**
 * A brushed box in data units. A brush along one axis (`brushX`, `brushY`) gives only that axis.
 * Plots that place points by rank (the line chart) give the rank, and the raw bucket keys at its ends in `xBucket`.
 */
export type BrushExtent = {
    x?: [number, number];
    y?: [number, number];
    xBucket?: [string, string];
};

/**
 * Event map consumed by the typed plot event emitter.
 *
 * Each plot interaction event resolves to a `PlotEventData` payload.
 */
export type PlotEventRecord = Record<PlotEvent, PlotEventData>;
