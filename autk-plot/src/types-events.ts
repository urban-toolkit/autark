import type { SelectionData } from '@urban-toolkit/autk-core';

import type { AutkDatum } from './types-plot';
import type { SelectionShares } from './types-provenance';

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
    /** Emitted when the mouse enters or leaves a mark. */
    HOVER = 'hover',
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
     * Selected series and/or coverage of each selected feature, keyed by source
     * feature index. A receiving plot can restrict matches to selected series
     * and draw partial marks when coverage is available.
     */
    shares?: SelectionShares;
    /** Present on brush events; `null` means the emitting brush was cleared. */
    extent?: BrushExtent | null;
};

/** The data interval or ordered keys covered on one axis. */
export type BrushAxisExtent =
    | { kind: 'numeric'; range: [number, number] }
    | { kind: 'categorical'; keys: string[] };

/** Bounds of the brush that emitted an event, separate from the combined selection. */
export type BrushExtent = {
    /** Bounds in the brush group's local SVG coordinates, on the brushed axes only. */
    pixels: Partial<Record<'x' | 'y', [number, number]>>;
    /** Data bounds on axes whose scales are available. */
    data?: Partial<Record<'x' | 'y', BrushAxisExtent>>;
    /** The named dimension for brushes on their own axes (e.g. parallel coordinates). */
    dimension?: string;
};

/**
 * Event map consumed by the typed plot event emitter.
 *
 * Each plot interaction event resolves to a `PlotEventData` payload.
 */
export type PlotEventRecord = {
    [PlotEvent.CLICK]: PlotEventData;
    [PlotEvent.HOVER]: PlotHoverEventData;
} & Record<PlotEvent.BRUSH | PlotEvent.BRUSH_X | PlotEvent.BRUSH_Y, PlotEventData & { extent: BrushExtent | null }>;

/** Hovered source IDs and rendered mark data; an empty selection and `null` clear hover. */
export type PlotHoverEventData = SelectionData & { datum: AutkDatum | null };
