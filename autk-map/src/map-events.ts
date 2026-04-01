import { MapEvent, MapEventListener } from './constants';

/**
 * Class to handle map events.
 * It allows adding, removing, and emitting events for map interactions.
 */
export class MapEvents {
    /**
     * Listeners for each map event.
     * @type {Object<string, MapEventListener[]>}
     */
    private _listeners: { [event: string]: MapEventListener[] } = {};

    /**
     * Constructor for MapEvents
     * @param {MapEvent[]} events - The list of map events to initialize.
     */
    constructor(events: MapEvent[]) {
        events.forEach(event => {
            this._listeners[event] = [];
        });
    }

    /**
     * Adds an event listener for a specific map event.
     * @param {MapEvent} event - The event to listen for.
     * @param {MapEventListener} listener - The listener function to call when the event is emitted.
     */
    public addListener(event: MapEvent, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event].push(listener);
        }
    }

    /**
     * Removes an event listener for a specific map event.
     * @param {MapEvent} event - The event to stop listening for.
     * @param {MapEventListener} listener - The listener function to remove.
     */
    public removeListener(event: MapEvent, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
        }
    }

    /**
     * Emits an event with the provided selection and layer ID.
     * @param {MapEvent} event - The event to emit.
     * @param {number[]} selection - The selection data to pass to the listeners.
     * @param {string} layerId - The ID of the layer associated with the event.
     */
    public emit(event: MapEvent, selection: number[], layerId: string): void {
        if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener({ selection, layerId }));
        }
    }
}
