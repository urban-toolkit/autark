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
     * Multiple registrations of the same callback are allowed and treated as separate entries.
     *
     * @param event Event name to subscribe to.
     * @param listener Callback invoked when the event fires.
     * @throws Never throws.
     * @example
     * emitter.on('pick', ({ selection, layerId }) => console.log(selection));
     */
    on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event]!.push(listener);
    }

    /**
     * Removes a previously registered listener by reference.
     *
     * @param event Event name to unsubscribe from.
     * @param listener Exact listener reference to remove.
     * @throws Never throws.
     * @example
     * const handler = (e) => console.log(e);
     * emitter.on('pick', handler);
     * emitter.off('pick', handler);
     */
    off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
        const arr = this._listeners[event];
        if (arr) {
            this._listeners[event] = arr.filter(l => l !== listener) as typeof arr;
        }
    }

    /**
     * Dispatches an event payload to all registered listeners synchronously.
     *
     * @param event Event name to dispatch.
     * @param payload Payload passed to each listener.
     * @throws Never throws. Listener errors propagate to the caller.
     * @example
     * emitter.emit('pick', { selection: [1, 2], layerId: 'buildings' });
     */
    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        this._listeners[event]?.forEach(l => l(payload));
    }
}
