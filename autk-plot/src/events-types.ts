/**
 * Interaction events emitted by chart instances.
 *
 * Each event carries a payload with `selection`, where values are source
 * feature ids represented by currently selected marks.
 *
 * Event payload typing is defined in `ChartEventRecord`.
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