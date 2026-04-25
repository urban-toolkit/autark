/**
 * @module EventEmitter
 * A lightweight, type-safe event emitter for custom application events.
 *
 * This module provides a generic event bus keyed by an event record, along with
 * a shared selection payload used across visualization packages. It exposes the
 * minimal `on`, `off`, and `emit` lifecycle needed to register listeners,
 * remove them by reference, and dispatch typed payloads synchronously.
 */

/** Listener callback for a single typed event payload. */
export type EventListener<T> = (event: T) => void;

/**
 * Base payload shared by selection-driven visualization events.
 *
 * Packages such as `autk-map` and `autk-plot` extend or alias this shape so
 * selection interactions follow a consistent contract across the toolkit.
 */
export interface SelectionData {
    /** Source feature indices included in the current selection. */
    selection: number[];
}

/**
 * Type-safe event emitter keyed by an event record.
 *
 * Each event name maps to a specific payload type, and listeners are stored per
 * event key. Listener removal requires the original function reference.
 *
 * @template Events Record mapping event names to their payload types.
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
     *
     * Multiple registrations of the same callback are allowed and are treated as
     * separate listener entries.
     *
     * @param event Event name to subscribe to.
     * @param listener Callback invoked when the event fires.
     */
    on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event]!.push(listener);
    }

    /**
     * Removes a previously registered listener.
     *
     * Only the exact function reference passed to {@link on} is removed. If the
     * listener was not registered, the call has no effect.
     *
     * @param event Event name to unsubscribe from.
     * @param listener Exact listener reference to remove.
     */
    off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        const arr = this._listeners[event];
        if (arr) {
            this._listeners[event] = arr.filter(l => l !== listener) as typeof arr;
        }
    }

    /**
     * Dispatches an event payload to all registered listeners.
     *
     * Listeners are invoked synchronously in registration order.
     *
     * @param event Event name to dispatch.
     * @param payload Payload passed to each listener.
     */
    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        this._listeners[event]?.forEach(l => l(payload));
    }
}
