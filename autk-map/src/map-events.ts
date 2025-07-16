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
     * @param {string} event - The name of the event to listen for.
     * @param {MapEventListener} listener - The listener function to call when the event is emitted.
     */
    public addEventListener(event: string, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event].push(listener);
        }
    }

    /**
     * Removes an event listener for a specific map event.
     * @param {string} event - The name of the event to stop listening for.
     * @param {MapEventListener} listener - The listener function to remove.
     */
    public removeEventListener(event: string, listener: MapEventListener): void {
        if (this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(l => l !== listener);
        }
    }

    /**
     * Emits an event with the provided selection and layer ID.
     * @param {string} event - The name of the event to emit.
     * @param {number[] | string[]} selection - The selection data to pass to the listeners.
     * @param {string} layerId - The ID of the layer associated with the event.
     */
    public emit(event: string, selection: number[] | string[], layerId: string): void {
        if (this._listeners[event]) {
            this._listeners[event].forEach(listener => listener(selection, layerId));
        }
    }
}
