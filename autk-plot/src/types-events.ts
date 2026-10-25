import type { SelectionData } from '@urban-toolkit/autk-core';

import type { FeatureShare } from './types-provenance';

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
 * Extends the shared `SelectionData` shape from `autk-core`, so consumers that
 * only read `selection` (e.g. `AutkMap`) keep working.
 */
export type PlotEventData = SelectionData & {
    /**
     * Share of each selected feature covered by the selected marks. Present when
     * the plot aggregates rows, so a receiving one-to-one plot can draw only
     * that part of each feature's mark.
     */
    shares?: FeatureShare[];
};

/**
 * Event map consumed by the typed plot event emitter.
 *
 * Each plot interaction event resolves to a `PlotEventData` payload.
 */
export type PlotEventRecord = Record<PlotEvent, PlotEventData>;
