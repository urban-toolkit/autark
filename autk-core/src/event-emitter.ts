/**
 * @module EventEmitter
 * A lightweight, type-safe event emitter for handling custom events within the application.
 * It provides a simple `on`, `off`, and `emit` interface for event management.
 */

/**
 * Generic event listener type.
 * @template T - The event payload type.
 */
export type EventListener<T> = (event: T) => void;

/**
 * Base payload shared by all selection-based interaction events.
 *
 * Both map (autk-map) and chart (autk-plot) events extend or alias this type,
 * ensuring a consistent selection contract across all visualization libraries.
 */
export interface SelectionData {
    /** Source feature indices of the current selection. */
    selection: number[];
}

/**
 * A lightweight, type-safe event emitter.
 *
 * @template Events - A record mapping event names to their payload types.
 *
 * @example
 * type MapEvents = { pick: { selection: number[]; layerId: string } };
 * const emitter = new EventEmitter<MapEvents>();
 * emitter.on('pick', ({ selection, layerId }) => console.log(selection, layerId));
 * emitter.emit('pick', { selection: [1, 2], layerId: 'buildings' });
 */
export class EventEmitter<Events extends Record<string, unknown>> {
    private _listeners: { [K in keyof Events]?: Array<EventListener<Events[K]>> } = {};

    /**
     * Registers a listener for the given event.
     * @param event - The event name.
     * @param listener - Callback invoked when the event fires.
     */
    on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event]!.push(listener);
    }

    /**
     * Removes a previously registered listener.
     * @param event - The event name.
     * @param listener - The exact listener reference to remove.
     */
    off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        const arr = this._listeners[event];
        if (arr) {
            this._listeners[event] = arr.filter(l => l !== listener) as typeof arr;
        }
    }

    /**
     * Fires an event, invoking all registered listeners with the given payload.
     * @param event - The event name.
     * @param payload - Data passed to every listener.
     */
    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        this._listeners[event]?.forEach(l => l(payload));
    }
}
